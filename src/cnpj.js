// Validação, normalização e formatação de CNPJ, 100% local (sem rede).
//
// Vale para o CNPJ numérico e para o alfanumérico (IN RFB 2.229/2024):
// - 14 caracteres: posições 1 a 12 em [A-Z0-9], posições 13 e 14 (dígitos verificadores) numéricas;
// - valor de cada caractere = código ASCII - 48 ('0'..'9' => 0..9, 'A'..'Z' => 17..42);
// - DV1 com pesos 5,4,3,2,9,8,7,6,5,4,3,2 e DV2 com pesos 6,5,4,3,2,9,8,7,6,5,4,3,2;
// - resto = soma % 11; DV = 0 se resto < 2, senão 11 - resto;
// - '00000000000000' é inválido mesmo com o DV "certo".

const PESOS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const RE_CNPJ = /^[A-Z0-9]{12}[0-9]{2}$/;

/**
 * Remove pontuação (`.`, `/`, `-`) e espaços e converte para maiúsculas. Não valida.
 *
 * @param {string} entrada CNPJ com ou sem máscara.
 * @returns {string} CNPJ normalizado (pode ter tamanho diferente de 14 se a entrada for inválida).
 * @example normalizarCnpj('12.abc.345/01de-35') // '12ABC34501DE35'
 */
export function normalizarCnpj(entrada) {
  if (entrada === null || entrada === undefined) return '';
  return String(entrada).toUpperCase().replace(/[.\/\s-]/g, '');
}

/**
 * Calcula os dois dígitos verificadores de uma base de 12 caracteres [A-Z0-9].
 *
 * @param {string} base12
 * @returns {string} os dois dígitos, por exemplo `'35'`.
 */
export function calcularDv(base12) {
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < 12; i++) {
    const v = base12.charCodeAt(i) - 48;
    s1 += v * PESOS[i + 1];
    s2 += v * PESOS[i];
  }
  const dv1 = s1 % 11 < 2 ? 0 : 11 - (s1 % 11);
  s2 += dv1 * PESOS[12];
  const dv2 = s2 % 11 < 2 ? 0 : 11 - (s2 % 11);
  return `${dv1}${dv2}`;
}

/**
 * Validação local com o mesmo formato de resposta de `GET /v1/valida/{cnpj}`.
 *
 * @param {string} entrada
 * @returns {import('./index.js').Validacao}
 */
export function validarLocal(entrada) {
  const cnpj = normalizarCnpj(entrada);
  const base = { cnpj, valido: false, formatado: null, alfanumerico: false, erro: null };
  if (cnpj.length === 0) return { ...base, erro: 'CNPJ vazio' };
  if (cnpj.length !== 14) return { ...base, erro: `CNPJ deve ter 14 caracteres (recebido ${cnpj.length})` };
  if (!RE_CNPJ.test(cnpj)) {
    if (/[^A-Z0-9]/.test(cnpj)) {
      return { ...base, erro: 'CNPJ contém caracteres inválidos (permitidos: letras A-Z e dígitos)' };
    }
    return { ...base, erro: 'Os dois últimos caracteres (dígitos verificadores) devem ser numéricos' };
  }
  if (cnpj === '00000000000000') return { ...base, erro: 'CNPJ zerado é inválido' };
  if (cnpj.slice(12) !== calcularDv(cnpj.slice(0, 12))) return { ...base, erro: 'Dígitos verificadores inválidos' };
  return { cnpj, valido: true, formatado: formatarCnpj(cnpj), alfanumerico: /[A-Z]/.test(cnpj.slice(0, 12)), erro: null };
}

/**
 * `true` se o CNPJ (numérico ou alfanumérico, com ou sem máscara) tem formato e dígitos verificadores válidos.
 * Local e offline: não consulta a API nem diz se o CNPJ existe na base da Receita Federal.
 *
 * @param {string} entrada
 * @returns {boolean}
 * @example cnpjValido('12.ABC.345/01DE-35') // true
 */
export function cnpjValido(entrada) {
  return validarLocal(entrada).valido;
}

/**
 * Formata como `AA.AAA.AAA/AAAA-DD`. Se a entrada normalizada não tiver 14 caracteres,
 * devolve a entrada normalizada sem máscara. Não confere os dígitos verificadores.
 *
 * @param {string} entrada
 * @returns {string}
 * @example formatarCnpj('11378117000120') // '11.378.117/0001-20'
 */
export function formatarCnpj(entrada) {
  const c = normalizarCnpj(entrada);
  if (c.length !== 14) return c;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
