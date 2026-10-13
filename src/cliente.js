import { normalizarCnpj, validarLocal } from './cnpj.js';
import { ApipjErro } from './erro.js';
import { Limitador } from './limitador.js';
import { dormir } from './util.js';
import { VERSAO } from './versao.js';

const BASE_PADRAO = 'https://apipj.com.br';
const FORMATOS = ['completo', 'simplificado'];
/** Erros que valeriam para todos os CNPJs seguintes: consultarVarios para na hora. */
const FATAIS = new Set(['unauthorized', 'quota_exceeded']);

/**
 * Cliente da API de CNPJ do apipj (https://apipj.com.br).
 *
 * A chave de API é secreta: use este cliente só no servidor (Node.js, Deno, Bun, funções
 * serverless/edge). Nunca coloque a chave em código que roda no navegador.
 */
export class Apipj {
  /** @type {string|null} */
  #chave;
  /** @type {typeof fetch|null} */
  #fetch;
  #esperaBaseMs;
  #janelaMs;

  /**
   * @param {import('./index.js').OpcoesApipj} [opcoes]
   */
  constructor(opcoes = {}) {
    const {
      chave,
      baseUrl = BASE_PADRAO,
      timeoutMs = 10000,
      tentativas = 3,
      fetch: fetchProprio,
      esperaBaseMs = 1000,
      janelaMs = 60000,
    } = opcoes;
    this.#chave = chave || null;
    this.#fetch = fetchProprio ?? null;
    this.#esperaBaseMs = esperaBaseMs;
    this.#janelaMs = janelaMs;
    /** URL base da API, sem barra no fim. */
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    /** Tempo máximo de cada tentativa, em ms (0 desliga). */
    this.timeoutMs = timeoutMs;
    /** Número máximo de tentativas por chamada (1 = sem repetir). */
    this.tentativas = Math.max(1, Math.floor(Number(tentativas) || 1));
    /**
     * Limites informados pela última consulta autenticada (cabeçalhos X-RateLimit-* e X-Quota-*).
     * @type {import('./index.js').Limites|null}
     */
    this.limites = null;
  }

  /**
   * Consulta os dados cadastrais de um CNPJ (exige chave). Valida o DV localmente antes de chamar.
   *
   * @param {string} cnpj CNPJ numérico ou alfanumérico, com ou sem máscara.
   * @param {{ formato?: 'completo'|'simplificado', signal?: AbortSignal }} [opcoes]
   * @returns {Promise<object|null>} o documento, ou `null` se o CNPJ não está na base (404).
   * @throws {ApipjErro} 400 `invalid_cnpj` (sem chamar a API), 401, 429 `quota_exceeded`,
   *   429 `rate_limited` depois de esgotar as tentativas, 5xx ou falha de rede depois das tentativas.
   */
  async consultar(cnpj, opcoes = {}) {
    const v = validarLocal(cnpj);
    if (!v.valido) throw new ApipjErro(400, 'invalid_cnpj', v.erro, { cnpj: v.cnpj });
    return this.#consultar(v.cnpj, conferirFormato(opcoes.formato), opcoes.signal, null);
  }

  /**
   * Valida formato e DV pela API (`GET /v1/valida/{cnpj}`: sem chave e sem consumo de cota).
   * Para validar offline, use `cnpjValido()`.
   *
   * @param {string} cnpj
   * @param {{ signal?: AbortSignal }} [opcoes]
   * @returns {Promise<import('./index.js').Validacao>}
   */
  async validar(cnpj, opcoes = {}) {
    const c = normalizarCnpj(cnpj);
    if (c.length === 0 || c.length > 32) return validarLocal(c);
    const { res, corpo } = await this.#requisitar(`/v1/valida/${encodeURIComponent(c)}`, { signal: opcoes.signal });
    return exigirJson(res, corpo);
  }

  /**
   * Status do serviço e da base (`GET /v1/status`, sem chave).
   * @param {{ signal?: AbortSignal }} [opcoes]
   * @returns {Promise<import('./index.js').Status>}
   */
  async status(opcoes = {}) {
    const { res, corpo } = await this.#requisitar('/v1/status', { signal: opcoes.signal });
    return exigirJson(res, corpo);
  }

  /**
   * Planos públicos, preços e limites (`GET /v1/plans`, sem chave).
   * @param {{ signal?: AbortSignal }} [opcoes]
   * @returns {Promise<import('./index.js').Planos>}
   */
  async planos(opcoes = {}) {
    const { res, corpo } = await this.#requisitar('/v1/plans', { signal: opcoes.signal });
    return exigirJson(res, corpo);
  }

  /**
   * Consulta vários CNPJs em paralelo, respeitando o limite por minuto do plano
   * (lido de X-RateLimit-*). Entrega `{ cnpj, documento, erro? }` na ordem de conclusão.
   *
   * - CNPJs repetidos (depois de normalizados) são consultados uma vez só.
   * - CNPJs inválidos não chamam a API: saem com `documento: null` e `erro` `invalid_cnpj`.
   * - Erros de um CNPJ (5xx/rede esgotados) saem no próprio item, com `documento: null`.
   * - 401 e cota mensal esgotada (`quota_exceeded`) interrompem o laço lançando `ApipjErro`.
   *
   * @param {Iterable<string>|AsyncIterable<string>} lista
   * @param {{ simultaneas?: number, formato?: 'completo'|'simplificado', rpm?: number, signal?: AbortSignal }} [opcoes]
   * @returns {AsyncGenerator<import('./index.js').ResultadoLote>}
   */
  async *consultarVarios(lista, opcoes = {}) {
    if (lista == null || typeof lista === 'string'
      || (typeof lista[Symbol.iterator] !== 'function' && typeof lista[Symbol.asyncIterator] !== 'function')) {
      throw new TypeError('consultarVarios espera um array (ou iterável) de CNPJs');
    }
    const formato = conferirFormato(opcoes.formato);
    const simultaneas = Math.max(1, Math.floor(Number(opcoes.simultaneas ?? 4) || 1));
    const externo = opcoes.signal;
    if (externo?.aborted) throw externo.reason;

    const ctrl = new AbortController();
    const signal = ctrl.signal;
    const repassar = () => ctrl.abort(externo.reason);
    externo?.addEventListener('abort', repassar, { once: true });

    const limitador = new Limitador({ rpm: opcoes.rpm, janelaMs: this.#janelaMs });
    const fonte = typeof lista[Symbol.asyncIterator] === 'function' ? lista[Symbol.asyncIterator]() : lista[Symbol.iterator]();
    let fonteAcabou = false;
    const vistos = new Set();
    /** @type {Array<import('./index.js').ResultadoLote>} */
    const prontos = [];
    /** @type {(() => void)|null} */
    let acordarConsumidor = null;
    /** @type {Array<() => void>} */
    let esperandoConsumo = [];
    let fatal = null;
    let ativos = simultaneas;

    const avisar = () => {
      const a = acordarConsumidor;
      acordarConsumidor = null;
      a?.();
    };
    const liberarProdutores = () => {
      const fila = esperandoConsumo;
      esperandoConsumo = [];
      for (const r of fila) r();
    };
    signal.addEventListener('abort', liberarProdutores, { once: true });
    const entregar = (item) => {
      prontos.push(item);
      avisar();
    };

    const trabalhador = async () => {
      try {
        while (!fatal && !signal.aborted) {
          // contrapressão: não acumula resultados além do que o consumidor está lendo
          while (prontos.length >= simultaneas * 2 && !signal.aborted) {
            await new Promise((r) => esperandoConsumo.push(r));
          }
          if (signal.aborted || fonteAcabou) return;
          const passo = await fonte.next();
          if (passo.done) {
            fonteAcabou = true;
            return;
          }
          const v = validarLocal(passo.value);
          if (vistos.has(v.cnpj)) continue;
          vistos.add(v.cnpj);
          if (!v.valido) {
            entregar({ cnpj: v.cnpj, documento: null, erro: new ApipjErro(400, 'invalid_cnpj', v.erro, { cnpj: v.cnpj }) });
            continue;
          }
          try {
            const documento = await this.#consultar(v.cnpj, formato, signal, limitador);
            entregar({ cnpj: v.cnpj, documento });
          } catch (e) {
            if (signal.aborted) return;
            if (e instanceof ApipjErro && FATAIS.has(e.code)) {
              fatal = e;
              ctrl.abort(e);
              return;
            }
            entregar({ cnpj: v.cnpj, documento: null, erro: e });
          }
        }
      } catch (e) {
        // erro vindo do iterável de entrada
        if (!signal.aborted && !fatal) {
          fatal = e;
          ctrl.abort(e);
        }
      } finally {
        ativos -= 1;
        avisar();
      }
    };

    for (let i = 0; i < simultaneas; i++) trabalhador();

    try {
      for (;;) {
        // entrega primeiro o que já ficou pronto (consulta paga é consulta entregue), depois o erro fatal
        if (prontos.length) {
          const item = prontos.shift();
          liberarProdutores();
          yield item;
          continue;
        }
        if (fatal) throw fatal;
        if (externo?.aborted) throw externo.reason;
        if (ativos === 0) return;
        await new Promise((r) => {
          acordarConsumidor = r;
        });
      }
    } finally {
      externo?.removeEventListener('abort', repassar);
      if (!signal.aborted) ctrl.abort(new ApipjErro(0, 'aborted', 'consultarVarios encerrado'));
      if (!fonteAcabou) {
        try {
          await fonte.return?.();
        } catch {
          // o iterável de entrada pode não aceitar return(); nada a fazer
        }
      }
    }
  }

  // ---------------------------------------------------------------- internos

  async #consultar(cnpj, formato, signal, limitador) {
    const sufixo = formato === 'simplificado' ? '?formato=simplificado' : '';
    const { res, corpo } = await this.#requisitar(`/v1/cnpj/${cnpj}${sufixo}`, { autenticar: true, signal, limitador });
    if (res.status === 404) {
      if (corpo && typeof corpo === 'object' && corpo.code === 'not_found') return null;
      throw erroDaResposta(res, corpo);
    }
    return exigirJson(res, corpo);
  }

  #obterChave() {
    const chave = this.#chave ?? lerChaveDoAmbiente();
    if (!chave) {
      throw new ApipjErro(401, 'unauthorized',
        'Chave de API ausente: use new Apipj({ chave }) ou defina a variável de ambiente APIPJ_KEY. Conta grátis em https://apipj.com.br/criar-conta');
    }
    return chave;
  }

  /**
   * Faz a chamada com repetição: 429 `rate_limited` espera Retry-After; 5xx e rede, backoff 1 s, 2 s...
   * Devolve a resposta (2xx ou 404) com o corpo já lido; demais status viram ApipjErro.
   */
  async #requisitar(caminho, { autenticar = false, signal, limitador = null } = {}) {
    const f = this.#fetch ?? globalThis.fetch;
    if (typeof f !== 'function') {
      throw new ApipjErro(0, 'fetch_unavailable', 'fetch não está disponível neste ambiente (use Node.js 18+ ou passe a opção fetch)');
    }
    const headers = { Accept: 'application/json', 'User-Agent': `apipj-js/${VERSAO}` };
    if (autenticar) headers.Authorization = `Bearer ${this.#obterChave()}`;
    const url = this.baseUrl + caminho;

    for (let tentativa = 1; ; tentativa++) {
      const ultima = tentativa >= this.tentativas;
      if (limitador) await limitador.aguardar(signal);
      let res = null;
      let corpo = null;
      let erroRede = null;
      try {
        ({ res, corpo } = await this.#tentar(f, url, headers, signal));
      } catch (e) {
        erroRede = e;
      } finally {
        limitador?.registrar(res);
      }
      if (signal?.aborted) throw signal.reason;
      if (res && autenticar) this.#guardarLimites(res);

      if (erroRede) {
        if (ultima) throw erroRede;
        await dormir(this.#backoff(tentativa), signal);
        continue;
      }
      if (res.ok || res.status === 404) return { res, corpo };

      const erro = erroDaResposta(res, corpo);
      if (res.status === 429 && erro.code !== 'quota_exceeded') {
        if (ultima) throw erro;
        const ms = Math.max(0, erro.retryAfter ?? 1) * 1000;
        limitador?.bloquear(ms);
        await dormir(ms, signal);
        continue;
      }
      if (res.status >= 500) {
        if (ultima) throw erro;
        await dormir(this.#backoff(tentativa), signal);
        continue;
      }
      throw erro;
    }
  }

  async #tentar(f, url, headers, signal) {
    const ctrl = new AbortController();
    let estourou = false;
    const timer = this.timeoutMs > 0 && Number.isFinite(this.timeoutMs)
      ? setTimeout(() => {
        estourou = true;
        ctrl.abort();
      }, this.timeoutMs)
      : null;
    const repassar = () => ctrl.abort(signal.reason);
    if (signal?.aborted) ctrl.abort(signal.reason);
    signal?.addEventListener('abort', repassar, { once: true });
    try {
      const res = await f(url, { method: 'GET', headers, signal: ctrl.signal });
      const texto = await res.text();
      let corpo = null;
      if (texto) {
        try {
          corpo = JSON.parse(texto);
        } catch {
          corpo = texto;
        }
      }
      return { res, corpo };
    } catch (e) {
      if (estourou) throw new ApipjErro(0, 'timeout', `Sem resposta da API em ${this.timeoutMs} ms`, { cause: e });
      if (e instanceof ApipjErro) throw e;
      throw new ApipjErro(0, 'network_error', `Falha de rede ao chamar a API: ${e?.message ?? e}`, { cause: e });
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', repassar);
    }
  }

  #backoff(tentativa) {
    return Math.min(30000, this.#esperaBaseMs * 2 ** (tentativa - 1));
  }

  #guardarLimites(res) {
    const h = (n) => numero(res.headers.get(n));
    const limite = h('x-ratelimit-limit');
    const cota = h('x-quota-limit');
    if (limite === null && cota === null) return;
    this.limites = {
      porMinuto: { limite, restante: h('x-ratelimit-remaining'), reset: h('x-ratelimit-reset') },
      mensal: { limite: cota, restante: h('x-quota-remaining'), reset: h('x-quota-reset') },
    };
  }
}

function conferirFormato(formato) {
  const f = formato ?? 'completo';
  if (!FORMATOS.includes(f)) {
    throw new ApipjErro(400, 'validation_error', `formato deve ser um de: ${FORMATOS.join(', ')}`);
  }
  return f;
}

function exigirJson(res, corpo) {
  if (!res.ok) throw erroDaResposta(res, corpo);
  if (!corpo || typeof corpo !== 'object') {
    throw new ApipjErro(res.status, 'invalid_response', 'Resposta inesperada da API (não é JSON)', { corpo });
  }
  return corpo;
}

function erroDaResposta(res, corpo) {
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  const code = typeof c.code === 'string' ? c.code : codigoPadrao(res.status);
  const message = typeof c.message === 'string' ? c.message : `A API respondeu HTTP ${res.status}`;
  const retryAfter = res.status === 429 ? (segundosRetryAfter(res.headers.get('retry-after')) ?? numero(c.retry_after)) : null;
  return new ApipjErro(res.status, code, message, {
    retryAfter,
    upgradeUrl: c.upgrade_url ?? null,
    reset: numero(c.reset),
    cnpj: c.cnpj ?? null,
    details: c.details ?? null,
    corpo,
  });
}

function codigoPadrao(status) {
  if (status === 400) return 'bad_request';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'dataset_unavailable';
  if (status >= 500) return 'server_error';
  return 'http_error';
}

function segundosRetryAfter(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.max(0, n);
  const data = Date.parse(v);
  if (Number.isFinite(data)) return Math.max(0, Math.ceil((data - Date.now()) / 1000));
  return null;
}

function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function lerChaveDoAmbiente() {
  try {
    const v = globalThis.process?.env?.APIPJ_KEY;
    if (v) return v;
  } catch {
    // sem process (navegador, alguns edge runtimes)
  }
  try {
    const v = globalThis.Deno?.env?.get?.('APIPJ_KEY');
    if (v) return v;
  } catch {
    // Deno sem --allow-env
  }
  return null;
}
