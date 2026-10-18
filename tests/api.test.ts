/**
 * Testes de integração da API (servidor real + banco MySQL/MariaDB de teste, recriado a cada execução).
 * Banco: TEST_DATABASE_URL (padrão mysql://od:od123@127.0.0.1:3306/oiticicas_test). NUNCA aponte para produção.
 * Cobrem o checklist operacional, o isolamento entre empresas (SaaS) e o pedido pelo QR Code da mesa.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';

import mysql from 'mysql2/promise';
const TEST_URL = process.env.TEST_DATABASE_URL || 'mysql://od:od123@127.0.0.1:3306/oiticicas_test';
{
  const u = new URL(TEST_URL); const name = u.pathname.slice(1);
  if (!/_test$/.test(name)) throw new Error('O banco de teste precisa terminar em _test (proteção contra apagar dados reais).');
  u.pathname = '/';
  const c = await mysql.createConnection(u.toString());
  await c.query(`DROP DATABASE IF EXISTS \`${name}\``);
  await c.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await c.end();
}
process.env.DATABASE_URL = TEST_URL;
const { openDatabase } = await import('../server/db.js');
const { createApp } = await import('../server/app.js');

let server: Server; let base = ''; let db: any;

class Client {
  cookies: Record<string, string> = {};
  get cookie() { return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; '); }
  async req(method: string, url: string, body?: unknown) {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const [k, v] = kv.split('='); if (v) this.cookies[k] = v; else delete this.cookies[k]; }
    const text = await r.text();
    let data: any = text; try { data = JSON.parse(text); } catch { /* csv */ }
    return { status: r.status, data };
  }
  get(u: string) { return this.req('GET', u); }
  post(u: string, b: unknown = {}) { return this.req('POST', u, b); }
  put(u: string, b: unknown) { return this.req('PUT', u, b); }
  del(u: string, b: unknown = {}) { return this.req('DELETE', u, b); }
  async login(username: string, password = 'senha123', company = 'espetinho-do-sergio') { const r = await this.post('/api/auth/login', { company, username, password }); assert.equal(r.status, 200, JSON.stringify(r.data)); return this; }
}
const ok = (r: { status: number; data: any }, code = 200) => { assert.equal(r.status, code, JSON.stringify(r.data)); return r.data; };
const SLUG = 'espetinho-do-sergio';

const plat = new Client(); const admin = new Client(); const caixa = new Client(); const garcom = new Client(); const garcom2 = new Client();
const cozinha = new Client(); const moto = new Client(); const moto2 = new Client(); const publico = new Client(); const outra = new Client();
let menu: any; const users: Record<string, number> = {}; let espId = 0;
const variant = (name: string, vname = 'Único') => { for (const c of menu.categories) for (const p of c.products) if (p.name === name) return p.variants.find((v: any) => v.name === vname).id; throw new Error('produto ' + name); };
const optionId = (name: string) => { for (const c of menu.categories) for (const p of c.products) for (const g of p.option_groups) for (const o of g.options) if (o.name === name) return o.id; throw new Error(name); };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());

before(async () => {
  db = await openDatabase(process.env.DATABASE_URL);
  const app = await createApp(db);
  await new Promise<void>((r) => { server = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(async () => { server.close(); await db.close(); });

test('01 plataforma: primeiro acesso, Espetinho criado automaticamente, administrador da empresa', async () => {
  assert.equal(ok(await plat.get('/api/platform/setup-needed')).needed, true);
  ok(await plat.post('/api/platform/setup', { name: 'Dono da plataforma', username: 'root', password: 'senhaMuitoForte1' }));
  assert.equal((await new Client().post('/api/platform/setup', { name: 'X', username: 'hack', password: 'senhaMuitoForte1' })).status, 403);
  const tenants = ok(await plat.get('/api/platform/tenants'));
  const esp = tenants.find((t: any) => t.slug === SLUG);
  assert.ok(esp, 'Espetinho do Sergio existe'); espId = esp.id;
  ok(await plat.post(`/api/platform/tenants/${espId}/admins`, { name: 'Sergio', username: 'sergio', password: 'senhaForte123' }));
  await admin.login('sergio', 'senhaForte123');
  const me = ok(await admin.get('/api/auth/me'));
  assert.equal(me.user.role, 'admin'); assert.equal(me.tenant.slug, SLUG); assert.ok(me.tenant.logo_url, 'logo da empresa preservada');
  assert.match((await db.get("SELECT password_hash FROM users WHERE username = 'sergio'")).password_hash, /^\$2[aby]\$12\$/);
  assert.equal((await new Client().get('/api/platform/tenants')).status, 401);
  assert.equal((await admin.get('/api/platform/tenants')).status, 401, 'empresa não acessa a plataforma');
});

test('02 usuários por perfil e login de cada perfil', async () => {
  for (const [username, role] of [['caixa1', 'caixa'], ['ana', 'garcom'], ['beto', 'garcom'], ['coz', 'cozinha'], ['caio', 'motoboy'], ['davi', 'motoboy'], ['gerente1', 'gerente']]) {
    users[username] = ok(await admin.post('/api/admin/users', { name: username.toUpperCase(), username, role, password: 'senha123' })).id;
  }
  await caixa.login('caixa1'); await garcom.login('ana'); await garcom2.login('beto'); await cozinha.login('coz'); await moto.login('caio'); await moto2.login('davi');
  assert.equal((await new Client().post('/api/auth/login', { company: SLUG, username: 'ana', password: 'errada' })).status, 401);
  assert.equal((await new Client().post('/api/auth/login', { company: 'outra-empresa', username: 'ana', password: 'senha123' })).status, 401);
});

test('03 restrições de acesso por perfil', async () => {
  assert.equal((await garcom.get('/api/admin/dashboard')).status, 403);
  assert.equal((await cozinha.get('/api/orders')).status, 403);
  assert.equal((await moto.get('/api/orders')).status, 403);
  assert.equal((await caixa.get('/api/admin/users')).status, 403);
  assert.equal((await caixa.put('/api/admin/settings', { is_open: true })).status, 403);
  assert.equal((await new Client().get('/api/orders')).status, 401);
  const me = ok(await admin.get('/api/auth/me')).user;
  assert.equal((await admin.put(`/api/admin/users/${me.id}`, { name: 'Sergio', username: 'sergio', role: 'gerente' })).status, 403);
});

test('04 cardápio do Espetinho preservado com os preços oficiais', async () => {
  menu = ok(await publico.get(`/api/public/${SLUG}/menu`));
  assert.deepEqual(menu.categories.map((c: any) => c.name), ['Espetos', 'Combos', 'Porções', 'Cervejas', 'Long neck', 'Sucos naturais', 'Refrigerantes e águas']);
  const find = (n: string) => menu.categories.flatMap((c: any) => c.products).find((p: any) => p.name === n);
  assert.equal(find('Espeto de carne de sol c/ queijo').variants[0].price_cents, 1200);
  assert.deepEqual(find('Creme de galinha').variants.map((v: any) => [v.name, v.price_cents]), [['Pequena', 1300], ['Grande', 1800]]);
  assert.deepEqual(find('Combo (porção individual)').variants.map((v: any) => v.price_cents), [2000, 1500]);
  assert.equal(menu.settings.whatsapp, '5583998361492');
  assert.equal(menu.settings.brand_color, '#f07a1a');
  assert.equal(menu.zones.length, 0, 'nenhuma taxa inventada');
  assert.equal(menu.categories.reduce((s: number, c: any) => s + c.products.length, 0), 56);
  assert.equal((await publico.get('/api/public/nao-existe/menu')).status, 404);
});

test('05 cadastro e edição de produto com auditoria de preço', async () => {
  const cat = menu.categories.find((c: any) => c.name === 'Porções');
  const r = ok(await admin.post('/api/products', { category_id: cat.id, name: 'Produto Teste', order_types: ['delivery', 'retirada', 'mesa', 'balcao'], variants: [{ name: 'Único', price_cents: 999 }] }));
  const cat2 = ok(await admin.get('/api/catalog?all=1'));
  const p = cat2.categories.flatMap((c: any) => c.products).find((x: any) => x.id === r.id);
  ok(await admin.put(`/api/products/${r.id}`, { category_id: cat.id, name: 'Produto Teste', order_types: ['balcao'], active: false, variants: [{ id: p.variants[0].id, name: 'Único', price_cents: 1099 }] }));
  const log = ok(await admin.get('/api/admin/audit?action=product'));
  assert.ok(log.some((l: any) => l.action === 'product.update' && l.data_json.priceChanges[0].to === 1099));
});

test('06 loja fechada recusa pedido online; aberta aceita', async () => {
  const body = { idempotency_key: 'k-fechado-000', type: 'retirada', customer_name: 'João', customer_phone: '83999990000', items: [{ variant_id: variant('Espeto de carne'), qty: 1 }] };
  assert.equal((await publico.post(`/api/public/${SLUG}/orders`, body)).status, 409);
  ok(await admin.post('/api/admin/store/open', { open: true }));
});

let pubOrder: any;
test('07 pedido pelo cardápio digital e proteção contra duplicidade', async () => {
  const body = {
    idempotency_key: 'k-pub-0001', type: 'delivery', customer_name: 'Maria Cliente', customer_phone: '(83) 99999-1111',
    address: { street: 'Rua A', number: '10', neighborhood: 'Centro' }, payment_hint: 'dinheiro', change_for_cents: 10000,
    items: [{ variant_id: variant('Combo (porção individual)', 'Pra viagem'), qty: 1, option_ids: [optionId('Baião solto'), optionId('Carne')] }, { variant_id: variant('Coca-Cola 1L'), qty: 1 }],
  };
  assert.equal((await publico.post(`/api/public/${SLUG}/orders`, { ...body, idempotency_key: 'k-pub-bad1', items: [{ variant_id: variant('Combo (porção individual)', 'Pra viagem'), qty: 1 }] })).status, 400);
  const r1 = ok(await publico.post(`/api/public/${SLUG}/orders`, body));
  const r2 = ok(await publico.post(`/api/public/${SLUG}/orders`, body));
  assert.equal(r1.token, r2.token); assert.equal(r2.duplicate, true);
  pubOrder = ok(await publico.get(`/api/public/${SLUG}/orders/${r1.token}`));
  assert.equal(pubOrder.status, 'aguardando_confirmacao'); assert.equal(pubOrder.total_cents, 3100); assert.equal(pubOrder.delivery_fee_cents, null);
  assert.equal(pubOrder.customer_phone, undefined);
  pubOrder.id = (await db.get('SELECT id FROM orders WHERE public_token = $1', [r1.token])).id;
  pubOrder.token = r1.token;
});

test('08 confirmação exige taxa; pedido vai para cozinha e kanban', async () => {
  assert.equal((await caixa.post(`/api/orders/${pubOrder.id}/confirm`, {})).status, 400);
  const d = ok(await caixa.post(`/api/orders/${pubOrder.id}/confirm`, { delivery_fee_cents: 500 }));
  assert.equal(d.status, 'confirmado'); assert.equal(d.total_cents, 3600);
  const t = ok(await cozinha.get('/api/kitchen/tickets')).find((x: any) => x.order_id === pubOrder.id);
  assert.equal(t.items.length, 2); assert.equal(t.items[0].unit_price_cents, undefined);
  assert.ok(ok(await caixa.get('/api/orders?active=1')).find((o: any) => o.id === pubOrder.id && o.status === 'confirmado'));
});

test('09 cozinha por setor e item sincroniza o pedido', async () => {
  const t = ok(await cozinha.get('/api/kitchen/tickets')).find((x: any) => x.order_id === pubOrder.id);
  ok(await cozinha.post(`/api/kitchen/tickets/${t.id}/status`, { to: 'preparo' }));
  assert.equal(ok(await admin.get(`/api/orders/${pubOrder.id}`)).status, 'em_preparo');
  ok(await cozinha.post(`/api/kitchen/tickets/${t.id}/status`, { to: 'pronto', sector: 'bebidas' }));
  assert.equal(ok(await admin.get(`/api/orders/${pubOrder.id}`)).status, 'em_preparo');
  ok(await cozinha.post(`/api/kitchen/items/${t.items.find((i: any) => i.sector !== 'bebidas').id}/status`, { to: 'pronto' }));
  assert.equal(ok(await admin.get(`/api/orders/${pubOrder.id}`)).status, 'pronto');
});

test('10 entrega: atribuição e privacidade entre motoboys', async () => {
  assert.equal((await caixa.post(`/api/orders/${pubOrder.id}/status`, { to: 'saiu_entrega' })).status, 400);
  ok(await caixa.post(`/api/orders/${pubOrder.id}/courier`, { courier_id: users.caio }));
  assert.equal(ok(await moto.get('/api/courier/deliveries')).deliveries.length, 1);
  assert.equal(ok(await moto2.get('/api/courier/deliveries')).deliveries.length, 0);
  assert.equal((await moto2.get(`/api/orders/${pubOrder.id}`)).status, 403);
});

test('11 motoboy: coleta, saída, cobrança e conclusão', async () => {
  ok(await moto.post(`/api/courier/orders/${pubOrder.id}/pickup`));
  ok(await moto.post(`/api/courier/orders/${pubOrder.id}/dispatch`));
  assert.equal((await moto.post(`/api/courier/orders/${pubOrder.id}/delivered`, {})).status, 409);
  ok(await moto.post(`/api/courier/orders/${pubOrder.id}/delivered`, { payments: [{ method: 'dinheiro', amount_cents: 3600, received_cents: 10000 }] }));
  const d = ok(await admin.get(`/api/orders/${pubOrder.id}`));
  assert.equal(d.status, 'concluido'); assert.equal(d.payments[0].change_cents, 6400); assert.equal(d.payments[0].cash_session_id, null);
  assert.equal(ok(await publico.get(`/api/public/${SLUG}/orders/${pubOrder.token}`)).status, 'concluido');
});

let cashId = 0;
test('12 caixa, PDV com pagamento dividido, troco, sangria, suprimento e acerto', async () => {
  const sale = ok(await caixa.post('/api/orders', { type: 'balcao', idempotency_key: 'pdv-0001', items: [{ variant_id: variant('Espeto de carne'), qty: 3 }, { variant_id: variant('Skol'), qty: 2 }] }));
  assert.equal(sale.total_cents, 4000);
  assert.equal((await caixa.post(`/api/orders/${sale.id}/payments`, { payments: [{ method: 'pix', amount_cents: 4000 }] })).status, 409);
  cashId = ok(await caixa.post('/api/admin/cash/open', { opening_cents: 5000 })).id;
  assert.equal((await caixa.post(`/api/orders/${sale.id}/payments`, { payments: [{ method: 'pix', amount_cents: 5000 }] })).status, 400);
  const pay = { idempotency_key: 'pay-1', payments: [{ method: 'pix', amount_cents: 1500 }, { method: 'dinheiro', amount_cents: 2500, received_cents: 3000 }] };
  assert.equal(ok(await caixa.post(`/api/orders/${sale.id}/payments`, pay)).payment_status, 'pago');
  ok(await caixa.post(`/api/orders/${sale.id}/payments`, pay));
  assert.equal((await db.get('SELECT COUNT(*) n FROM payments WHERE order_id = $1', [sale.id])).n, 2);
  assert.equal(ok(await caixa.post('/api/orders', { type: 'balcao', idempotency_key: 'pdv-0001', items: [{ variant_id: variant('Espeto de carne'), qty: 3 }] })).id, sale.id);
  ok(await caixa.post(`/api/orders/${sale.id}/status`, { to: 'pronto' }));
  ok(await caixa.post(`/api/orders/${sale.id}/status`, { to: 'concluido' }));
  ok(await caixa.post('/api/admin/cash/movement', { type: 'sangria', amount_cents: 1000, reason: 'Depósito' }));
  ok(await caixa.post('/api/admin/cash/movement', { type: 'suprimento', amount_cents: 200, reason: 'Moedas' }));
  const cur = ok(await caixa.get('/api/admin/cash/current'));
  assert.equal(cur.session.expected_cash_cents, 5000 + 2500 + 200 - 1000);
  assert.equal(cur.courier_pending.length, 1);
  assert.equal(ok(await caixa.post('/api/admin/cash/settle', { payment_ids: [cur.courier_pending[0].id] })).expected_cash_cents, 6700 + 3600);
});

let mesa: any; let tables: any[];
test('13 mesa pelo garçom: abertura, rodadas e quem lançou', async () => {
  ok(await admin.post('/api/tables/bulk', { count: 6 }));
  tables = ok(await garcom.get('/api/tables'));
  assert.equal(tables.length, 6);
  mesa = ok(await garcom.post('/api/orders', { type: 'mesa', table_id: tables[1].id, guests: 3 }));
  assert.equal(mesa.status, 'aberto'); assert.equal(mesa.waiter_name, 'ANA');
  assert.equal((await garcom2.post('/api/orders', { type: 'mesa', table_id: tables[1].id, guests: 2 })).status, 409);
  mesa = ok(await garcom.post(`/api/orders/${mesa.id}/items`, { items: [{ variant_id: variant('Espeto de queijo'), qty: 2, notes: 'bem passado' }, { variant_id: variant('Heineken'), qty: 2 }], send: true }));
  assert.ok(mesa.items.every((i: any) => i.status === 'enviado' && i.created_by_name === 'ANA'));
  mesa = ok(await garcom.post(`/api/orders/${mesa.id}/items`, { items: [{ variant_id: variant('Combo (porção individual)', 'Pra comer no estabelecimento'), qty: 1, option_ids: [optionId('Baião mexido'), optionId('Calabresa')] }], send: false }));
  mesa = ok(await garcom.post(`/api/orders/${mesa.id}/send`));
  assert.equal(mesa.tickets.length, 2); assert.equal(mesa.total_cents, 5900);
  assert.equal((await garcom2.post(`/api/orders/${mesa.id}/items`, { items: [{ variant_id: variant('Skol'), qty: 1 }] })).status, 403);
});

test('14 cancelamento de item enviado exige supervisor e é auditado; exclusão bloqueada no banco', async () => {
  const item = mesa.items.find((i: any) => i.name === 'Heineken');
  assert.equal((await garcom.post(`/api/items/${item.id}/cancel`, { reason: 'Cliente desistiu' })).status, 403);
  assert.equal((await garcom.post(`/api/items/${item.id}/cancel`, { reason: 'Cliente desistiu', auth: { username: 'beto', password: 'senha123' } })).status, 403);
  assert.equal(ok(await garcom.post(`/api/items/${item.id}/cancel`, { reason: 'Cliente desistiu', auth: { username: 'gerente1', password: 'senha123' } })).total_cents, 3500);
  assert.equal((await db.get("SELECT authorized_by FROM audit_log WHERE action = 'item.cancel' ORDER BY id DESC LIMIT 1")).authorized_by, users.gerente1);
  await assert.rejects(db.run('DELETE FROM order_items WHERE id = $1', [item.id]));
  await assert.rejects(db.run('DELETE FROM orders WHERE id = $1', [mesa.id]));
});

test('15 servido, pedir conta, conta dividida e fechamento da mesa', async () => {
  const tk = ok(await cozinha.get('/api/kitchen/tickets')).filter((t: any) => t.order_id === mesa.id);
  for (const t of tk) ok(await cozinha.post(`/api/kitchen/tickets/${t.id}/status`, { to: 'pronto' }));
  assert.equal(ok(await garcom.get('/api/tables')).find((t: any) => t.id === mesa.table_id).state, 'pedido_pronto');
  for (const t of tk) ok(await garcom.post(`/api/tickets/${t.id}/served`));
  ok(await garcom.post(`/api/orders/${mesa.id}/status`, { to: 'fechamento' }));
  assert.equal((await garcom.post(`/api/orders/${mesa.id}/status`, { to: 'concluido' })).status, 403);
  assert.equal((await caixa.post(`/api/orders/${mesa.id}/status`, { to: 'concluido' })).status, 409);
  ok(await caixa.post(`/api/orders/${mesa.id}/payments`, { payments: [{ method: 'credito', amount_cents: 1750 }] }));
  assert.equal(ok(await caixa.post(`/api/orders/${mesa.id}/payments`, { payments: [{ method: 'debito', amount_cents: 1750 }] })).payment_status, 'pago');
  ok(await caixa.post(`/api/orders/${mesa.id}/status`, { to: 'concluido' }));
  assert.equal(ok(await garcom.get('/api/tables')).find((t: any) => t.id === mesa.table_id).state, 'livre');
});

test('16 QR Code da mesa: cliente pede, chama garçom, equipe confirma e envia à cozinha', async () => {
  const adminTables = ok(await admin.get('/api/tables/admin'));
  const t5 = adminTables.find((t: any) => t.label === '5');
  const qr = `/api/public/${SLUG}/tables/${t5.qr_token}`;
  const info = ok(await publico.get(qr));
  assert.equal(info.table.label, '5'); assert.equal(info.enabled, true); assert.equal(info.comanda, null);
  assert.equal((await publico.get(`/api/public/${SLUG}/tables/token-invalido`)).status, 404);
  // sem nome não pede
  assert.equal((await publico.post(`${qr}/orders`, { idempotency_key: 'qr-0000001', customer_name: '', items: [{ variant_id: variant('Espeto de frango'), qty: 1 }] })).status, 400);
  // combo "pra viagem" não vale na mesa
  assert.equal((await publico.post(`${qr}/orders`, { idempotency_key: 'qr-0000002', customer_name: 'Lia', items: [{ variant_id: variant('Combo (porção individual)', 'Pra viagem'), qty: 1, option_ids: [optionId('Baião solto'), optionId('Carne')] }] })).status, 400);
  const body = { idempotency_key: 'qr-0000003', customer_name: 'Lia', items: [{ variant_id: variant('Espeto de frango'), qty: 2 }, { variant_id: variant('Suco de caju'), qty: 1 }] };
  const r = ok(await publico.post(`${qr}/orders`, body));
  assert.equal(r.sent_to_kitchen, false, 'por padrão a equipe confirma antes');
  assert.equal(ok(await publico.post(`${qr}/orders`, body)).duplicate, true);
  const view = ok(await publico.get(qr));
  assert.equal(view.comanda.items.length, 2); assert.equal(view.comanda.total_cents, 2600);
  assert.equal(view.comanda.items[0].customer_label, 'Lia');
  ok(await publico.post(`${qr}/call`, { kind: 'garcom' }));
  const board = ok(await garcom.get('/api/tables')).find((t: any) => t.label === '5');
  assert.equal(board.state, 'aguardando_pedido'); assert.equal(board.order.pending_qr, 2); assert.equal(board.order.called, true);
  assert.equal(ok(await cozinha.get('/api/kitchen/tickets')).filter((t: any) => t.order_id === board.order.id).length, 0, 'ainda não foi para a cozinha');
  const sent = ok(await garcom.post(`/api/orders/${board.order.id}/send`));
  assert.equal(sent.tickets.length, 1);
  assert.ok(sent.items.every((i: any) => i.created_by_name?.startsWith('Cliente Lia')));
  ok(await garcom.post(`/api/orders/${board.order.id}/attend`));
  assert.equal(ok(await cozinha.get('/api/kitchen/tickets')).filter((t: any) => t.order_id === board.order.id).length, 1);
  // com envio automático, vai direto para a cozinha
  ok(await admin.put('/api/admin/settings', { self_order_auto_kitchen: true }));
  assert.equal(ok(await publico.post(`${qr}/orders`, { ...body, idempotency_key: 'qr-0000004' })).sent_to_kitchen, true);
  // QR desativado na mesa
  ok(await admin.put(`/api/tables/${t5.id}`, { label: '5', qr_enabled: false, sort: 5 }));
  assert.equal((await publico.post(`${qr}/orders`, { ...body, idempotency_key: 'qr-0000005' })).status, 400);
  // QR regenerado invalida o antigo
  ok(await admin.post(`/api/tables/${t5.id}/regenerate-qr`));
  assert.equal((await publico.get(qr)).status, 404);
});

test('16b M6: ocultar a mesa 13 some do salão sem apagar a mesa', async () => {
  ok(await admin.post('/api/tables', { label: '13', sort: 13 }));
  assert.ok(ok(await garcom.get('/api/tables')).some((t: any) => t.label === '13'), 'mesa 13 aparece quando não está oculta');
  ok(await admin.put('/api/admin/settings', { hide_table_13: true }));
  assert.ok(!ok(await garcom.get('/api/tables')).some((t: any) => t.label === '13'), 'mesa 13 some quando oculta');
  assert.ok(await db.get("SELECT 1 FROM dining_tables WHERE label = '13'"), 'a mesa 13 continua existindo no banco');
  ok(await admin.put('/api/admin/settings', { hide_table_13: false }));
});

test('17 QR do balcão: pedido presencial sem mesa aguarda confirmação', async () => {
  // O QR do balcão vem desligado por padrão; a empresa precisa ligar para aceitar pedidos.
  assert.equal((await publico.post(`/api/public/${SLUG}/orders`, { idempotency_key: 'balcao-0000', type: 'balcao', customer_name: 'Rui', items: [{ variant_id: variant('Batata frita'), qty: 1 }] })).status, 400);
  ok(await admin.put('/api/admin/settings', { self_order_counter_enabled: true }));
  const r = ok(await publico.post(`/api/public/${SLUG}/orders`, { idempotency_key: 'balcao-0001', type: 'balcao', customer_name: 'Rui', items: [{ variant_id: variant('Batata frita'), qty: 1 }] }));
  const o = await db.get('SELECT * FROM orders WHERE public_token = $1', [r.token]);
  assert.equal(o.channel, 'qrcode'); assert.equal(o.type, 'balcao'); assert.equal(o.status, 'aguardando_confirmacao');
});

test('18 desconto, estorno e cancelamento com justificativa', async () => {
  const o = ok(await caixa.post('/api/orders', { type: 'retirada', customer_name: 'Pedro', customer_phone: '83988887777', items: [{ variant_id: variant('Batata frita'), qty: 1 }] }));
  assert.equal((await caixa.post(`/api/orders/${o.id}/discount`, { amount_cents: 300, reason: 'cortesia' })).status, 403);
  assert.equal(ok(await caixa.post(`/api/orders/${o.id}/discount`, { amount_cents: 300, reason: 'cortesia', auth: { username: 'gerente1', password: 'senha123' } })).total_cents, 1500);
  const d2 = ok(await admin.post(`/api/orders/${o.id}/discount`, { percent: 10, reason: 'promoção' }));
  assert.equal(d2.discount_cents, 180);
  const p = ok(await caixa.post(`/api/orders/${o.id}/payments`, { payments: [{ method: 'pix', amount_cents: 1620 }] }));
  assert.equal((await admin.post(`/api/orders/${o.id}/cancel`, { reason: 'Desistência' })).status, 409);
  ok(await admin.post(`/api/payments/${p.payments[0].id}/void`, { reason: 'Desistência do cliente' }));
  assert.equal(ok(await admin.post(`/api/orders/${o.id}/cancel`, { reason: 'Desistência do cliente' })).status, 'cancelado');
});

test('19 dashboard e relatórios calculados dos registros reais', async () => {
  const d = today();
  ok(await admin.post('/api/admin/expenses', { description: 'Carvão', category: 'Insumos', amount_cents: 5000, due_date: d, paid: true }));
  ok(await admin.post('/api/admin/expenses', { description: 'Aluguel', category: 'Fixas', amount_cents: 80000, due_date: d }));
  const dash = ok(await admin.get(`/api/admin/dashboard?from=${d}&to=${d}`));
  // delivery 3600 + balcão 4000 + mesa 3500 + mesa QR (2600 + 2600) — pedidos aguardando confirmação e cancelados não entram
  assert.equal(dash.period.gross_cents, 3600 + 4000 + 3500 + 5200);
  assert.equal(dash.period.received_cents, 3600 + 4000 + 3500);
  assert.equal(dash.finance.expenses_paid_cents, 5000);
  assert.equal(dash.finance.payable.v, 80000);
  const empty = ok(await admin.get('/api/admin/dashboard?from=2020-01-01&to=2020-01-02'));
  assert.equal(empty.period.gross_cents, 0); assert.deepEqual(empty.topProducts, []);
  for (const k of ok(await admin.get('/api/admin/reports'))) ok(await admin.get(`/api/admin/reports/${k.id}?from=${d}&to=${d}`));
  const csv = await admin.get(`/api/admin/reports/vendas_produto?from=${d}&to=${d}&format=csv`);
  assert.match(String(csv.data), /Produto;Variação;Categoria;Qtd\.;Total/);
});

test('20 fechamento de caixa com diferença', async () => {
  const cur = ok(await caixa.get('/api/admin/cash/current'));
  const closed = ok(await caixa.post('/api/admin/cash/close', { counted_cents: cur.session.expected_cash_cents - 100, notes: 'faltou 1 real' }));
  assert.equal(closed.difference_cents, -100);
  const pid = (await db.get('SELECT id FROM payments WHERE cash_session_id = $1 AND NOT voided LIMIT 1', [cashId])).id;
  assert.equal((await admin.post(`/api/payments/${pid}/void`, { reason: 'teste' })).status, 409);
});

test('21 SaaS: nova empresa isolada, plano com limites e suspensão', async () => {
  const plan = ok(await plat.post('/api/platform/plans', { name: 'Básico', description: '', price_cents: null, max_users: 2, max_tables: 3, max_products: null, features: { delivery: false, self_order: true, kds: true, reports: true } }));
  ok(await plat.post('/api/platform/tenants', { name: 'Pizzaria Teste', slug: 'pizzaria-teste', plan_id: plan.id, admin: { name: 'Dona', username: 'dona', password: 'senha12345' }, tables: 2 }));
  assert.equal((await plat.post('/api/platform/tenants', { name: 'Xis', slug: 'admin', admin: { name: 'Xis', username: 'xx1', password: 'senha12345' } })).status, 400, 'slug reservado');
  assert.equal((await plat.post('/api/platform/tenants', { name: 'Xis', slug: 'pizzaria-teste', admin: { name: 'Xis', username: 'xx1', password: 'senha12345' } })).status, 409);
  await outra.login('dona', 'senha12345', 'pizzaria-teste');
  // não enxerga nada do Espetinho
  assert.equal((await outra.get(`/api/orders/${pubOrder.id}`)).status, 404);
  assert.equal(ok(await outra.get('/api/orders')).length, 0);
  assert.equal(ok(await outra.get('/api/catalog?all=1')).categories.length, 0);
  assert.equal((await outra.post(`/api/orders/${mesa.id}/cancel`, { reason: 'invasão' })).status, 404);
  assert.equal((await outra.put(`/api/products/${(await db.get("SELECT id FROM products WHERE name = 'Espeto de carne'")).id}`, { category_id: 1, name: 'x', order_types: ['balcao'], variants: [{ name: 'Único', price_cents: 1 }] })).status, 400);
  // limites do plano
  ok(await outra.post('/api/admin/users', { name: 'Garçom', username: 'gar1', role: 'garcom', password: 'senha123' }));
  assert.equal((await outra.post('/api/admin/users', { name: 'Garçom 2', username: 'gar2', role: 'garcom', password: 'senha123' })).status, 402);
  ok(await outra.post('/api/tables', { label: 'Varanda' }));
  assert.equal((await outra.post('/api/tables', { label: 'Extra' })).status, 402);
  const pm = ok(await publico.get('/api/public/pizzaria-teste/menu'));
  assert.equal(pm.settings.accept_delivery, false, 'plano sem delivery');
  // suspensão bloqueia acesso e cardápio
  const tid = (await db.get("SELECT id FROM tenants WHERE slug = 'pizzaria-teste'")).id;
  ok(await plat.put(`/api/platform/tenants/${tid}`, { name: 'Pizzaria Teste', slug: 'pizzaria-teste', plan_id: plan.id, status: 'suspenso' }));
  assert.equal((await outra.get('/api/orders')).status, 401);
  assert.equal((await publico.get('/api/public/pizzaria-teste/menu')).status, 403);
  assert.equal((await new Client().post('/api/auth/login', { company: 'pizzaria-teste', username: 'dona', password: 'senha12345' })).status, 403);
  // suporte acessa a empresa (registrado)
  const sup = new Client(); sup.cookies = { ...plat.cookies };
  ok(await sup.post(`/api/platform/tenants/${espId}/impersonate`, { reason: 'Ajuda com configuração' }));
  assert.equal(ok(await sup.get('/api/auth/me')).tenant.slug, SLUG);
  assert.ok(await db.get("SELECT 1 FROM audit_log WHERE action = 'platform.impersonate' AND tenant_id = $1", [espId]));
});

test('22 tempo real isolado e CSRF', async () => {
  const evil = await fetch(base + '/api/admin/store/open', { method: 'POST', headers: { 'content-type': 'application/json', cookie: admin.cookie, origin: 'https://evil.example' }, body: '{"open":false}' });
  assert.equal(evil.status, 403);
  const logo = await fetch(base + ok(await admin.get('/api/auth/me')).tenant.logo_url);
  assert.equal(logo.status, 200); assert.equal(logo.headers.get('content-type'), 'image/jpeg');
});

test('23 M2: remover membro da equipe (senha + soft/hard delete)', async () => {
  const id = ok(await admin.post('/api/admin/users', { name: 'Temp Um', username: 'temp1', role: 'garcom', password: 'senha123' })).id;
  assert.equal((await admin.del(`/api/admin/users/${id}`)).status, 403, 'precisa da senha do administrador');
  assert.equal((await admin.del(`/api/admin/users/${id}`, { password: 'errada' })).status, 403);
  const me = ok(await admin.get('/api/auth/me')).user;
  assert.equal((await admin.del(`/api/admin/users/${me.id}`, { password: 'senhaForte123' })).status, 400, 'não remove a si mesmo');
  assert.equal(ok(await admin.del(`/api/admin/users/${id}`, { password: 'senhaForte123' })).soft, false, 'sem histórico: apagado de vez');
  assert.ok(!ok(await admin.get('/api/admin/users')).some((u: any) => u.id === id), 'sumiu da lista');
  // garçom com histórico (ana lançou itens) é apenas desativado
  const anaHist = await db.get('SELECT 1 FROM order_items WHERE created_by = $1 LIMIT 1', [users['ana']]);
  if (anaHist) {
    assert.equal(ok(await admin.del(`/api/admin/users/${users['ana']}`, { password: 'senhaForte123' })).soft, true, 'com histórico: desativado e escondido');
    assert.equal((await new Client().post('/api/auth/login', { company: SLUG, username: 'ana', password: 'senha123' })).status, 401, 'removido não loga');
  }
});

test('24 M8: excluir produto (senha + soft/hard delete)', async () => {
  const cat = menu.categories.find((c: any) => c.name === 'Porções');
  const id = ok(await admin.post('/api/products', { category_id: cat.id, name: 'Produto Excluir', order_types: ['balcao'], variants: [{ name: 'Único', price_cents: 500 }] })).id;
  assert.equal((await admin.del(`/api/products/${id}`)).status, 403, 'precisa da senha');
  assert.equal(ok(await admin.del(`/api/products/${id}`, { password: 'senhaForte123' })).soft, false, 'nunca vendido: apagado de vez');
  assert.ok(!(await db.get('SELECT 1 FROM products WHERE id = $1', [id])), 'removido do banco');
  // produto vendido: cria, vende no PDV, exclui -> soft delete
  const id2 = ok(await admin.post('/api/products', { category_id: cat.id, name: 'Produto Vendido', order_types: ['balcao', 'retirada'], variants: [{ name: 'Único', price_cents: 700 }] })).id;
  const cat2 = ok(await admin.get('/api/catalog?all=1'));
  const v = cat2.categories.flatMap((c: any) => c.products).find((x: any) => x.id === id2).variants[0].id;
  const o = ok(await caixa.post('/api/orders', { type: 'retirada', customer_name: 'C', items: [{ variant_id: v, qty: 1 }] }));
  assert.equal(ok(await admin.del(`/api/products/${id2}`, { password: 'senhaForte123' })).soft, true, 'vendido: soft delete');
  assert.ok((await db.get('SELECT deleted_at FROM products WHERE id = $1', [id2])).deleted_at, 'marcado como excluído');
  assert.ok(!ok(await publico.get(`/api/public/${SLUG}/menu`)).categories.flatMap((c: any) => c.products).some((p: any) => p.id === id2), 'some do cardápio');
});

test('25 M7: excluir mesa exige a senha do administrador da plataforma', async () => {
  const id = ok(await admin.post('/api/tables', { label: 'T99' })).id;
  assert.equal((await admin.del(`/api/tables/${id}`)).status, 403, 'precisa da senha da plataforma');
  assert.equal((await admin.del(`/api/tables/${id}`, { auth: { username: 'sergio', password: 'senhaForte123' } })).status, 403, 'senha da empresa não serve');
  assert.equal(ok(await admin.del(`/api/tables/${id}`, { auth: { username: 'root', password: 'senhaMuitoForte1' } })).soft, false, 'sem histórico: apagada de vez');
  assert.ok(!ok(await admin.get('/api/tables/admin')).some((t: any) => t.id === id), 'sumiu da lista de mesas');
});

test('26 M5: liberar mesa vazia; recusar mesa com consumo', async () => {
  const tid = ok(await admin.post('/api/tables', { label: 'T-REL' })).id;
  const o1 = ok(await admin.post('/api/orders', { type: 'mesa', table_id: tid, guests: 2 }));
  ok(await admin.post(`/api/orders/${o1.id}/release`));
  assert.equal(ok(await admin.get('/api/tables')).find((t: any) => t.id === tid)?.state, 'livre', 'mesa vazia liberada');
  const o2 = ok(await admin.post('/api/orders', { type: 'mesa', table_id: tid, guests: 2 }));
  ok(await admin.post(`/api/orders/${o2.id}/items`, { items: [{ variant_id: variant('Espeto de carne'), qty: 1 }], send: true }));
  assert.equal((await admin.post(`/api/orders/${o2.id}/release`)).status, 409, 'mesa com consumo não é liberada direto');
});

test('27 M11: acesso com PIN devolve os perfis da equipe', async () => {
  assert.equal(ok(await new Client().get(`/api/auth/tenant/${SLUG}`)).pin_login, false, 'sem PIN configurado');
  ok(await admin.put('/api/admin/settings', { team_pin: '2468' }));
  assert.equal(ok(await new Client().get(`/api/auth/tenant/${SLUG}`)).pin_login, true);
  assert.equal((await new Client().post('/api/auth/profiles', { company: SLUG, pin: '0000' })).status, 401, 'PIN errado');
  const prof = ok(await new Client().post('/api/auth/profiles', { company: SLUG, pin: '2468' })).profiles;
  assert.ok(prof.some((p: any) => p.username === 'sergio' && p.role === 'admin'), 'lista traz o admin');
  ok(await admin.put('/api/admin/settings', { team_pin: '' })); // desliga o PIN ao final
});

test('28 M3: reiniciar empresa apaga dados e auditoria, mantém cardápio e deixa um admin', async () => {
  const r = ok(await plat.post('/api/platform/tenants', { name: 'Reset Teste', slug: 'reset-teste', admin: { name: 'Adm', username: 'adm', password: 'senhaForte123' }, tables: 3 }));
  const rid = r.id;
  const c = new Client(); await c.login('adm', 'senhaForte123', 'reset-teste');
  // cria um produto e um pedido para ter o que apagar
  const catId = ok(await c.post('/api/categories', { name: 'Geral', sector: 'cozinha' })).id;
  const pid = ok(await c.post('/api/products', { category_id: catId, name: 'Item Teste', order_types: ['balcao','retirada'], variants: [{ name: 'Único', price_cents: 500 }] })).id;
  const cats2 = ok(await c.get('/api/catalog?all=1'));
  const vv = cats2.categories.flatMap((x: any) => x.products).find((p: any) => p.id === pid).variants[0].id;
  ok(await c.post('/api/orders', { type: 'retirada', customer_name: 'Z', items: [{ variant_id: vv, qty: 1 }] }));
  const before = await db.get('SELECT (SELECT COUNT(*) FROM orders WHERE tenant_id=$1) o, (SELECT COUNT(*) FROM products WHERE tenant_id=$1) p, (SELECT COUNT(*) FROM users WHERE tenant_id=$1) u', [rid]);
  assert.ok(before.o >= 1 && before.p >= 1);
  // confirmação errada e senha errada são recusadas
  assert.equal((await plat.post(`/api/platform/tenants/${rid}/reset`, { confirm: 'x', auth: { username: 'root', password: 'senhaMuitoForte1' }, admin: { name: 'Novo', username: 'novoadm', password: 'senhaForte123' } })).status, 400);
  assert.equal((await plat.post(`/api/platform/tenants/${rid}/reset`, { confirm: 'REINICIAR', auth: { username: 'root', password: 'errada' }, admin: { name: 'Novo', username: 'novoadm', password: 'senhaForte123' } })).status, 403);
  ok(await plat.post(`/api/platform/tenants/${rid}/reset`, { confirm: 'REINICIAR', auth: { username: 'root', password: 'senhaMuitoForte1' }, admin: { name: 'Novo Dono', username: 'novoadm', password: 'senhaForte123' } }));
  const after = await db.get('SELECT (SELECT COUNT(*) FROM orders WHERE tenant_id=$1) o, (SELECT COUNT(*) FROM products WHERE tenant_id=$1) p, (SELECT COUNT(*) FROM users WHERE tenant_id=$1) u, (SELECT COUNT(*) FROM audit_log WHERE tenant_id=$1) a', [rid]);
  assert.equal(after.o, 0, 'pedidos apagados');
  assert.ok(after.p >= 1, 'cardápio mantido');
  assert.equal(after.u, 1, 'só um administrador');
  assert.equal(after.a, 1, 'auditoria zerada, só o registro da reinicialização');
  const reset = await db.get("SELECT action FROM audit_log WHERE tenant_id=$1", [rid]);
  assert.equal(reset.action, 'platform.tenant_reset');
  const nc = new Client(); await nc.login('novoadm', 'senhaForte123', 'reset-teste');
  assert.equal(ok(await nc.get('/api/auth/me')).user.role, 'admin', 'novo admin entra');
});
