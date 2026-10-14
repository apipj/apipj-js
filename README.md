# apipj: API CNPJ gratuita para Node.js e TypeScript

**API para consultar CNPJ** em JavaScript e TypeScript: o cliente oficial da **API de CNPJ do [apipj](https://apipj.com.br)**, com **plano gratuito** de 50 mil consultas por mês, sem cartão. Consulte CNPJ e receba razão social, situação cadastral, endereço, CNAEs, Simples/MEI e sócios a partir dos dados abertos da Receita Federal, com suporte ao **CNPJ alfanumérico**.

- ESM com tipos TypeScript completos; **zero dependências**.
- Node.js 18+ (usa o `fetch` nativo). Funciona também em Deno, Bun e runtimes edge/serverless que tenham `fetch`.
- Valida o CNPJ (inclusive alfanumérico) localmente antes de chamar a API: CNPJ inválido não gasta cota.
- Repete sozinho em limite por minuto (`429` com `Retry-After`), erro `5xx` e falha de rede.
- Consulta em lote com `consultarVarios`, respeitando o limite por minuto do seu plano.

> **Atenção: a chave de API é secreta.** Use este pacote só no servidor (backend, funções serverless, scripts). **Nunca** coloque a chave em código que roda no navegador ou em apps distribuídos: qualquer pessoa conseguiria copiá-la e gastar a sua cota. Se o front-end precisa de dados de CNPJ, crie uma rota no seu back-end que chama a API.

## Instalação

```bash
npm install apipj
```

**Para testar, não precisa de chave:** sem `APIPJ_KEY`, `consultar` usa a consulta sem chave da API, com limite de teste por IP (hoje 3 consultas por minuto e 100 por dia), e avisa uma vez no console. Para uso real, crie uma conta grátis em [apipj.com.br/criar-conta](https://apipj.com.br/criar-conta?origem=api-lib-npm-apipj) (10 consultas por minuto e 50 mil por mês, sem cartão), gere a chave no painel e exporte-a:

```bash
export APIPJ_KEY=apipj_live_...
```

## Consultar CNPJ

```js
import { Apipj, ApipjErro, cnpjValido, normalizarCnpj, formatarCnpj } from 'apipj';

const api = new Apipj({
  chave: process.env.APIPJ_KEY, // padrão: lê APIPJ_KEY só quando precisar
  baseUrl: 'https://apipj.com.br',
  timeoutMs: 10000,             // por tentativa
  tentativas: 3,                // contando a primeira
});

// Documento completo, ou null se o CNPJ não está na base da Receita (404)
const empresa = await api.consultar('11.378.117/0001-20');
if (empresa) {
  console.log(empresa.razao_social, empresa.situacao_cadastral.descricao, empresa.endereco.municipio.nome);
}

// Formato simplificado: plano, com datas DD/MM/AAAA e CNPJ, CEP e telefone já formatados
const simples = await api.consultar('11378117000120', { formato: 'simplificado' });

// Validação pela API (GET /v1/valida: sem chave e sem consumo de cota)
const v = await api.validar('12.ABC.345/01DE-35');
// { cnpj: '12ABC34501DE35', valido: true, formatado: '12.ABC.345/01DE-35', alfanumerico: true, erro: null }

// Status do serviço e mês do lote da Receita carregado (sem chave)
const status = await api.status();   // { status: 'OK', dataset_month: '2026-09', rows: ..., ... }

// Planos, preços e limites (sem chave)
const { plans } = await api.planos();
```

### Validar CNPJ (inclusive alfanumérico), offline e sem chamar a API

```js
cnpjValido('12.ABC.345/01DE-35');      // true  (alfanumérico)
cnpjValido('12ABC34501DE36');          // false (dígito verificador errado)
cnpjValido('00.000.000/0000-00');      // false (zerado)
normalizarCnpj('12.abc.345/01de-35');  // '12ABC34501DE35'
formatarCnpj('11378117000120');        // '11.378.117/0001-20'
```

`cnpjValido` confere formato e dígitos verificadores (numérico e alfanumérico, IN RFB 2.229/2024); não diz se o CNPJ existe. Também são exportados `validarLocal` (mesmo formato de resposta de `api.validar`) e `calcularDv`.

### Consultar CNPJ em lote

```js
const lista = ['11.378.117/0001-20', '00.000.000/0001-91', '11378117000120', '123'];

for await (const r of api.consultarVarios(lista, { simultaneas: 4 })) {
  // r = { cnpj, documento, erro? }, na ordem de conclusão
  if (r.erro) console.error(r.cnpj, r.erro.code, r.erro.message);
  else if (!r.documento) console.log(r.cnpj, 'não encontrado');
  else console.log(r.cnpj, r.documento.razao_social);
}
```

- Lê o limite por minuto do seu plano dos cabeçalhos `X-RateLimit-Limit`/`Remaining`/`Reset` e **nunca passa dele** (a primeira consulta sai sozinha para descobrir o limite). Use `rpm` para ficar abaixo do plano, por exemplo para dividir a chave com outro processo.
- CNPJs repetidos (mesmo com máscaras diferentes) são consultados uma vez só.
- CNPJs inválidos **não chamam a API**: saem com `documento: null` e `erro.code === 'invalid_cnpj'`.
- Erro de um CNPJ (por exemplo `5xx` depois das tentativas) sai no próprio item e o lote continua.
- `401` (chave inválida) e cota mensal esgotada (`quota_exceeded`) interrompem o lote lançando `ApipjErro`, depois de entregar os resultados já prontos.
- Aceita array, qualquer iterável ou iterável assíncrono (por exemplo, linhas lidas de um arquivo). Um `break` no laço cancela as consultas em andamento.
- Opções: `simultaneas` (padrão 4), `formato`, `rpm`, `signal` (`AbortSignal`).

## Tratamento de erros

Todos os erros da API viram `ApipjErro`, com `status` (HTTP, ou `0` para rede/tempo esgotado), `code` (estável, em snake_case) e `message` (em português).

```js
try {
  const empresa = await api.consultar(cnpj);
  if (!empresa) return 'CNPJ não encontrado na base da Receita';
} catch (e) {
  if (!(e instanceof ApipjErro)) throw e;
  switch (e.code) {
    case 'invalid_cnpj':   // 400: formato ou dígito verificador inválido (verificado antes de chamar a API)
      break;
    case 'unauthorized':   // 401: chave inválida ou revogada (ou consulta sem chave fechada; e.signupUrl)
      break;
    case 'quota_exceeded': // 429: cota mensal esgotada (e.upgradeUrl, e.reset) ou, sem chave, limite do dia (e.signupUrl)
      break;
    case 'rate_limited':   // 429: limite por minuto, mesmo depois de esperar Retry-After em todas as tentativas; e.retryAfter
      break;
    default:               // 5xx (dataset_unavailable, server_error), network_error, timeout
      console.error(e.status, e.code, e.message);
  }
}
```

| Situação | O que o cliente faz |
|---|---|
| CNPJ inválido | lança `ApipjErro(400, 'invalid_cnpj')` **sem chamar a API** |
| `404` (CNPJ válido, fora da base) | devolve `null` |
| `400`, `401` | lança na hora |
| `429 quota_exceeded` | lança na hora, com `upgradeUrl` e `reset` |
| `429 rate_limited` | espera `Retry-After` e repete, até `tentativas`; depois lança com `retryAfter` |
| `5xx`, falha de rede, tempo esgotado | repete com espera de 1 s, 2 s...; depois lança |

Depois de cada consulta, `api.limites` traz o que a API informou: `{ porMinuto: { limite, restante, reset }, mensal: { limite, restante, reset } }`.

## Limites e plano gratuito

Cada consulta respondida (inclusive `404`) conta 1 na cota mensal; também vale um limite de consultas por minuto por chave. `validar`, `status` e `planos` não consomem cota.

| Plano | Consultas por minuto | Consultas por mês | Preço |
|---|---|---|---|
| Gratuito | 10 | 50.000 | R$ 0 |
| Dev | 30 | 200.000 | R$ 12,90/mês |
| Pro | 200 | 600.000 | R$ 59,90/mês |

Valores atuais em [apipj.com.br/precos](https://apipj.com.br/precos) (ou, no código, `await api.planos()`). Para assinar o Pro direto: [apipj.com.br/painel?assinar=pro](https://apipj.com.br/painel?assinar=pro).

## TypeScript

Os tipos vêm no pacote: `EmpresaCompleta`, `EmpresaSimplificada`, `Validacao`, `Status`, `Plano`, `Planos`, `ResultadoLote`, `OpcoesApipj`, `ApipjErro` e os tipos aninhados (`Socio`, `Endereco`, `CodigoDescricao`...). O retorno de `consultar` acompanha o `formato`:

```ts
import { Apipj, type EmpresaCompleta, type EmpresaSimplificada } from 'apipj';

const api = new Apipj();
const completa: EmpresaCompleta | null = await api.consultar('11378117000120');
const simples: EmpresaSimplificada | null = await api.consultar('11378117000120', { formato: 'simplificado' });
```

## Outros ambientes

```js
// Deno
import { Apipj } from 'npm:apipj';
const api = new Apipj({ chave: Deno.env.get('APIPJ_KEY') });

// Edge/serverless sem process.env: passe a chave explicitamente
const apiEdge = new Apipj({ chave: env.APIPJ_KEY });
```

Também é possível passar um `fetch` próprio: `new Apipj({ fetch: meuFetch })`.

## Links

- Documentação da API: [apipj.com.br/docs](https://apipj.com.br/docs)
- OpenAPI: [apipj.com.br/openapi-publica.json](https://apipj.com.br/openapi-publica.json)
- Consultar CNPJ por IA (servidor MCP): [apipj.com.br/guias/consultar-cnpj-ia-mcp](https://apipj.com.br/guias/consultar-cnpj-ia-mcp)
- Preços: [apipj.com.br/precos](https://apipj.com.br/precos)

## Licença

[MIT](LICENSE). Os dados vêm dos dados abertos do CNPJ publicados pela Receita Federal.
