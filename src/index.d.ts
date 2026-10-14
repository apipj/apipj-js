// Tipos do pacote apipj (escritos à mão; conferidos com https://apipj.com.br/openapi-publica.json).

// ------------------------------------------------------------------ respostas da API

/** Par código/descrição da Receita Federal. */
export interface CodigoDescricao {
  /** Código da Receita Federal. */
  codigo: string | null;
  descricao: string | null;
}

export interface Telefone {
  ddd: string | null;
  /** Número, só dígitos. */
  numero: string | null;
}

/** Opção pelo Simples Nacional ou pelo MEI. */
export interface OpcaoRegime {
  optante: boolean;
  /** AAAA-MM-DD */
  data_opcao: string | null;
  /** AAAA-MM-DD */
  data_exclusao: string | null;
}

export interface RepresentanteLegal {
  /** CPF mascarado. */
  cpf: string | null;
  nome: string | null;
  qualificacao: CodigoDescricao | null;
}

export interface Socio {
  nome: string | null;
  /** PESSOA FISICA, PESSOA JURIDICA ou ESTRANGEIRO. */
  tipo: 'PESSOA FISICA' | 'PESSOA JURIDICA' | 'ESTRANGEIRO' | (string & {}) | null;
  /** CPF já mascarado pela Receita (***123456**) ou raiz de 8 caracteres do CNPJ do sócio pessoa jurídica. */
  cpf_cnpj: string | null;
  qualificacao: CodigoDescricao | null;
  /** Entrada na sociedade (AAAA-MM-DD). */
  data_entrada: string | null;
  faixa_etaria: string | null;
  /** País (sócio estrangeiro). */
  pais: string | null;
  representante_legal: RepresentanteLegal | null;
}

export interface Municipio {
  /** Código do município na Receita Federal. */
  codigo_rfb: string | null;
  /** Código IBGE (7 dígitos). */
  codigo_ibge: string | null;
  nome: string | null;
}

export interface Endereco {
  /** RUA, AVENIDA... */
  tipo_logradouro: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  /** CEP, só dígitos. */
  cep: string | null;
  municipio: Municipio;
  uf: string | null;
  /** País (endereço no exterior). */
  pais: string | null;
  cidade_exterior: string | null;
}

export interface SituacaoCadastral {
  codigo: string | null;
  /** ATIVA, BAIXADA, INAPTA, SUSPENSA ou NULA. */
  descricao: 'ATIVA' | 'BAIXADA' | 'INAPTA' | 'SUSPENSA' | 'NULA' | (string & {}) | null;
  /** Data da situação (AAAA-MM-DD). */
  data: string | null;
  motivo: CodigoDescricao | null;
}

export interface SituacaoEspecial {
  descricao: string | null;
  /** AAAA-MM-DD */
  data: string | null;
}

/**
 * Documento no formato `completo` (padrão). Campos ausentes na base da Receita vêm como `null`;
 * nenhuma chave some.
 */
export interface EmpresaCompleta {
  /** 14 caracteres, sem pontuação. */
  cnpj: string;
  /** AA.AAA.AAA/AAAA-DD */
  cnpj_formatado: string;
  razao_social: string;
  nome_fantasia: string | null;
  /** MATRIZ ou FILIAL. */
  matriz_filial: 'MATRIZ' | 'FILIAL' | (string & {});
  situacao_cadastral: SituacaoCadastral;
  situacao_especial: SituacaoEspecial;
  /** Início da atividade (AAAA-MM-DD). */
  data_inicio_atividade: string | null;
  natureza_juridica: CodigoDescricao | null;
  qualificacao_responsavel: CodigoDescricao | null;
  porte: CodigoDescricao | null;
  /** Capital social em reais. */
  capital_social: number | null;
  cnae_principal: CodigoDescricao | null;
  cnaes_secundarios: CodigoDescricao[];
  endereco: Endereco;
  telefones: Telefone[];
  fax: Telefone | null;
  email: string | null;
  /** Ente federativo responsável (administração pública). */
  ente_federativo_responsavel: string | null;
  simples: OpcaoRegime;
  mei: OpcaoRegime;
  socios: Socio[];
  /** Mês do lote da Receita Federal (AAAA-MM). */
  atualizado_em: string;
}

export interface AtividadeSimplificada {
  /** CNAE com máscara, por exemplo 62.01-5-01. */
  code: string;
  text: string;
}

export interface SocioSimplificado {
  nome: string;
  /** Código e descrição da qualificação, por exemplo `10-Diretor`. */
  qual: string;
  pais_origem: string;
  nome_rep_legal: string;
  qual_rep_legal: string;
}

export interface RegimeSimplificado {
  optante: boolean;
  /** DD/MM/AAAA */
  data_opcao: string | null;
  /** DD/MM/AAAA */
  data_exclusao: string | null;
  /** ISO 8601 */
  ultima_atualizacao: string;
}

/**
 * Documento no formato `simplificado`: plano, com datas DD/MM/AAAA, CNPJ, CEP e telefone
 * já formatados e vazios como "".
 */
export interface EmpresaSimplificada {
  /** DD/MM/AAAA */
  abertura: string;
  situacao: string;
  /** MATRIZ ou FILIAL. */
  tipo: string;
  nome: string;
  fantasia: string;
  porte: string;
  /** Por exemplo `206-2 - Sociedade Empresária Limitada`. */
  natureza_juridica: string;
  atividade_principal: AtividadeSimplificada[];
  atividades_secundarias: AtividadeSimplificada[];
  qsa: SocioSimplificado[];
  logradouro: string;
  numero: string;
  complemento: string;
  municipio: string;
  bairro: string;
  uf: string;
  /** 00.000-000 */
  cep: string;
  email: string;
  /** Telefones com máscara separados por " / ". */
  telefone: string;
  /** DD/MM/AAAA */
  data_situacao: string;
  /** AA.AAA.AAA/AAAA-DD */
  cnpj: string;
  /** ISO 8601 */
  ultima_atualizacao: string;
  status: string;
  /** Ente federativo responsável. */
  efr: string;
  motivo_situacao: string;
  situacao_especial: string;
  data_situacao_especial: string;
  /** Com duas casas decimais, por exemplo `"218878.00"`. */
  capital_social: string;
  simples: RegimeSimplificado;
  simei: RegimeSimplificado;
  extra: Record<string, unknown>;
  billing: { free: boolean; database: boolean; [campo: string]: unknown };
}

/** Resposta de `GET /v1/valida/{cnpj}` (e de `validarLocal`). */
export interface Validacao {
  /** Entrada normalizada (sem pontuação, maiúsculas). */
  cnpj: string;
  valido: boolean;
  /** AA.AAA.AAA/AAAA-DD quando válido. */
  formatado: string | null;
  /** true se a raiz ou a ordem têm letras. */
  alfanumerico: boolean;
  /** Motivo quando inválido. */
  erro: string | null;
}

/** Resposta de `GET /v1/status`. */
export interface Status {
  /** DEGRADED: base indisponível (a consulta responde 503). */
  status: 'OK' | 'DEGRADED';
  /** Mês do lote da Receita Federal (AAAA-MM). */
  dataset_month: string | null;
  /** Quando a base foi gerada (ISO 8601). */
  dataset_generated_at?: string | null;
  /** Quantidade de CNPJs na base. */
  rows: number | null;
  /** Versão da API. */
  version: string;
  /** Hora do servidor (ISO 8601). */
  time: string;
}

export interface Plano {
  /** free, dev, pro... */
  id: string;
  name: string;
  /** Preço mensal (BRL). */
  price: number;
  /** Consultas por minuto. */
  rpm: number;
  /** Consultas por mês. */
  monthly_quota: number;
  description: string | null;
}

/** Resposta de `GET /v1/plans`. */
export interface Planos {
  /** Versão vigente dos termos de uso. */
  tos_version: string;
  currency: string;
  plans: Plano[];
  billing: {
    provider: string;
    test_mode: boolean;
    /** Assinaturas abertas. */
    available: boolean;
    /** Checkout pede CPF/CNPJ. */
    requires_document: boolean;
  };
}

// ------------------------------------------------------------------ cliente

export interface OpcoesApipj {
  /** Chave de API (`apipj_live_...`). Padrão: variável de ambiente APIPJ_KEY, lida só quando for preciso. Sem nenhuma, a consulta usa o limite de teste por IP. */
  chave?: string;
  /** false desliga o aviso único de consulta sem chave. Padrão: true. */
  avisos?: boolean;
  /** Padrão: https://apipj.com.br */
  baseUrl?: string;
  /** Tempo máximo de cada tentativa, em ms. Padrão: 10000 (0 desliga). */
  timeoutMs?: number;
  /** Tentativas por chamada, contando a primeira. Padrão: 3. */
  tentativas?: number;
  /** Implementação de fetch alternativa. Padrão: `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Base do backoff de 5xx e falhas de rede, em ms (1 s, 2 s, 4 s...). Padrão: 1000. Útil em testes. */
  esperaBaseMs?: number;
  /** Janela do limite por minuto, em ms. Padrão: 60000. Útil em testes. */
  janelaMs?: number;
}

export type Formato = 'completo' | 'simplificado';

export interface OpcoesChamada {
  signal?: AbortSignal;
}

export interface OpcoesConsulta extends OpcoesChamada {
  /** Padrão: `completo`. */
  formato?: Formato;
}

export interface OpcoesLote extends OpcoesConsulta {
  /** Requisições em paralelo. Padrão: 4. */
  simultaneas?: number;
  /** Teto de consultas por minuto, abaixo do limite do plano (opcional; o do plano é lido dos cabeçalhos). */
  rpm?: number;
}

export interface ResultadoLote<T = EmpresaCompleta> {
  /** CNPJ normalizado (14 caracteres, sem pontuação). */
  cnpj: string;
  /** Documento, ou `null` se não está na base (404), é inválido ou deu erro. */
  documento: T | null;
  /** Presente quando o CNPJ é inválido (`invalid_cnpj`) ou a consulta falhou depois das tentativas. */
  erro?: ApipjErro | Error;
}

export interface Limites {
  /** true quando a consulta foi feita sem chave (limite de teste por IP). */
  semChave: boolean;
  porMinuto: { limite: number | null; restante: number | null; reset: number | null };
  /** `reset`: epoch Unix (segundos) em que a cota zera. Sem chave, vem tudo null. */
  mensal: { limite: number | null; restante: number | null; reset: number | null };
  /** Só sem chave: limite por dia por IP; `reset` em epoch Unix. */
  diario: { limite: number | null; restante: number | null; reset: number | null };
}

export class Apipj {
  constructor(opcoes?: OpcoesApipj);
  readonly baseUrl: string;
  timeoutMs: number;
  tentativas: number;
  /** Limites informados pela última consulta autenticada (X-RateLimit-* e X-Quota-*). */
  limites: Limites | null;

  /** Documento completo, ou `null` se o CNPJ não está na base (404). Sem chave, usa o limite de teste por IP. */
  consultar(cnpj: string, opcoes: OpcoesConsulta & { formato: 'simplificado' }): Promise<EmpresaSimplificada | null>;
  consultar(cnpj: string, opcoes?: OpcoesConsulta & { formato?: 'completo' }): Promise<EmpresaCompleta | null>;
  consultar(cnpj: string, opcoes?: OpcoesConsulta): Promise<EmpresaCompleta | EmpresaSimplificada | null>;

  /** `GET /v1/valida/{cnpj}`: sem chave e sem cota. Para validar offline, use `cnpjValido()`. */
  validar(cnpj: string, opcoes?: OpcoesChamada): Promise<Validacao>;
  /** `GET /v1/status` */
  status(opcoes?: OpcoesChamada): Promise<Status>;
  /** `GET /v1/plans` */
  planos(opcoes?: OpcoesChamada): Promise<Planos>;

  /** Consulta em lote respeitando o limite por minuto; resultados na ordem de conclusão. */
  consultarVarios(
    lista: Iterable<string> | AsyncIterable<string>,
    opcoes: OpcoesLote & { formato: 'simplificado' },
  ): AsyncGenerator<ResultadoLote<EmpresaSimplificada>, void, undefined>;
  consultarVarios(
    lista: Iterable<string> | AsyncIterable<string>,
    opcoes?: OpcoesLote & { formato?: 'completo' },
  ): AsyncGenerator<ResultadoLote<EmpresaCompleta>, void, undefined>;
  consultarVarios(
    lista: Iterable<string> | AsyncIterable<string>,
    opcoes?: OpcoesLote,
  ): AsyncGenerator<ResultadoLote<EmpresaCompleta | EmpresaSimplificada>, void, undefined>;
}

export type CodigoErro =
  | 'invalid_cnpj'
  | 'validation_error'
  | 'unauthorized'
  | 'not_found'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'dataset_unavailable'
  | 'server_error'
  | 'network_error'
  | 'timeout'
  | 'invalid_response'
  | 'fetch_unavailable'
  | 'aborted'
  | (string & {});

export interface ExtrasErro {
  retryAfter?: number | null;
  upgradeUrl?: string | null;
  signupUrl?: string | null;
  reset?: number | null;
  cnpj?: string | null;
  details?: unknown;
  corpo?: unknown;
  cause?: unknown;
}

export class ApipjErro extends Error {
  constructor(status: number, code: CodigoErro, message: string, extras?: ExtrasErro);
  readonly name: 'ApipjErro';
  /** Status HTTP, ou 0 para falha de rede/tempo esgotado. */
  status: number;
  code: CodigoErro;
  /** Segundos a esperar (só em `rate_limited`). */
  retryAfter: number | null;
  /** Página de planos (só em `quota_exceeded`). */
  upgradeUrl: string | null;
  signupUrl: string | null;
  /** Epoch Unix (s) em que a cota mensal zera (só em `quota_exceeded`). */
  reset: number | null;
  /** Entrada normalizada (só em `invalid_cnpj`). */
  cnpj: string | null;
  /** Detalhes de `validation_error`. */
  details: unknown;
  /** Corpo da resposta, quando houve. */
  corpo: unknown;
}

// ------------------------------------------------------------------ utilitários locais (offline)

/** Formato e dígitos verificadores válidos (numérico ou alfanumérico). Não diz se o CNPJ existe. */
export function cnpjValido(entrada: string): boolean;
/** Remove `.`, `/`, `-` e espaços e passa para maiúsculas. */
export function normalizarCnpj(entrada: string): string;
/** `AA.AAA.AAA/AAAA-DD`; se não tiver 14 caracteres, devolve a entrada normalizada. */
export function formatarCnpj(entrada: string): string;
/** Os dois dígitos verificadores de uma base de 12 caracteres [A-Z0-9]. */
export function calcularDv(base12: string): string;
/** Validação local no mesmo formato de `GET /v1/valida/{cnpj}`. */
export function validarLocal(entrada: string): Validacao;
/** Versão deste pacote. */
export const VERSAO: string;
