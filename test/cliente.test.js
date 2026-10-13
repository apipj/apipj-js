import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Apipj, ApipjErro, VERSAO } from '../src/index.js';
import { servidorFalso, json, esperar, documento } from './servidor-falso.js';

const CHAVE = 'apipj_live_teste';
const CNPJ = '11378117000120';

// cada teste troca o tratador; um servidor só para o arquivo
let tratador = (req, res) => json(res, 200, {});
const srv = await servidorFalso((req, res, info) => tratador(req, res, info));
after(() => srv.fechar());
beforeEach(() => {
  srv.requisicoes.length = 0;
});

const cliente = (opcoes = {}) => new Apipj({ chave: CHAVE, baseUrl: srv.url, esperaBaseMs: 20, ...opcoes });

async function rejeita(promessa, esperado) {
  await assert.rejects(promessa, (e) => {
    assert.ok(e instanceof ApipjErro, `esperava ApipjErro, veio ${e}`);
    for (const [k, v] of Object.entries(esperado)) assert.deepEqual(e[k], v, k);
    return true;
  });
}

test('consultar: normaliza, manda a chave e o User-Agent e devolve o documento', async () => {
  tratador = (req, res) => json(res, 200, documento(CNPJ), {
    'X-RateLimit-Limit': '10', 'X-RateLimit-Remaining': '9', 'X-RateLimit-Reset': '6',
    'X-Quota-Limit': '50000', 'X-Quota-Remaining': '49999', 'X-Quota-Reset': '1793502000',
  });
  const api = cliente();
  const doc = await api.consultar('11.378.117/0001-20');
  assert.equal(doc.cnpj, CNPJ);
  assert.equal(srv.requisicoes.length, 1);
  const r = srv.requisicoes[0];
  assert.equal(r.url, `/v1/cnpj/${CNPJ}`);
  assert.equal(r.headers.authorization, `Bearer ${CHAVE}`);
  assert.equal(r.headers['user-agent'], `apipj-js/${VERSAO}`);
  assert.deepEqual(api.limites, {
    porMinuto: { limite: 10, restante: 9, reset: 6 },
    mensal: { limite: 50000, restante: 49999, reset: 1793502000 },
  });
});

test('consultar: formato simplificado vai na query; alfanumérico vai normalizado', async () => {
  tratador = (req, res) => json(res, 200, { cnpj: '12.ABC.345/01DE-35', nome: 'X' });
  const doc = await cliente().consultar('12.abc.345/01de-35', { formato: 'simplificado' });
  assert.equal(doc.nome, 'X');
  assert.equal(srv.requisicoes[0].url, '/v1/cnpj/12ABC34501DE35?formato=simplificado');
});

test('consultar: CNPJ inválido lança invalid_cnpj sem chamar a API', async () => {
  await rejeita(cliente().consultar('11.378.117/0001-21'), { status: 400, code: 'invalid_cnpj', cnpj: '11378117000121' });
  await rejeita(cliente().consultar('12ABC34501DE36'), { status: 400, code: 'invalid_cnpj' });
  await rejeita(cliente().consultar('00000000000000'), { status: 400, code: 'invalid_cnpj' });
  await rejeita(cliente().consultar(CNPJ, { formato: 'xml' }), { status: 400, code: 'validation_error' });
  assert.equal(srv.requisicoes.length, 0);
});

test('chave: lê APIPJ_KEY só na hora de consultar; sem chave lança 401 local', async () => {
  tratador = (req, res) => json(res, 200, documento(CNPJ));
  const antes = process.env.APIPJ_KEY;
  try {
    delete process.env.APIPJ_KEY;
    const api = new Apipj({ baseUrl: srv.url });
    await rejeita(api.consultar(CNPJ), { status: 401, code: 'unauthorized' });
    assert.equal(srv.requisicoes.length, 0);
    process.env.APIPJ_KEY = 'apipj_live_do_ambiente';
    await api.consultar(CNPJ);
    assert.equal(srv.requisicoes[0].headers.authorization, 'Bearer apipj_live_do_ambiente');
  } finally {
    if (antes === undefined) delete process.env.APIPJ_KEY;
    else process.env.APIPJ_KEY = antes;
  }
});

test('a chave não aparece ao inspecionar o cliente', () => {
  const api = cliente();
  assert.ok(!JSON.stringify(api).includes(CHAVE));
  assert.ok(!Object.values(api).includes(CHAVE));
});

test('404 not_found vira null', async () => {
  tratador = (req, res) => json(res, 404, { status: 'ERROR', message: 'CNPJ não encontrado', code: 'not_found' });
  assert.equal(await cliente().consultar(CNPJ), null);
  assert.equal(srv.requisicoes.length, 1);
});

test('404 sem corpo da API (baseUrl errada) lança em vez de virar null', async () => {
  tratador = (req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<h1>404</h1>');
  };
  await rejeita(cliente().consultar(CNPJ), { status: 404, code: 'not_found' });
});

test('400 e 401 do servidor lançam na hora, sem repetir', async () => {
  tratador = (req, res) => json(res, 400, { status: 'ERROR', message: 'Dígitos verificadores inválidos', code: 'invalid_cnpj', cnpj: CNPJ });
  await rejeita(cliente().consultar(CNPJ), { status: 400, code: 'invalid_cnpj', message: 'Dígitos verificadores inválidos', cnpj: CNPJ });
  assert.equal(srv.requisicoes.length, 1);

  srv.requisicoes.length = 0;
  tratador = (req, res) => json(res, 401, { status: 'ERROR', message: 'Chave de API inválida ou revogada', code: 'unauthorized' });
  await rejeita(cliente().consultar(CNPJ), { status: 401, code: 'unauthorized', message: 'Chave de API inválida ou revogada' });
  assert.equal(srv.requisicoes.length, 1);
});

test('429 quota_exceeded lança na hora com upgradeUrl e reset', async () => {
  tratador = (req, res) => json(res, 429, {
    status: 'ERROR', message: 'Cota mensal esgotada', code: 'quota_exceeded',
    upgrade_url: 'https://apipj.com.br/precos', reset: 1793502000,
  });
  await rejeita(cliente().consultar(CNPJ), {
    status: 429, code: 'quota_exceeded', upgradeUrl: 'https://apipj.com.br/precos', reset: 1793502000, retryAfter: null,
  });
  assert.equal(srv.requisicoes.length, 1);
});

test('429 rate_limited espera o Retry-After e repete', async () => {
  tratador = (req, res, { n }) => {
    if (n === 1) {
      return json(res, 429, { status: 'ERROR', message: 'Limite', code: 'rate_limited', retry_after: 1 }, { 'Retry-After': '1' });
    }
    return json(res, 200, documento(CNPJ));
  };
  const t0 = Date.now();
  const doc = await cliente().consultar(CNPJ);
  const dt = Date.now() - t0;
  assert.equal(doc.cnpj, CNPJ);
  assert.equal(srv.requisicoes.length, 2);
  assert.ok(dt >= 950, `esperou só ${dt} ms`);
  assert.ok(srv.requisicoes[1].em - srv.requisicoes[0].em >= 950);
});

test('429 rate_limited esgota as tentativas e lança com retryAfter', async () => {
  tratador = (req, res) => json(res, 429, { status: 'ERROR', message: 'Limite', code: 'rate_limited', retry_after: 0 }, { 'Retry-After': '0' });
  await rejeita(cliente({ tentativas: 3 }).consultar(CNPJ), { status: 429, code: 'rate_limited', retryAfter: 0 });
  assert.equal(srv.requisicoes.length, 3);
});

test('sem Retry-After no cabeçalho usa retry_after do corpo', async () => {
  tratador = (req, res) => json(res, 429, { status: 'ERROR', message: 'Limite', code: 'rate_limited', retry_after: 0 });
  await rejeita(cliente({ tentativas: 2 }).consultar(CNPJ), { code: 'rate_limited', retryAfter: 0 });
  assert.equal(srv.requisicoes.length, 2);
});

test('5xx repete com backoff e lança depois de esgotar', async () => {
  tratador = (req, res) => json(res, 503, { status: 'ERROR', message: 'Base de CNPJ indisponível no momento', code: 'dataset_unavailable' });
  const t0 = Date.now();
  await rejeita(cliente({ tentativas: 3, esperaBaseMs: 40 }).consultar(CNPJ), { status: 503, code: 'dataset_unavailable' });
  assert.equal(srv.requisicoes.length, 3);
  assert.ok(Date.now() - t0 >= 40 + 80 - 10);
});

test('5xx com corpo não JSON vira server_error', async () => {
  tratador = (req, res) => {
    res.writeHead(502, { 'Content-Type': 'text/html' });
    res.end('<html>bad gateway</html>');
  };
  await rejeita(cliente({ tentativas: 1 }).consultar(CNPJ), { status: 502, code: 'server_error' });
});

test('backoff padrão de 1 s e 2 s entre tentativas', async () => {
  tratador = (req, res, { n }) => (n < 3 ? json(res, 500, { status: 'ERROR', message: 'x', code: 'internal' }) : json(res, 200, documento(CNPJ)));
  const api = new Apipj({ chave: CHAVE, baseUrl: srv.url });
  const doc = await api.consultar(CNPJ);
  assert.equal(doc.cnpj, CNPJ);
  const [a, b, c] = srv.requisicoes.map((r) => r.em);
  assert.ok(b - a >= 950, `1º intervalo ${b - a} ms`);
  assert.ok(c - b >= 1950, `2º intervalo ${c - b} ms`);
});

test('falha de rede repete e lança network_error', async () => {
  const api = new Apipj({ chave: CHAVE, baseUrl: 'http://127.0.0.1:1', tentativas: 2, esperaBaseMs: 10 });
  await rejeita(api.consultar(CNPJ), { status: 0, code: 'network_error' });
});

test('tempo esgotado lança timeout', async () => {
  tratador = async (req, res) => {
    await esperar(400);
    json(res, 200, documento(CNPJ));
  };
  await rejeita(cliente({ timeoutMs: 80, tentativas: 1 }).consultar(CNPJ), { status: 0, code: 'timeout' });
});

test('signal cancela a consulta', async () => {
  tratador = async (req, res) => {
    await esperar(400);
    json(res, 200, documento(CNPJ));
  };
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(new Error('cancelado')), 50);
  await assert.rejects(cliente().consultar(CNPJ, { signal: ctrl.signal }), /cancelado/);
});

test('validar, status e planos não mandam a chave', async () => {
  tratador = (req, res) => {
    if (req.url.startsWith('/v1/valida/')) {
      return json(res, 200, { cnpj: '12ABC34501DE35', valido: true, formatado: '12.ABC.345/01DE-35', alfanumerico: true, erro: null });
    }
    if (req.url === '/v1/status') return json(res, 200, { status: 'OK', dataset_month: '2026-09', rows: 1, version: '0.1.0', time: 'x' });
    if (req.url === '/v1/plans') return json(res, 200, { currency: 'BRL', plans: [{ id: 'free', rpm: 10 }] });
    return json(res, 404, { code: 'not_found' });
  };
  const api = cliente();
  assert.equal((await api.validar('12.abc.345/01de-35')).valido, true);
  assert.equal((await api.status()).status, 'OK');
  assert.equal((await api.planos()).plans[0].id, 'free');
  assert.deepEqual(srv.requisicoes.map((r) => r.url), ['/v1/valida/12ABC34501DE35', '/v1/status', '/v1/plans']);
  for (const r of srv.requisicoes) {
    assert.equal(r.headers.authorization, undefined);
    assert.equal(r.headers['user-agent'], `apipj-js/${VERSAO}`);
  }
});

test('validar vazio responde localmente', async () => {
  const v = await cliente().validar('');
  assert.equal(v.valido, false);
  assert.equal(srv.requisicoes.length, 0);
});

test('status repete em 429 por IP e lança se persistir', async () => {
  tratador = (req, res, { n }) => (n === 1
    ? json(res, 429, { status: 'ERROR', message: 'Limite', code: 'rate_limited', retry_after: 0 }, { 'Retry-After': '0' })
    : json(res, 200, { status: 'OK' }));
  assert.equal((await cliente().status()).status, 'OK');
  assert.equal(srv.requisicoes.length, 2);
});

test('fetch próprio pode ser injetado', async () => {
  const chamadas = [];
  const api = new Apipj({
    chave: CHAVE,
    fetch: async (url, init) => {
      chamadas.push({ url, init });
      return new Response(JSON.stringify(documento(CNPJ)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  const doc = await api.consultar(CNPJ);
  assert.equal(doc.cnpj, CNPJ);
  assert.equal(chamadas[0].url, `https://apipj.com.br/v1/cnpj/${CNPJ}`);
});
