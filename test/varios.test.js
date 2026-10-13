import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Apipj, ApipjErro, calcularDv } from '../src/index.js';
import { servidorFalso, json, esperar, documento, gerarCnpjs } from './servidor-falso.js';

let tratador = (req, res) => json(res, 200, {});
const srv = await servidorFalso((req, res, info) => tratador(req, res, info));
after(() => srv.fechar());
beforeEach(() => {
  srv.requisicoes.length = 0;
});

const cnpjDaUrl = (url) => url.split('/').pop().split('?')[0];
const cliente = (opcoes = {}) => new Apipj({ chave: 'apipj_live_teste', baseUrl: srv.url, esperaBaseMs: 20, ...opcoes });

async function coletar(iteravel) {
  const itens = [];
  for await (const r of iteravel) itens.push(r);
  return itens;
}

test('deduplica, pula inválidos sem chamar a API e trata 404 como null', async () => {
  const [a, b, c] = gerarCnpjs(3, calcularDv);
  tratador = (req, res) => {
    const cnpj = cnpjDaUrl(req.url);
    if (cnpj === c) return json(res, 404, { status: 'ERROR', message: 'CNPJ não encontrado', code: 'not_found' });
    return json(res, 200, documento(cnpj), { 'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '99' });
  };
  const fmt = (x) => `${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5, 8)}/${x.slice(8, 12)}-${x.slice(12)}`;
  const lista = [a, fmt(a), b, '11378117000121', c, b, '12ABC34501DE36', 'lixo'];
  const itens = await coletar(cliente().consultarVarios(lista, { simultaneas: 2 }));

  assert.equal(srv.requisicoes.length, 3, 'só os 3 válidos e distintos chamam a API');
  assert.deepEqual(srv.requisicoes.map((r) => cnpjDaUrl(r.url)).sort(), [a, b, c].sort());
  const porCnpj = Object.fromEntries(itens.map((i) => [i.cnpj, i]));
  assert.equal(itens.length, 6);
  assert.equal(porCnpj[a].documento.cnpj, a);
  assert.equal(porCnpj[b].documento.cnpj, b);
  assert.equal(porCnpj[c].documento, null);
  assert.equal(porCnpj[c].erro, undefined);
  for (const inv of ['11378117000121', '12ABC34501DE36', 'LIXO']) {
    assert.equal(porCnpj[inv].documento, null);
    assert.ok(porCnpj[inv].erro instanceof ApipjErro);
    assert.equal(porCnpj[inv].erro.code, 'invalid_cnpj');
  }
});

test('entrega na ordem de conclusão', async () => {
  // a primeira requisição (sonda do limite) sai sozinha; depois y (lento) e z (rápido) saem juntos
  const [x, y, z] = gerarCnpjs(3, calcularDv);
  tratador = async (req, res) => {
    const cnpj = cnpjDaUrl(req.url);
    await esperar(cnpj === y ? 300 : 10);
    json(res, 200, documento(cnpj), { 'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '99' });
  };
  const ordem = (await coletar(cliente().consultarVarios([x, y, z], { simultaneas: 2 }))).map((i) => i.cnpj);
  assert.deepEqual(ordem, [x, z, y]);
});

test('respeita simultaneas', async () => {
  tratador = async (req, res) => {
    await esperar(30);
    json(res, 200, documento(cnpjDaUrl(req.url)), { 'X-RateLimit-Limit': '1000', 'X-RateLimit-Remaining': '999' });
  };
  const itens = await coletar(cliente().consultarVarios(gerarCnpjs(12, calcularDv), { simultaneas: 3 }));
  assert.equal(itens.length, 12);
  assert.ok(srv.maxSimultaneas <= 3, `chegou a ${srv.maxSimultaneas} simultâneas`);
  assert.ok(srv.maxSimultaneas >= 2);
});

test('nunca passa do limite por minuto lido de X-RateLimit-* (janela reduzida para o teste)', async () => {
  const LIMITE = 5;
  const JANELA = 1000;
  const chegadas = [];
  let violacoes = 0;
  tratador = (req, res) => {
    const agora = Date.now();
    // margem de 60 ms para a latência entre o cliente e o servidor
    const naJanela = chegadas.filter((t) => t > agora - (JANELA - 60)).length;
    chegadas.push(agora);
    if (naJanela >= LIMITE) {
      violacoes += 1;
      return json(res, 429, { status: 'ERROR', message: 'Limite', code: 'rate_limited', retry_after: 1 }, { 'Retry-After': '1' });
    }
    return json(res, 200, documento(cnpjDaUrl(req.url)), {
      'X-RateLimit-Limit': String(LIMITE),
      'X-RateLimit-Remaining': String(LIMITE - naJanela - 1),
      'X-RateLimit-Reset': '1',
    });
  };
  const lista = gerarCnpjs(16, calcularDv);
  const t0 = Date.now();
  const itens = await coletar(cliente({ janelaMs: JANELA }).consultarVarios(lista, { simultaneas: 10 }));
  const dt = Date.now() - t0;

  assert.equal(violacoes, 0, 'o servidor não deveria ter respondido 429');
  assert.equal(itens.length, 16);
  assert.ok(itens.every((i) => i.documento && !i.erro));
  // 16 requisições a 5 por janela: 4 janelas, a última começa depois de 3 janelas
  assert.ok(dt >= 3 * JANELA - 100, `terminou rápido demais (${dt} ms)`);
  for (const t of chegadas) {
    const n = chegadas.filter((u) => u >= t && u < t + JANELA - 60).length;
    assert.ok(n <= LIMITE, `${n} requisições numa janela`);
  }
});

test('opção rpm limita abaixo do plano', async () => {
  tratador = (req, res) => json(res, 200, documento(cnpjDaUrl(req.url)), { 'X-RateLimit-Limit': '1000', 'X-RateLimit-Remaining': '999' });
  const t0 = Date.now();
  const itens = await coletar(cliente({ janelaMs: 500 }).consultarVarios(gerarCnpjs(6, calcularDv), { simultaneas: 6, rpm: 2 }));
  assert.equal(itens.length, 6);
  assert.ok(Date.now() - t0 >= 2 * 500 - 50, 'com rpm 2 e 6 itens, precisa de 3 janelas');
});

test('429 rate_limited no meio do lote: espera Retry-After e completa tudo', async () => {
  tratador = (req, res, { n }) => {
    if (n === 3) return json(res, 429, { status: 'ERROR', message: 'Limite', code: 'rate_limited', retry_after: 1 }, { 'Retry-After': '1' });
    return json(res, 200, documento(cnpjDaUrl(req.url)), { 'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '50' });
  };
  const lista = gerarCnpjs(5, calcularDv);
  const itens = await coletar(cliente().consultarVarios(lista, { simultaneas: 1 }));
  assert.equal(itens.length, 5);
  assert.ok(itens.every((i) => i.documento));
  assert.equal(srv.requisicoes.length, 6);
  assert.ok(srv.requisicoes[3].em - srv.requisicoes[2].em >= 950);
});

test('erro de um CNPJ (5xx esgotado) sai no item e o lote continua', async () => {
  const lista = gerarCnpjs(3, calcularDv);
  tratador = (req, res) => {
    const cnpj = cnpjDaUrl(req.url);
    if (cnpj === lista[1]) return json(res, 503, { status: 'ERROR', message: 'Base indisponível', code: 'dataset_unavailable' });
    return json(res, 200, documento(cnpj), { 'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '50' });
  };
  const itens = await coletar(cliente({ tentativas: 2 }).consultarVarios(lista));
  const ruim = itens.find((i) => i.cnpj === lista[1]);
  assert.equal(ruim.documento, null);
  assert.equal(ruim.erro.code, 'dataset_unavailable');
  assert.equal(itens.filter((i) => i.documento).length, 2);
});

test('401 interrompe o lote lançando ApipjErro', async () => {
  tratador = (req, res) => json(res, 401, { status: 'ERROR', message: 'Chave de API inválida ou revogada', code: 'unauthorized' });
  await assert.rejects(coletar(cliente().consultarVarios(gerarCnpjs(20, calcularDv))), (e) => e instanceof ApipjErro && e.code === 'unauthorized');
  await esperar(150);
  assert.equal(srv.requisicoes.length, 1, 'a sonda falhou; ninguém mais chamou a API');
});

test('cota esgotada interrompe o lote', async () => {
  tratador = (req, res, { n }) => (n <= 2
    ? json(res, 200, documento(cnpjDaUrl(req.url)), { 'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '99' })
    : json(res, 429, { status: 'ERROR', message: 'Cota mensal esgotada', code: 'quota_exceeded', upgrade_url: 'https://apipj.com.br/precos' }));
  const vistos = [];
  await assert.rejects(async () => {
    for await (const r of cliente().consultarVarios(gerarCnpjs(30, calcularDv), { simultaneas: 1 })) vistos.push(r);
  }, (e) => e.code === 'quota_exceeded' && e.upgradeUrl === 'https://apipj.com.br/precos');
  await esperar(150);
  assert.equal(vistos.length, 2);
  assert.equal(srv.requisicoes.length, 3);
});

test('break no meio para de chamar a API', async () => {
  tratador = async (req, res) => {
    await esperar(20);
    json(res, 200, documento(cnpjDaUrl(req.url)), { 'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '99' });
  };
  for await (const r of cliente().consultarVarios(gerarCnpjs(50, calcularDv), { simultaneas: 2 })) {
    assert.ok(r.documento);
    break;
  }
  await esperar(150);
  assert.ok(srv.requisicoes.length <= 4, `${srv.requisicoes.length} requisições depois do break`);
});

test('aceita iterável assíncrono', async () => {
  tratador = (req, res) => json(res, 200, documento(cnpjDaUrl(req.url)), { 'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '99' });
  const lista = gerarCnpjs(4, calcularDv);
  async function* gerar() {
    for (const c of lista) {
      await esperar(5);
      yield c;
    }
  }
  const itens = await coletar(cliente().consultarVarios(gerar(), { simultaneas: 2 }));
  assert.deepEqual(itens.map((i) => i.cnpj).sort(), [...lista].sort());
});

test('string no lugar de lista é erro de uso', async () => {
  await assert.rejects(coletar(cliente().consultarVarios('11378117000120')), TypeError);
});
