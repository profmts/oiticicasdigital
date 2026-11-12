// Testes do módulo fiscal: montagem do payload da NFC-e e mapeamento de forma de pagamento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNfcePayload, formaPagamento, type FiscalConfig } from '../server/services/fiscal.js';

const cfg: FiscalConfig = {
  enabled: true, provider: 'focus', ambiente: 'homolog', cnpj: '12345678000190', ie: '16123456',
  regime: 'simples', csc: 'ABC', csc_id: '000001', token: 'tok', auto_emit: false,
};
const order = { id: 7, number: 123, subtotal_cents: 3800, discount_cents: 0, total_cents: 3800, payments: [{ method: 'Pix', amount_cents: 3800 }] };
const items = [
  { name: 'Espetinho de carne', qty: 2, unit_price_cents: 800, total_cents: 1600, ncm: '1602.50.00', cfop: '5102', origem: '0', tax_class: 'normal', product_id: 10 },
  { name: 'Refrigerante', qty: 1, unit_price_cents: 600, total_cents: 600, ncm: null, cfop: null, origem: '0', tax_class: 'isento', product_id: 11 },
];

test('buildNfcePayload: totais em reais e itens mapeados', () => {
  const p = buildNfcePayload(cfg, order, items);
  assert.equal(p.cnpj_emitente, '12345678000190');
  assert.equal(p.valor_total, '38.00');
  assert.equal(p.valor_produtos, '38.00');
  assert.equal(p.items.length, 2);
  assert.equal(p.items[0].codigo_ncm, '16025000'); // só dígitos
  assert.equal(p.items[0].cfop, '5102');
  assert.equal(p.items[0].valor_unitario_comercial, '8.00');
  assert.equal(p.items[0].valor_bruto, '16.00');
  assert.equal(p.items[0].icms_situacao_tributaria, '102'); // Simples, tributado
  assert.equal(p.items[1].codigo_ncm, '21069090'); // NCM padrão quando ausente
  assert.equal(p.items[1].icms_situacao_tributaria, '400'); // isento no Simples
});

test('buildNfcePayload: CPF entra só com 11 dígitos', () => {
  const comCpf = buildNfcePayload(cfg, order, items, '123.456.789-09');
  assert.equal((comCpf as any).cpf_destinatario, '12345678909');
  const semCpf = buildNfcePayload(cfg, order, items, '123');
  assert.equal((semCpf as any).cpf_destinatario, undefined);
});

test('buildNfcePayload: pagamento Pix vira código 17', () => {
  const p = buildNfcePayload(cfg, order, items);
  assert.equal(p.formas_pagamento[0].forma_pagamento, '17');
  assert.equal(p.formas_pagamento[0].valor_pagamento, '38.00');
});

test('formaPagamento: mapeia nomes comuns', () => {
  assert.equal(formaPagamento('Dinheiro'), '01');
  assert.equal(formaPagamento('Pix'), '17');
  assert.equal(formaPagamento('Cartão de débito'), '04');
  assert.equal(formaPagamento('Cartão de crédito'), '03');
  assert.equal(formaPagamento('Outro'), '99');
});
