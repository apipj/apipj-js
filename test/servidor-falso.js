// Servidor HTTP falso para os testes (não é um arquivo de teste).
import http from 'node:http';

/**
 * Sobe um servidor local. `tratar(req, res, info)` responde; `info.n` é o número da requisição (1, 2...).
 * @param {(req: http.IncomingMessage, res: http.ServerResponse, info: { n: number }) => void | Promise<void>} tratar
 */
export async function servidorFalso(tratar) {
  const requisicoes = [];
  let emAndamento = 0;
  let maxSimultaneas = 0;
  const servidor = http.createServer(async (req, res) => {
    const registro = { metodo: req.method, url: req.url, headers: req.headers, em: Date.now() };
    requisicoes.push(registro);
    emAndamento += 1;
    maxSimultaneas = Math.max(maxSimultaneas, emAndamento);
    res.on('close', () => {
      emAndamento -= 1;
    });
    try {
      await tratar(req, res, { n: requisicoes.length });
    } catch (e) {
      if (!res.headersSent) json(res, 500, { status: 'ERROR', code: 'teste', message: String(e) });
    }
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const { port } = /** @type {import('node:net').AddressInfo} */ (servidor.address());
  return {
    url: `http://127.0.0.1:${port}`,
    requisicoes,
    get maxSimultaneas() {
      return maxSimultaneas;
    },
    fechar: () => new Promise((r) => {
      servidor.closeAllConnections?.();
      servidor.close(() => r());
    }),
  };
}

export function json(res, status, corpo, headers = {}) {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(texto);
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Documento mínimo no formato completo para um CNPJ. */
export function documento(cnpj) {
  return {
    cnpj,
    cnpj_formatado: `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`,
    razao_social: `EMPRESA ${cnpj}`,
    situacao_cadastral: { codigo: '02', descricao: 'ATIVA', data: '2020-01-01', motivo: null },
    atualizado_em: '2026-09',
  };
}

/** Gera `n` CNPJs numéricos válidos e distintos. */
export function gerarCnpjs(n, calcularDv) {
  const lista = [];
  for (let i = 1; lista.length < n; i++) {
    const base = `${String(10000000 + i * 7919).slice(0, 8)}0001`;
    lista.push(base + calcularDv(base));
  }
  return lista;
}
