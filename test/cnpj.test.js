import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cnpjValido, normalizarCnpj, formatarCnpj, calcularDv, validarLocal, VERSAO } from '../src/index.js';

test('CNPJs numéricos válidos', () => {
  for (const c of ['11378117000120', '11.378.117/0001-20', '00.000.000/0001-91', '11.222.333/0001-81', ' 11 222 333 0001 81 ']) {
    assert.equal(cnpjValido(c), true, c);
  }
});

test('CNPJs numéricos inválidos', () => {
  for (const c of ['11378117000121', '11.378.117/0001-02', '00000000000000', '00.000.000/0000-00', '', '1137811700012', '113781170001200']) {
    assert.equal(cnpjValido(c), false, c);
  }
  assert.equal(cnpjValido(null), false);
  assert.equal(cnpjValido(undefined), false);
});

test('CNPJ alfanumérico: 12ABC34501DE35 válido, -36 inválido', () => {
  assert.equal(calcularDv('12ABC34501DE'), '35');
  assert.equal(cnpjValido('12ABC34501DE35'), true);
  assert.equal(cnpjValido('12.ABC.345/01DE-35'), true);
  assert.equal(cnpjValido('12.abc.345/01de-35'), true, 'minúsculas são aceitas');
  assert.equal(cnpjValido('12ABC34501DE36'), false);
  assert.equal(cnpjValido('12.ABC.345/01DE-36'), false);
});

test('CNPJ alfanumérico: valor = ASCII - 48 e pesos 6,5,4,3,2,9,8,7,6,5,4,3,2', () => {
  // cálculo independente, à mão, para conferir a implementação
  const dv = (base) => {
    const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const um = (s, p) => {
      const soma = [...s].reduce((acc, ch, i) => acc + (ch.charCodeAt(0) - 48) * p[i], 0);
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const d1 = um(base, pesos.slice(1));
    const d2 = um(base + d1, pesos);
    return `${d1}${d2}`;
  };
  for (const base of ['12ABC34501DE', 'AAAAAAAAAAAA', 'ZZZZZZZZ0001', '0000000A0001', 'X1Y2Z3W40001', '112223330001', '000000000001']) {
    assert.equal(calcularDv(base), dv(base), base);
    assert.equal(cnpjValido(base + dv(base)), true, base);
  }
});

test('DV com letra, caractere estranho e tamanho errado são inválidos', () => {
  const casos = {
    '12ABC34501DE3A': 'Os dois últimos caracteres (dígitos verificadores) devem ser numéricos',
    '12ABC34501D$35': 'CNPJ contém caracteres inválidos (permitidos: letras A-Z e dígitos)',
    '12ABC34501DE3': 'CNPJ deve ter 14 caracteres (recebido 13)',
    '': 'CNPJ vazio',
    '00000000000000': 'CNPJ zerado é inválido',
    '12ABC34501DE36': 'Dígitos verificadores inválidos',
  };
  for (const [entrada, erro] of Object.entries(casos)) {
    const v = validarLocal(entrada);
    assert.equal(v.valido, false, entrada);
    assert.equal(v.erro, erro, entrada);
    assert.equal(v.formatado, null);
  }
});

test('validarLocal devolve o mesmo formato de /v1/valida', () => {
  assert.deepEqual(validarLocal('12.abc.345/01de-35'), {
    cnpj: '12ABC34501DE35', valido: true, formatado: '12.ABC.345/01DE-35', alfanumerico: true, erro: null,
  });
  assert.deepEqual(validarLocal('11378117000120'), {
    cnpj: '11378117000120', valido: true, formatado: '11.378.117/0001-20', alfanumerico: false, erro: null,
  });
});

test('normalizarCnpj e formatarCnpj', () => {
  assert.equal(normalizarCnpj('12.abc.345/01de-35'), '12ABC34501DE35');
  assert.equal(normalizarCnpj(' 11.378.117/0001-20 '), '11378117000120');
  assert.equal(normalizarCnpj(null), '');
  assert.equal(formatarCnpj('11378117000120'), '11.378.117/0001-20');
  assert.equal(formatarCnpj('12abc34501de35'), '12.ABC.345/01DE-35');
  assert.equal(formatarCnpj('123'), '123');
});

test('VERSAO acompanha o package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSAO, pkg.version);
});
