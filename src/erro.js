/**
 * Erro lançado pelo cliente apipj.
 *
 * - `status`: status HTTP da resposta (400, 401, 429, 5xx) ou `0` para falha de rede ou tempo esgotado.
 * - `code`: código estável em snake_case (`invalid_cnpj`, `unauthorized`, `rate_limited`,
 *   `quota_exceeded`, `dataset_unavailable`, `validation_error`, `network_error`, `timeout`...).
 * - `retryAfter`: segundos a esperar (só em `rate_limited`).
 * - `upgradeUrl`: página de planos (`quota_exceeded` e `rate_limited` com chave).
 * - `signupUrl`: página para criar a chave grátis (429 da consulta sem chave, ou 401 com ela fechada).
 */
export class ApipjErro extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {{ retryAfter?: number|null, upgradeUrl?: string|null, signupUrl?: string|null, reset?: number|null, cnpj?: string|null, details?: unknown, corpo?: unknown, cause?: unknown }} [extras]
   */
  constructor(status, code, message, extras = {}) {
    super(message, extras.cause === undefined ? undefined : { cause: extras.cause });
    this.name = 'ApipjErro';
    /** @type {number} */
    this.status = status;
    /** @type {string} */
    this.code = code;
    /** @type {number|null} */
    this.retryAfter = extras.retryAfter ?? null;
    /** @type {string|null} */
    this.upgradeUrl = extras.upgradeUrl ?? null;
    /** @type {string|null} */
    this.signupUrl = extras.signupUrl ?? null;
    /** @type {number|null} */
    this.reset = extras.reset ?? null;
    /** @type {string|null} */
    this.cnpj = extras.cnpj ?? null;
    /** @type {unknown} */
    this.details = extras.details ?? null;
    /** @type {unknown} */
    this.corpo = extras.corpo ?? null;
  }
}
