// Limitador de vazão do consultarVarios: janela deslizante de `limite` inícios de requisição
// por `janelaMs` (60 s), com o limite lido de X-RateLimit-Limit. A primeira requisição sai
// sozinha (sonda) para descobrir o limite do plano antes de abrir as demais.

import { dormir } from './util.js';

export class Limitador {
  /**
   * @param {{ rpm?: number, janelaMs?: number }} [opcoes]
   */
  constructor({ rpm, janelaMs = 60000 } = {}) {
    /** Limite pedido pelo usuário (pode ser menor que o do plano). */
    this.rpmUsuario = rpm > 0 ? Math.floor(rpm) : null;
    /** Limite efetivo; `null` até a primeira resposta (sem cabeçalho = sem limite local). */
    this.limite = this.rpmUsuario;
    this.janelaMs = janelaMs;
    /** @type {number[]} instantes (ms) dos inícios dentro da janela */
    this.inicios = [];
    this.bloqueadoAte = 0;
    this.conhecido = false;
    this.sondando = false;
    /** @type {Array<() => void>} */
    this.esperandoSonda = [];
  }

  /**
   * Resolve quando uma nova requisição pode começar (e já a registra na janela).
   * @param {AbortSignal} [signal]
   */
  async aguardar(signal) {
    for (;;) {
      if (signal?.aborted) throw signal.reason;
      if (!this.conhecido) {
        if (!this.sondando) {
          this.sondando = true;
          this.inicios.push(Date.now());
          return;
        }
        await new Promise((resolve) => this.esperandoSonda.push(resolve));
        continue;
      }
      const agora = Date.now();
      while (this.inicios.length && this.inicios[0] <= agora - this.janelaMs) this.inicios.shift();
      let espera = Math.max(0, this.bloqueadoAte - agora);
      if (this.limite && this.inicios.length >= this.limite) {
        espera = Math.max(espera, this.inicios[this.inicios.length - this.limite] + this.janelaMs - agora);
      }
      if (espera <= 0) {
        this.inicios.push(agora);
        return;
      }
      await dormir(espera, signal);
    }
  }

  /**
   * Registra a resposta de uma tentativa (ou `null` se nem houve resposta).
   * @param {Response|null} res
   */
  registrar(res) {
    if (res) {
      const limite = inteiro(res.headers.get('x-ratelimit-limit'));
      const restante = inteiro(res.headers.get('x-ratelimit-remaining'));
      if (limite > 0) this.limite = this.rpmUsuario ? Math.min(this.rpmUsuario, limite) : limite;
      if (restante === 0 && limite > 0) this.bloquear(Math.ceil(this.janelaMs / limite));
    }
    if (!this.conhecido) {
      this.conhecido = true;
      const fila = this.esperandoSonda;
      this.esperandoSonda = [];
      // acorda os demais só no próximo ciclo: se a sonda falhou de vez (401, cota esgotada),
      // o lote já terá sido cancelado e ninguém mais chama a API
      setTimeout(() => {
        for (const acordar of fila) acordar();
      }, 0);
    }
  }

  /** Ninguém começa nada nos próximos `ms` milissegundos (Retry-After, Remaining = 0). */
  bloquear(ms) {
    this.bloqueadoAte = Math.max(this.bloqueadoAte, Date.now() + ms);
  }
}

function inteiro(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
