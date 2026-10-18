/**
 * Cria um banco de DEMONSTRAÇÃO separado (padrão: outicicas_demo) com empresas, usuários e pedidos fictícios.
 * Usa DEMO_DATABASE_URL — nunca DATABASE_URL: o banco de produção não é tocado.
 * O nome do banco precisa terminar em _demo (proteção contra apagar dados reais).
 */
import mysql from 'mysql2/promise';
const DEMO_URL = process.env.DEMO_DATABASE_URL || 'mysql://od:od123@127.0.0.1:3306/outicicas_demo';
{
  const u = new URL(DEMO_URL); const name = u.pathname.slice(1);
  if (!/_demo$/.test(name)) throw new Error('O banco de demonstração precisa terminar em _demo.');
  u.pathname = '/';
  const c = await mysql.createConnection(u.toString());
  await c.query(`DROP DATABASE IF EXISTS \`${name}\``);
  await c.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await c.end();
}
process.env.DATABASE_URL = DEMO_URL;

const { openDatabase } = await import('../server/db.js');
const { seedPlatform, createTenant, applySettings, seedCatalog, newTableToken } = await import('../server/seed/catalog.js');
const { hashPassword, loadUser } = await import('../server/core.js');
const O = await import('../server/services/orders.js');
const C = await import('../server/services/cash.js');

const db = await openDatabase(DEMO_URL);
await seedPlatform(db);
const PASS = 'demo1234';
const h = await hashPassword(PASS);
await db.run('INSERT INTO platform_users (name, username, password_hash) VALUES ($1,$2,$3)', ['Suporte OUTICICAS (demo)', 'suporte', await hashPassword('demo12345678')]);

const t = (await db.get("SELECT id FROM tenants WHERE slug = 'espetinho-do-sergio'")).id;
await applySettings(db, t, { is_open: true });
const users: [string, string, string][] = [
  ['Administrador (demo)', 'admin', 'admin'], ['Gerente (demo)', 'gerente', 'gerente'], ['Caixa (demo)', 'caixa', 'caixa'],
  ['Ana (garçom demo)', 'garcom1', 'garcom'], ['Beto (garçom demo)', 'garcom2', 'garcom'], ['Cozinha (demo)', 'cozinha', 'cozinha'],
  ['Caio (motoboy demo)', 'motoboy1', 'motoboy'], ['Davi (motoboy demo)', 'motoboy2', 'motoboy'],
];
const ids: Record<string, number> = {};
for (const [name, username, role] of users) ids[username] = (await db.get('INSERT INTO users (tenant_id, name, username, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id', [t, name, username, h, role])).id;
const U = async (u: string) => (await loadUser(db, ids[u]))!;
for (let i = 1; i <= 12; i++) await db.run('INSERT INTO dining_tables (tenant_id, label, seats, sort, qr_token) VALUES ($1,$2,4,$3,$4)', [t, String(i), i, `demo-mesa-${i}`]);
const zA = (await db.get('INSERT INTO delivery_zones (tenant_id, name, fee_cents) VALUES ($1,$2,$3) RETURNING id', [t, 'Bairro Demonstração A (fictício)', 300])).id;
await db.run('INSERT INTO delivery_zones (tenant_id, name, fee_cents) VALUES ($1,$2,$3)', [t, 'Bairro Demonstração B (fictício)', 500]);

const v = async (name: string, variant = 'Único') => (await db.get('SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.tenant_id = $1 AND p.name = $2 AND v.name = $3', [t, name, variant])).id;
const opt = async (name: string) => (await db.get('SELECT id FROM options WHERE tenant_id = $1 AND name = $2', [t, name])).id;

await C.openCash(db, t, await U('caixa'), 10000);
const b = (await O.createOrder(db, t, { channel: 'pdv', type: 'balcao', items: [{ variant_id: await v('Espeto de carne'), qty: 2 }, { variant_id: await v('Skol'), qty: 2 }], customer_name: 'Cliente Demo 1' }, await U('caixa'))).order;
await C.addPayments(db, t, b.id, await U('caixa'), [{ method: 'dinheiro', amount_cents: b.total_cents, received_cents: 5000 }]);
await O.createOrder(db, t, { channel: 'cardapio', type: 'delivery', idempotency_key: 'demo-key-1', customer_name: 'Cliente Demo 2', customer_phone: '83900000002',
  address: { street: 'Rua Fictícia', number: '100' }, delivery_zone_id: zA, payment_hint: 'pix',
  items: [{ variant_id: await v('Combo (porção individual)', 'Pra viagem'), qty: 1, option_ids: [await opt('Baião solto'), await opt('Frango')] }, { variant_id: await v('Guaraná 1L'), qty: 1 }] }, null);
const d = (await O.createOrder(db, t, { channel: 'cardapio', type: 'delivery', idempotency_key: 'demo-key-2', customer_name: 'Cliente Demo 3', customer_phone: '83900000003',
  address: { street: 'Avenida Exemplo', number: '25', reference: 'Casa azul (fictício)' }, delivery_zone_id: zA, payment_hint: 'dinheiro', change_for_cents: 10000,
  items: [{ variant_id: await v('Espeto de frango c/ bacon'), qty: 3 }, { variant_id: await v('Batata frita'), qty: 1 }] }, null)).order;
await O.confirmOrder(db, t, d.id, await U('gerente'), {});
await O.assignCourier(db, t, d.id, ids.motoboy1, await U('gerente'));
await O.setTicketStatus(db, t, (await db.get('SELECT id FROM kitchen_tickets WHERE order_id = $1', [d.id])).id, 'preparo', await U('cozinha'));
const table3 = await db.get("SELECT * FROM dining_tables WHERE tenant_id = $1 AND label = '3'", [t]);
const m = (await O.createOrder(db, t, { channel: 'garcom', type: 'mesa', table_id: table3.id, guests: 4, items: [] }, await U('garcom1'))).order;
await O.addItems(db, t, m.id, [{ variant_id: await v('Espeto de carne de sol c/ queijo'), qty: 2 }, { variant_id: await v('Baião de leite', 'Grande'), qty: 1, notes: 'Sem coentro' }, { variant_id: await v('Heineken'), qty: 4 }], await U('garcom1'), true);
// pedido feito pelo cliente no QR da mesa 5 (aguardando a equipe confirmar)
const table5 = await db.get("SELECT * FROM dining_tables WHERE tenant_id = $1 AND label = '5'", [t]);
await O.selfOrderTable(db, t, table5, [{ variant_id: await v('Espeto de queijo'), qty: 2 }, { variant_id: await v('Suco de caju'), qty: 1 }], 'Marina', '', 'demo-qr-1');
await db.run("INSERT INTO expenses (tenant_id, description, category, supplier, amount_cents, due_date, status, created_by) VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,'pendente',$6)",
  [t, 'Compra de carvão (exemplo fictício)', 'Insumos', 'Fornecedor Demo', 8000, ids.admin]);

// segunda empresa, para mostrar o isolamento entre clientes da plataforma
const plan = (await db.get('SELECT id FROM plans ORDER BY id LIMIT 1')).id;
const t2 = await createTenant(db, { slug: 'pizzaria-demo', name: 'Pizzaria Demo (fictícia)', plan_id: plan, status: 'teste', trial_ends_at: new Date(Date.now() + 15 * 864e5).toISOString() });
await applySettings(db, t2, { is_open: true, brand_color: '#dc2626', brand_dark: '#1f2937', slogan: 'Empresa fictícia de demonstração', kitchen_sectors: ['cozinha', 'bebidas'] });
await seedCatalog(db, t2, [
  { name: 'Pizzas', sector: 'cozinha', products: [{ name: 'Pizza margherita (exemplo)', variants: [['Média', 40], ['Grande', 55]] }, { name: 'Pizza calabresa (exemplo)', variants: [['Média', 42], ['Grande', 58]] }] },
  { name: 'Bebidas', sector: 'bebidas', products: [{ name: 'Refrigerante lata (exemplo)', price: 6 }] },
]);
await db.run("INSERT INTO users (tenant_id, name, username, password_hash, role) VALUES ($1, 'Admin Pizzaria (demo)', 'admin', $2, 'admin')", [t2, h]);
for (let i = 1; i <= 6; i++) await db.run('INSERT INTO dining_tables (tenant_id, label, sort, qr_token) VALUES ($1,$2,$3,$4)', [t2, String(i), i, newTableToken()]);

await db.close();
console.log(`\nBanco de demonstração criado: ${new URL(DEMO_URL).pathname.slice(1)}`);
console.log('Plataforma: /plataforma → usuário "suporte", senha "demo12345678"');
console.log(`Espetinho do Sergio (código espetinho-do-sergio): ${users.map((u) => u[1]).join(', ')} — senha "${PASS}"`);
console.log(`Pizzaria Demo (código pizzaria-demo): admin — senha "${PASS}"`);
console.log('QR de mesa de exemplo: /espetinho-do-sergio/mesa/demo-mesa-1');
console.log('Todos os pedidos, clientes, bairros e despesas deste banco são FICTÍCIOS.');
