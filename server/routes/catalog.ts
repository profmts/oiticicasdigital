import { Router, type Request } from 'express';
import { z } from 'zod';
import multer from 'multer';
import QRCode from 'qrcode';
import { h, bad, notFound, conflict, requirePerm, audit, broadcast, getSettings, getSetting, HttpError, tenantBySlug, tenantActive, feature, rateLimit, type TenantCtx } from '../core.js';
import { config } from '../config.js';
import type { Q } from '../db.js';
import { createOrder, selfOrderTable, STATUS_LABELS, event } from '../services/orders.js';
import { newTableToken } from '../seed/catalog.js';
import { logoUrl } from './auth.js';

export const publicRouter = Router();
export const catalogRouter = Router();
export const filesRouter = Router();

const PUBLIC_SETTINGS = ['store_name', 'slogan', 'whatsapp', 'whatsapp_display', 'address', 'city', 'instagram', 'is_open', 'closed_message', 'accept_delivery',
  'accept_pickup', 'min_order_cents', 'delivery_estimate_minutes', 'pickup_estimate_minutes', 'allow_unlisted_neighborhood', 'banners', 'pix_key',
  'brand_color', 'brand_dark', 'menu_font', 'self_order_enabled', 'self_order_counter_enabled', 'self_order_auto_kitchen'];

export async function loadCatalog(q: Q, t: number, opts: { onlyActive: boolean; onlyOnline: boolean }) {
  const A = opts.onlyActive ? ' AND active' : '';
  const cats = await q.all(`SELECT * FROM categories WHERE tenant_id = $1 ${A} ORDER BY sort, id`, [t]);
  const prods = await q.all(`SELECT * FROM products WHERE tenant_id = $1 ${A} ${opts.onlyOnline ? ' AND online' : ''} ORDER BY sort, id`, [t]);
  const vars = await q.all(`SELECT * FROM product_variants WHERE tenant_id = $1 ${A} ORDER BY sort, id`, [t]);
  const groups = await q.all('SELECT * FROM option_groups WHERE tenant_id = $1 ORDER BY sort, id', [t]);
  const opts2 = await q.all(`SELECT * FROM options WHERE tenant_id = $1 ${A} ORDER BY sort, id`, [t]);
  const products = prods.map((p) => ({
    ...p, order_types: p.order_types.split(','),
    variants: vars.filter((v) => v.product_id === p.id).map((v) => ({ ...v, order_types: v.order_types ? v.order_types.split(',') : null })),
    option_groups: groups.filter((g) => g.product_id === p.id).map((g) => ({ ...g, options: opts2.filter((o) => o.group_id === g.id) })),
  })).filter((p) => p.variants.length > 0 || !opts.onlyActive);
  return { categories: cats.map((c) => ({ ...c, products: products.filter((p) => p.category_id === c.id) })).filter((c) => !opts.onlyActive || c.products.length > 0) };
}

// ------------------------- Público (por empresa) -------------------------
async function publicTenant(req: Request): Promise<TenantCtx> {
  const t = await tenantBySlug(req.db, String(req.params.slug));
  if (!t) throw new HttpError(404, 'Cardápio não encontrado.');
  if (!tenantActive(t)) throw new HttpError(403, 'Este cardápio está temporariamente indisponível.');
  return t;
}

publicRouter.get('/:slug/menu', h(async (req) => {
  const t = await publicTenant(req);
  const all = await getSettings(req.db, t.id);
  const settings: any = Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, all[k]]));
  settings.payment_methods = (all.payment_methods || []).filter((m: any) => m.active && m.online).map((m: any) => ({ id: m.id, name: m.name }));
  if (!feature(t, 'delivery')) settings.accept_delivery = false;
  if (!feature(t, 'self_order')) { settings.self_order_enabled = false; settings.self_order_counter_enabled = false; }
  const zones = await req.db.all('SELECT id, name, fee_cents, min_order_cents, estimated_minutes FROM delivery_zones WHERE tenant_id = $1 AND active ORDER BY name', [t.id]);
  return { tenant: { slug: t.slug, name: t.name, logo_url: logoUrl(t) }, settings, zones, ...(await loadCatalog(req.db, t.id, { onlyActive: true, onlyOnline: true })), demo: config.demoMode, platform: config.platformName };
}));

const itemsSchema = z.array(z.object({ variant_id: z.number().int(), qty: z.number().int().min(1).max(99), option_ids: z.array(z.number().int()).max(20).optional(), notes: z.string().max(200).optional() })).min(1).max(60);
const publicOrderSchema = z.object({
  idempotency_key: z.string().min(8).max(80), type: z.enum(['delivery', 'retirada', 'balcao']), items: itemsSchema,
  customer_name: z.string().max(80), customer_phone: z.string().max(25).optional().default(''),
  address: z.object({ street: z.string().max(120).optional(), number: z.string().max(20).optional(), complement: z.string().max(80).optional(), neighborhood: z.string().max(80).optional(), reference: z.string().max(120).optional() }).optional(),
  delivery_zone_id: z.number().int().nullable().optional(), payment_hint: z.string().max(40).optional(), change_for_cents: z.number().int().min(0).max(1000000).nullable().optional(),
  notes: z.string().max(300).optional(), save_address: z.boolean().optional(),
});

publicRouter.post('/:slug/orders', h(async (req) => {
  const t = await publicTenant(req);
  const body = publicOrderSchema.parse(req.body);
  const dup = await req.db.get('SELECT public_token, number FROM orders WHERE tenant_id = $1 AND idempotency_key = $2', [t.id, body.idempotency_key]);
  if (dup) return { number: dup.number, token: dup.public_token, duplicate: true };
  rateLimit(`order:${req.ip}`, 10, 10 * 60000, 'Muitos pedidos em sequência. Aguarde alguns minutos ou chame no WhatsApp.');
  if (body.type === 'delivery' && !feature(t, 'delivery')) throw bad('Delivery indisponível.');
  if (body.type === 'balcao') {
    // pedido presencial no balcão pelo QR Code (sem mesa): retira e paga no balcão
    if (!feature(t, 'self_order') || !(await getSetting(req.db, t.id, 'self_order_counter_enabled'))) throw bad('Pedido pelo QR do balcão desativado.');
    const { order, duplicate } = await createOrder(req.db, t.id, { ...body, channel: 'qrcode', customer_phone: body.customer_phone || undefined, address: undefined, delivery_zone_id: null }, null);
    return { number: order.number, token: order.public_token, duplicate };
  }
  const { order, duplicate } = await createOrder(req.db, t.id, { ...body, channel: 'cardapio' }, null);
  return { number: order.number, token: order.public_token, duplicate };
}));

/** Acompanhamento pelo cliente: só os dados do próprio pedido. */
publicRouter.get('/:slug/orders/:token', h(async (req) => {
  const t = await tenantBySlug(req.db, String(req.params.slug));
  const o = t && await req.db.get('SELECT * FROM orders WHERE tenant_id = $1 AND public_token = $2', [t.id, String(req.params.token)]);
  if (!o) throw notFound('Pedido não encontrado.');
  const items = await req.db.all("SELECT name, variant_name, qty, options_json, notes, total_cents, status FROM order_items WHERE order_id = $1 AND status <> 'cancelado' ORDER BY id", [o.id]);
  const events = await req.db.all("SELECT to_status, created_at FROM order_events WHERE order_id = $1 AND type IN ('created','status') ORDER BY id", [o.id]);
  return {
    number: o.number, type: o.type, channel: o.channel, status: o.status, status_label: STATUS_LABELS[o.status], created_at: o.created_at,
    customer_first_name: (o.customer_name || '').split(' ')[0], address: o.address_json,
    subtotal_cents: o.subtotal_cents, discount_cents: o.discount_cents, delivery_fee_cents: o.delivery_fee_cents, total_cents: o.total_cents,
    payment_hint: o.payment_hint, change_for_cents: o.change_for_cents, payment_status: o.payment_status, notes: o.notes,
    estimated_minutes: o.estimated_minutes, cancel_reason: o.status === 'cancelado' ? o.cancel_reason : null,
    items: items.map((i) => ({ ...i, options: i.options_json, options_json: undefined })), events,
  };
}));

// ---------- Pedido presencial pelo QR Code da mesa ----------
async function tableByToken(req: Request) {
  const t = await publicTenant(req);
  const table = await req.db.get('SELECT * FROM dining_tables WHERE tenant_id = $1 AND qr_token = $2 AND active', [t.id, String(req.params.token)]);
  if (!table) throw notFound('QR Code de mesa inválido. Peça ajuda ao garçom.');
  if (table.label === '13' && (await getSetting(req.db, t.id, 'hide_table_13'))) throw notFound('QR Code de mesa inválido. Peça ajuda ao garçom.');
  const enabled = feature(t, 'self_order') && table.qr_enabled && (await getSetting(req.db, t.id, 'self_order_enabled'));
  return { t, table, enabled: !!enabled };
}

publicRouter.get('/:slug/tables/:token', h(async (req) => {
  const { table, enabled } = await tableByToken(req);
  const o = await req.db.get("SELECT * FROM orders WHERE table_id = $1 AND type = 'mesa' AND status IN ('aberto','fechamento')", [table.id]);
  let comanda: any = null;
  if (o) {
    const items = await req.db.all("SELECT name, variant_name, qty, options_json, notes, status, total_cents, source, customer_label, created_at FROM order_items WHERE order_id = $1 AND status <> 'cancelado' ORDER BY id", [o.id]);
    comanda = { status: o.status, total_cents: o.total_cents, paid_cents: o.paid_cents, close_requested: o.close_requested, waiter_called_at: o.waiter_called_at,
      items: items.map((i) => ({ ...i, options: i.options_json, options_json: undefined })) };
  }
  return { table: { label: table.label }, enabled, comanda };
}));

publicRouter.post('/:slug/tables/:token/orders', h(async (req) => {
  const { t, table, enabled } = await tableByToken(req);
  if (!enabled) throw bad('Pedidos pelo QR Code estão desativados nesta mesa. Chame o garçom.');
  const body = z.object({ items: itemsSchema, customer_name: z.string().min(2, 'Informe seu nome.').max(40), notes: z.string().max(200).optional().default(''), idempotency_key: z.string().min(8).max(80) }).parse(req.body);
  rateLimit(`qr:${req.ip}`, 20, 10 * 60000, 'Muitos pedidos em sequência. Chame o garçom.');
  const r = await selfOrderTable(req.db, t.id, table, body.items, body.customer_name, body.notes, body.idempotency_key);
  return { ok: true, sent_to_kitchen: r.sent, duplicate: r.duplicate };
}));

publicRouter.post('/:slug/tables/:token/call', h(async (req) => {
  const { t, table } = await tableByToken(req);
  const { kind } = z.object({ kind: z.enum(['garcom', 'conta']) }).parse(req.body);
  rateLimit(`call:${req.ip}`, 10, 5 * 60000, 'Aguarde, o garçom já foi avisado.');
  const o = await req.db.get("SELECT * FROM orders WHERE table_id = $1 AND type = 'mesa' AND status IN ('aberto','fechamento')", [table.id]);
  if (!o) throw conflict('A mesa ainda não tem comanda aberta. Faça um pedido ou chame o garçom pessoalmente.');
  await req.db.run('UPDATE orders SET waiter_called_at = NOW(3)' + (kind === 'conta' ? ', close_requested = true' : '') + ' WHERE id = $1', [o.id]);
  await event(req.db, t.id, o.id, kind === 'conta' ? 'qr_bill' : 'qr_call', null, kind === 'conta' ? `Mesa ${table.label}: cliente pediu a conta pelo QR` : `Mesa ${table.label}: cliente chamou o garçom pelo QR`);
  broadcast(t.id, 'orders', { kind: 'call', orderId: o.id, table: table.label, call: kind });
  return { ok: true };
}));

publicRouter.get('/qrcode.svg', h(async (req, res) => {
  const url = String(req.query.url || '').slice(0, 400);
  if (!/^https?:\/\//.test(url)) throw bad('URL inválida.');
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1220', light: '#ffffff' } });
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
}));

// ------------------------- Arquivos (logos e fotos ficam no banco) -------------------------
filesRouter.get('/:id', h(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw notFound();
  const f = await req.db.get('SELECT mime, data FROM files WHERE id = $1', [id]);
  if (!f) throw notFound('Arquivo não encontrado.');
  res.set('Cache-Control', 'public, max-age=604800, immutable').type(f.mime).send(Buffer.from(f.data));
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes }, fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)) });
catalogRouter.post('/uploads', requirePerm('products.manage', 'settings.manage'), upload.single('file'), h(async (req) => {
  if (!req.file) throw bad('Envie uma imagem JPG, PNG ou WEBP de até 3 MB.');
  const f = await req.db.get('INSERT INTO files (tenant_id, mime, size, data) VALUES ($1,$2,$3,$4) RETURNING id', [req.tenant!.id, req.file.mimetype, req.file.size, req.file.buffer]);
  return { url: `/files/${f.id}`, id: f.id };
}));

// ------------------------- Cardápio da empresa (equipe) -------------------------
const T = (req: Request) => req.tenant!.id;
const limit = async (req: Request, key: 'max_products' | 'max_tables' | 'max_users', table: string, label: string, extraWhere = '') => {
  const max = req.tenant!.plan?.[key];
  if (max == null) return;
  const n = (await req.db.get(`SELECT COUNT(*) n FROM ${table} WHERE tenant_id = $1 ${extraWhere}`, [T(req)])).n;
  if (n >= max) throw new HttpError(402, `Seu plano permite até ${max} ${label}. Fale com o suporte para mudar de plano.`);
};
export { limit as planLimit };

catalogRouter.get('/catalog', requirePerm('products.manage', 'pdv.use', 'tables.use'), h((req) =>
  loadCatalog(req.db, T(req), { onlyActive: !req.user!.permissions.includes('products.manage') || req.query.all !== '1', onlyOnline: false })));

const TYPES = ['delivery', 'retirada', 'mesa', 'balcao'];
const productSchema = z.object({
  category_id: z.number().int(), name: z.string().min(2).max(80), description: z.string().max(400).default(''),
  image_url: z.string().max(300).nullable().optional(), sector: z.string().max(30).nullable().optional(),
  active: z.boolean().default(true), online: z.boolean().default(true), featured: z.boolean().default(false),
  order_types: z.array(z.enum(TYPES as [string, ...string[]])).min(1), sort: z.number().int().default(0),
  variants: z.array(z.object({ id: z.number().int().optional(), name: z.string().min(1).max(40), price_cents: z.number().int().min(0).max(10000000), active: z.boolean().default(true), order_types: z.array(z.string()).nullable().optional() })).min(1),
  option_groups: z.array(z.object({ id: z.number().int().optional(), name: z.string().min(1).max(40), min_select: z.number().int().min(0).max(20), max_select: z.number().int().min(1).max(20),
    options: z.array(z.object({ id: z.number().int().optional(), name: z.string().min(1).max(60), price_cents: z.number().int().min(0).max(1000000), active: z.boolean().default(true) })).min(1) })).default([]),
});

async function saveProduct(req: Request, id: number | null, p: z.infer<typeof productSchema>) {
  const t = T(req);
  if (!id) await limit(req, 'max_products', 'products', 'produtos', 'AND active');
  return req.db.tx(async (q) => {
    if (!(await q.get('SELECT 1 FROM categories WHERE id = $1 AND tenant_id = $2', [p.category_id, t]))) throw bad('Categoria inválida.');
    for (const g of p.option_groups) if (g.min_select > g.max_select) throw bad(`Grupo ${g.name}: mínimo maior que o máximo.`);
    let before: any = null;
    if (id) {
      before = await q.get('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [id, t]);
      if (!before) throw notFound('Produto não encontrado.');
      await q.run(`UPDATE products SET category_id=$1, name=$2, description=$3, image_url=$4, sector=$5, active=$6, online=$7, featured=$8, order_types=$9, sort=$10, updated_at=NOW(3) WHERE id=$11`,
        [p.category_id, p.name, p.description, p.image_url ?? null, p.sector || null, p.active, p.online, p.featured, p.order_types.join(','), p.sort, id]);
    } else {
      id = (await q.get(`INSERT INTO products (tenant_id, category_id, name, description, image_url, sector, active, online, featured, order_types, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [t, p.category_id, p.name, p.description, p.image_url ?? null, p.sector || null, p.active, p.online, p.featured, p.order_types.join(','), p.sort])).id;
    }
    // variações preservam ids (o histórico de vendas aponta para elas); removidas ficam inativas
    const oldVars = await q.all('SELECT * FROM product_variants WHERE product_id = $1', [id]);
    const keep = new Set<number>(); const priceChanges: any[] = [];
    for (const [i, v] of p.variants.entries()) {
      const ot = v.order_types && v.order_types.length ? v.order_types.join(',') : null;
      const old = v.id ? oldVars.find((x) => x.id === v.id) : null;
      if (old) {
        keep.add(old.id);
        if (old.price_cents !== v.price_cents) priceChanges.push({ variant: v.name, from: old.price_cents, to: v.price_cents });
        await q.run('UPDATE product_variants SET name=$1, price_cents=$2, active=$3, sort=$4, order_types=$5 WHERE id=$6', [v.name, v.price_cents, v.active, i, ot, old.id]);
      } else {
        await q.run('INSERT INTO product_variants (tenant_id, product_id, name, price_cents, active, sort, order_types) VALUES ($1,$2,$3,$4,$5,$6,$7)', [t, id, v.name, v.price_cents, v.active, i, ot]);
        priceChanges.push({ variant: v.name, from: null, to: v.price_cents });
      }
    }
    for (const old of oldVars) if (!keep.has(old.id)) await q.run('UPDATE product_variants SET active = false WHERE id = $1', [old.id]);
    const oldGroups = await q.all('SELECT id FROM option_groups WHERE product_id = $1', [id]);
    const keepG = new Set<number>();
    for (const [gi, g] of p.option_groups.entries()) {
      let gid = g.id && oldGroups.some((x) => x.id === g.id) ? g.id : null;
      if (gid) await q.run('UPDATE option_groups SET name=$1, min_select=$2, max_select=$3, sort=$4 WHERE id=$5', [g.name, g.min_select, g.max_select, gi, gid]);
      else gid = (await q.get('INSERT INTO option_groups (tenant_id, product_id, name, min_select, max_select, sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [t, id, g.name, g.min_select, g.max_select, gi])).id;
      keepG.add(gid!);
      const oldOpts = await q.all('SELECT id FROM options WHERE group_id = $1', [gid]);
      const keepO = new Set<number>();
      for (const [oi, o] of g.options.entries()) {
        if (o.id && oldOpts.some((x) => x.id === o.id)) { keepO.add(o.id); await q.run('UPDATE options SET name=$1, price_cents=$2, active=$3, sort=$4 WHERE id=$5', [o.name, o.price_cents, o.active, oi, o.id]); }
        else await q.run('INSERT INTO options (tenant_id, group_id, name, price_cents, active, sort) VALUES ($1,$2,$3,$4,$5,$6)', [t, gid, o.name, o.price_cents, o.active, oi]);
      }
      for (const o of oldOpts) if (!keepO.has(o.id)) await q.run('UPDATE options SET active = false WHERE id = $1', [o.id]);
    }
    for (const g of oldGroups) if (!keepG.has(g.id)) await q.run('DELETE FROM option_groups WHERE id = $1', [g.id]); // pedidos guardam cópia das opções
    await audit(q, { tenantId: t, userId: req.user!.id, action: before ? 'product.update' : 'product.create', entity: 'product', entityId: id, data: { name: p.name, priceChanges, active: p.active }, ip: req.ip });
    return id;
  });
}

catalogRouter.post('/products', requirePerm('products.manage'), h(async (req) => { const id = await saveProduct(req, null, productSchema.parse(req.body)); broadcast(T(req), 'catalog'); return { id }; }));
catalogRouter.put('/products/:id', requirePerm('products.manage'), h(async (req) => { const id = await saveProduct(req, Number(req.params.id), productSchema.parse(req.body)); broadcast(T(req), 'catalog'); return { id }; }));
catalogRouter.patch('/products/:id/toggle', requirePerm('products.manage', 'pdv.use'), h(async (req) => {
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  const r = await req.db.run('UPDATE products SET active = $1, updated_at = NOW(3) WHERE id = $2 AND tenant_id = $3', [active, Number(req.params.id), T(req)]);
  if (!r.rowCount) throw notFound();
  await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: active ? 'product.resume' : 'product.pause', entity: 'product', entityId: Number(req.params.id), ip: req.ip });
  broadcast(T(req), 'catalog'); return { ok: true };
}));

const catSchema = z.object({ name: z.string().min(2).max(50), sector: z.string().min(2).max(30), sort: z.number().int().default(0), active: z.boolean().default(true) });
catalogRouter.post('/categories', requirePerm('products.manage'), h(async (req) => {
  const c = catSchema.parse(req.body);
  const id = (await req.db.get('INSERT INTO categories (tenant_id, name, sector, sort, active) VALUES ($1,$2,$3,$4,$5) RETURNING id', [T(req), c.name, c.sector, c.sort, c.active])).id;
  await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: 'category.create', entity: 'category', entityId: id, data: c, ip: req.ip });
  broadcast(T(req), 'catalog'); return { id };
}));
catalogRouter.put('/categories/:id', requirePerm('products.manage'), h(async (req) => {
  const c = catSchema.parse(req.body);
  const r = await req.db.run('UPDATE categories SET name=$1, sector=$2, sort=$3, active=$4 WHERE id=$5 AND tenant_id=$6', [c.name, c.sector, c.sort, c.active, Number(req.params.id), T(req)]);
  if (!r.rowCount) throw notFound();
  await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: 'category.update', entity: 'category', entityId: Number(req.params.id), data: c, ip: req.ip });
  broadcast(T(req), 'catalog'); return { ok: true };
}));

const zoneSchema = z.object({ name: z.string().min(2).max(80), fee_cents: z.number().int().min(0).max(100000), min_order_cents: z.number().int().min(0).nullable().optional(), estimated_minutes: z.number().int().min(1).max(300).nullable().optional(), active: z.boolean().default(true) });
catalogRouter.get('/zones', requirePerm('settings.manage', 'pdv.use', 'delivery.manage'), h((req) => req.db.all('SELECT * FROM delivery_zones WHERE tenant_id = $1 ORDER BY name', [T(req)])));
catalogRouter.post('/zones', requirePerm('settings.manage'), h(async (req) => {
  const z1 = zoneSchema.parse(req.body);
  const id = (await req.db.get('INSERT INTO delivery_zones (tenant_id, name, fee_cents, min_order_cents, estimated_minutes, active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [T(req), z1.name, z1.fee_cents, z1.min_order_cents ?? null, z1.estimated_minutes ?? null, z1.active])).id;
  await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: 'zone.create', entity: 'zone', entityId: id, data: z1, ip: req.ip }); return { id };
}));
catalogRouter.put('/zones/:id', requirePerm('settings.manage'), h(async (req) => {
  const z1 = zoneSchema.parse(req.body);
  await req.db.run('UPDATE delivery_zones SET name=$1, fee_cents=$2, min_order_cents=$3, estimated_minutes=$4, active=$5 WHERE id=$6 AND tenant_id=$7', [z1.name, z1.fee_cents, z1.min_order_cents ?? null, z1.estimated_minutes ?? null, z1.active, Number(req.params.id), T(req)]);
  await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: 'zone.update', entity: 'zone', entityId: Number(req.params.id), data: z1, ip: req.ip }); return { ok: true };
}));

// Mesas (cadastro e QR Codes)
const tableSchema = z.object({ label: z.string().min(1).max(20), seats: z.number().int().min(1).max(50).nullable().optional(), active: z.boolean().default(true), sort: z.number().int().default(0), qr_enabled: z.boolean().default(true) });
catalogRouter.get('/tables/admin', requirePerm('settings.manage', 'tables.manage'), h((req) => req.db.all('SELECT * FROM dining_tables WHERE tenant_id = $1 ORDER BY sort, label', [T(req)])));
catalogRouter.post('/tables', requirePerm('settings.manage', 'tables.manage'), h(async (req) => {
  const t = tableSchema.parse(req.body);
  await limit(req, 'max_tables', 'dining_tables', 'mesas', 'AND active');
  if (await req.db.get('SELECT 1 FROM dining_tables WHERE tenant_id = $1 AND label = $2', [T(req), t.label])) throw bad('Já existe uma mesa com esse nome.');
  const id = (await req.db.get('INSERT INTO dining_tables (tenant_id, label, seats, active, sort, qr_token, qr_enabled) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [T(req), t.label, t.seats ?? null, t.active, t.sort, newTableToken(), t.qr_enabled])).id;
  broadcast(T(req), 'tables'); return { id };
}));
catalogRouter.post('/tables/bulk', requirePerm('settings.manage', 'tables.manage'), h(async (req) => {
  const { count } = z.object({ count: z.number().int().min(1).max(200) }).parse(req.body);
  const max = req.tenant!.plan?.max_tables;
  const current = (await req.db.get('SELECT COUNT(*) n FROM dining_tables WHERE tenant_id = $1 AND active', [T(req)])).n;
  if (max != null && current + count > max) throw new HttpError(402, `Seu plano permite até ${max} mesas.`);
  await req.db.tx(async (q) => {
    for (let i = 1; i <= count; i++) await q.run('INSERT IGNORE INTO dining_tables (tenant_id, label, sort, qr_token) VALUES ($1,$2,$3,$4)', [T(req), String(i), i, newTableToken()]);
  });
  broadcast(T(req), 'tables'); return { ok: true };
}));
catalogRouter.put('/tables/:id', requirePerm('settings.manage', 'tables.manage'), h(async (req) => {
  const t = tableSchema.parse(req.body);
  await req.db.run('UPDATE dining_tables SET label=$1, seats=$2, active=$3, sort=$4, qr_enabled=$5 WHERE id=$6 AND tenant_id=$7', [t.label, t.seats ?? null, t.active, t.sort, t.qr_enabled, Number(req.params.id), T(req)]);
  broadcast(T(req), 'tables'); return { ok: true };
}));
catalogRouter.post('/tables/:id/regenerate-qr', requirePerm('settings.manage', 'tables.manage'), h(async (req) => {
  // invalida o QR antigo (ex.: impresso e levado embora)
  const r = await req.db.run('UPDATE dining_tables SET qr_token = $1 WHERE id = $2 AND tenant_id = $3', [newTableToken(), Number(req.params.id), T(req)]);
  if (!r.rowCount) throw notFound();
  await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: 'table.qr_regenerate', entity: 'table', entityId: Number(req.params.id), ip: req.ip });
  return { ok: true };
}));
