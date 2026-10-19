// Testes das máscaras de entrada (dinheiro, telefone, CPF) usadas nos formulários.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskCents, maskPhone, maskCpf, parseMoney } from '../client/src/lib/format.ts';

test('maskCents: centavos, reais e milhares', () => {
  assert.equal(maskCents(''), '');
  assert.equal(maskCents('5'), '0,05');
  assert.equal(maskCents('50'), '0,50');
  assert.equal(maskCents('1250'), '12,50');
  assert.equal(maskCents('123456'), '1.234,56');
  assert.equal(maskCents('abc12'), '0,12'); // ignora o que não é número
  // o valor mascarado continua sendo lido corretamente em centavos
  assert.equal(parseMoney('1.234,56'), 123456);
  assert.equal(parseMoney('12,50'), 1250);
});

test('maskPhone: celular (11) e fixo (10) com o 9 a mais', () => {
  assert.equal(maskPhone('83999998888'), '(83) 99999-8888');
  assert.equal(maskPhone('8333334444'), '(83) 3333-4444');
  assert.equal(maskPhone('83'), '(83');
  assert.equal(maskPhone('839999988889999'), '(83) 99999-8888'); // corta em 11 dígitos
});

test('maskCpf: 000.000.000-00', () => {
  assert.equal(maskCpf('12345678901'), '123.456.789-01');
  assert.equal(maskCpf('123456'), '123.456');
  assert.equal(maskCpf('123'), '123');
});
