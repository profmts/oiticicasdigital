import { Router, type Request } from 'express';
import { z } from 'zod';
import { h, bad, forbidden, notFound, conflict, requireAuth, requirePerm, can, audit, broadcast, getSettings, setSetting, hashPassword, digits, confirmPassword, HttpError } from '../core.js';
import { ROLES, ROLE_LABELS, PERMISSIONS, ROLE_DEFAULTS, effectivePermissions } from '../permissions.js';
import * as C from '../services/cash.js';
import { dashboard, REPORTS, runReport, toCsv } from '../services/reports.js';
import { planLimit } from './catalog.js';

export const adminRouter = Router();
adminRouter.use(requireAuth);
const T = (req: Request) => req.tenant!.id;
const id = (req: Request) => { const n = Number(req.params.id); if (!Number.isInteger(n)) throw bad('Id inválido.'); return n; };
const tz = async (req: Request) => ((await getSettings(req.db, T(req))).timezone as string) || 'America/Fortaleza';

// ---------- Dashboard e relatórios ----------
const filters = (q: any) => ({ from: q.from, to: q.to, channel: q.channel || undefined, type: q.type || undefined, user_id: q.user_id ? Number(q.user_id) : undefined, method: q.method || undefined, shift: q.shift || undefined });
adminRouter.get('/dashboard', requirePerm('dashboard.view'), h(async (req) => dashboard(req.db, T(req), await tz(req), filters(req.query))));
adminRouter.get('/reports', requirePerm('reports.view'), h(() => Object.entries(REPORTS).map(([k, r]) => ({ id: k, title: r.title }))));
adminRouter.get('/reports/:kind', requirePerm('reports.view'), h(async (req, res) => {
  const kind = String(req.params.kind);
  const r = REPORTS[kind];
  if (!r) throw notFound('Relatório inexistente.');
  if (req.tenant!.plan?.features?.reports === false) throw new HttpError(402, 'Relatórios não estão incluídos no seu plano.');
  const rows = await runReport(req.db, T(req), await tz(req), kind, filters(req.query));
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${kind}_${req.query.from || ''}_${req.query.to || ''}.csv"`);
    res.send(toCsv(r.columns, rows));
    return;
  }
  return { title: r.title, columns: r.columns, rows };
}));

// ---------- Caixa ----------
adminRouter.get('/cash/current', requirePerm('cash.operate'), h(async (req) => {
  const s = await C.openSessionOf(req.db, T(req), req.user!.id);
  return { session: s ? await C.sessionSummary(req.db, T(req), s.id) : null, courier_pending: await C.pendingCourierPayments(req.db, T(req)) };
}));
adminRouter.post('/cash/open', requirePerm('cash.operate'), h(async (req) => { const r = await C.openCash(req.db, T(req), req.user!, z.object({ opening_cents: z.number().int().min(0) }).parse(req.body).opening_cents, req.ip); broadcast(T(req), 'cash'); return r; }));
adminRouter.post('/cash/movement', requirePerm('cash.operate'), h(async (req) => {
  const p = z.object({ type: z.enum(['sangria', 'suprimento']), amount_cents: z.number().int().min(1), reason: z.string().min(3).max(200) }).parse(req.body);
  const out = await C.cashMovement(req.db, T(req), req.user!, p.type, p.amount_cents, p.reason, req.ip); broadcast(T(req), 'cash'); return out;
}));
adminRouter.post('/cash/close', requirePerm('cash.operate'), h(async (req) => {
  const p = z.object({ counted_cents: z.number().int().min(0), notes: z.string().max(300).default('') }).parse(req.body);
  const out = await C.closeCash(req.db, T(req), req.user!, p.counted_cents, p.notes, req.ip); broadcast(T(req), 'cash'); return out;
}));
adminRouter.post('/cash/settle', requirePerm('cash.operate'), h((req) => C.settleCourierPayments(req.db, T(req), req.user!, z.object({ payment_ids: z.array(z.number().int()).min(1) }).parse(req.body).payment_ids, req.ip)));
adminRouter.get('/cash/sessions', requirePerm('cash.view_all'), h((req) => req.db.all(`SELECT cs.*, u.name user_name FROM cash_sessions cs JOIN users u ON u.id = cs.user_id WHERE cs.tenant_id = $1 ORDER BY cs.id DESC LIMIT 100`, [T(req)])));
adminRouter.get('/cash/sessions/:id', requirePerm('cash.operate'), h(async (req) => {
  const s = await C.sessionSummary(req.db, T(req), id(req));
  if (s.user_id !== req.user!.id && !can(req.user, 'cash.view_all')) throw forbidden();
  return s;
}));

// ---------- Financeiro: contas a pagar ----------
const expSchema = z.object({ description: z.string().min(2).max(120), category: z.string().max(40).default('Outros'), supplier: z.string().max(80).default(''),
  amount_cents: z.number().int().min(1), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), notes: z.string().max(300).default(''), paid: z.boolean().optional() });
adminRouter.get('/expenses', requirePerm('finance.view'), h((req) => {
  const w = ['e.tenant_id = $1']; const p: unknown[] = [T(req)];
  if (req.query.from) { p.push(req.query.from); w.push(`due_date >= $${p.length}`); }
  if (req.query.to) { p.push(req.query.to); w.push(`due_date <= $${p.length}`); }
  if (req.query.status) { p.push(req.query.status); w.push(`status = $${p.length}`); }
  return req.db.all(`SELECT e.*, u.name created_by_name FROM expenses e LEFT JOIN users u ON u.id = e.created_by WHERE ${w.join(' AND ')} ORDER BY CASE status WHEN 'pendente' THEN 0 ELSE 1 END, e.due_date LIMIT 500`, p);
}));
adminRouter.post('/expenses', requirePerm('finance.manage'), h(async (req) => {
  const e = expSchema.parse(req.body);
  const r = await req.db.get('INSERT INTO expenses (tenant_id, description, category, supplier, amount_cents, due_date, notes, status, paid_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
    [T(req), e.description, e.category, e.supplier, e.amount_cents, e.due_date, e.notes, e.paid ? 'pago' : 'pendente', e.paid ? new Date().toISOString() : null, req.user!.id]);
  await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: 'expense.create', entity: 'expense', entityId: r.id, data: e, ip: req.ip });
  broadcast(T(req), 'finance'); return { id: r.id };
}));
adminRouter.put('/expenses/:id', requirePerm('finance.manage'), h(async (req) => {
  const e = expSchema.parse(req.body);
  const old = await req.db.get('SELECT * FROM expenses WHERE id = $1 AND tenant_id = $2', [id(req), T(req)]);
  if (!old) throw notFound();
  if (old.status !== 'pendente') throw conflict('Só despesas pendentes podem ser editadas.');
  await req.db.run('UPDATE expenses SET description=$1, category=$2, supplier=$3, amount_cents=$4, due_date=$5, notes=$6 WHERE id=$7', [e.description, e.category, e.supplier, e.amount_cents, e.due_date, e.notes, old.id]);
  await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: 'expense.update', entity: 'expense', entityId: old.id, data: { before: old, after: e }, ip: req.ip });
  broadcast(T(req), 'finance'); return { ok: true };
}));
adminRouter.post('/expenses/:id/pay', requirePerm('finance.manage'), h(async (req) => {
  const { paid_at } = z.object({ paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.body || {});
  const r = await req.db.run("UPDATE expenses SET status='pago', paid_at=$1 WHERE id=$2 AND tenant_id=$3 AND status='pendente'", [paid_at ? new Date(paid_at + 'T15:00:00Z').toISOString() : new Date().toISOString(), id(req), T(req)]);
  if (!r.rowCount) throw conflict('Despesa não está pendente.');
  await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: 'expense.pay', entity: 'expense', entityId: id(req), ip: req.ip });
  broadcast(T(req), 'finance'); return { ok: true };
}));
adminRouter.post('/expenses/:id/cancel', requirePerm('finance.manage'), h(async (req) => {
  const { reason } = z.object({ reason: z.string().min(3).max(200) }).parse(req.body);
  const r = await req.db.run("UPDATE expenses SET status='cancelado' WHERE id=$1 AND tenant_id=$2 AND status <> 'cancelado'", [id(req), T(req)]);
  if (!r.rowCount) throw conflict('Despesa já cancelada.');
  await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: 'expense.cancel', entity: 'expense', entityId: id(req), reason, ip: req.ip });
  broadcast(T(req), 'finance'); return { ok: true };
}));

// ---------- Clientes ----------
adminRouter.get('/customers', requirePerm('customers.view'), h((req) => {
  const q = String(req.query.q || '').trim();
  const p: unknown[] = [T(req)]; let w = '';
  if (q) { p.push(`%${q}%`, `%${digits(q) || '§'}%`); w = 'AND (c.name LIKE $2 OR c.phone LIKE $3)'; }
  return req.db.all(`SELECT c.*, COUNT(o.id) orders, COALESCE(SUM(o.total_cents),0) total_cents, MAX(o.created_at) last_order
    FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.status <> 'cancelado' WHERE c.tenant_id = $1 ${w} GROUP BY c.id ORDER BY last_order IS NULL, last_order DESC LIMIT 200`, p);
}));
adminRouter.get('/customers/:id', requirePerm('customers.view'), h(async (req) => {
  const c = await req.db.get('SELECT * FROM customers WHERE id = $1 AND tenant_id = $2', [id(req), T(req)]);
  if (!c) throw notFound();
  const addresses = c.save_address ? await req.db.all('SELECT * FROM customer_addresses WHERE customer_id = $1 ORDER BY id DESC', [c.id]) : [];
  const orders = await req.db.all('SELECT id, number, type, status, total_cents, created_at FROM orders WHERE customer_id = $1 ORDER BY id DESC LIMIT 100', [c.id]);
  const top = await req.db.all(`SELECT i.name, SUM(i.qty) qty FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.customer_id = $1 AND i.status <> 'cancelado' AND o.status <> 'cancelado' GROUP BY i.name ORDER BY qty DESC LIMIT 5`, [c.id]);
  return { ...c, addresses, orders, top };
}));
adminRouter.get('/customers/lookup/:phone', requirePerm('pdv.use'), h(async (req) => {
  const c = await req.db.get('SELECT id, name, phone, save_address FROM customers WHERE tenant_id = $1 AND phone = $2', [T(req), digits(String(req.params.phone))]);
  if (!c) return null;
  const addresses = c.save_address ? await req.db.all('SELECT * FROM customer_addresses WHERE customer_id = $1 ORDER BY id DESC LIMIT 3', [c.id]) : [];
  return { ...c, addresses };
}));
adminRouter.put('/customers/:id', requirePerm('customers.view'), h(async (req) => {
  const p = z.object({ name: z.string().min(2).max(80), notes: z.string().max(500).default('') }).parse(req.body);
  await req.db.run('UPDATE customers SET name = $1, notes = $2 WHERE id = $3 AND tenant_id = $4', [p.name, p.notes, id(req), T(req)]);
  return { ok: true };
}));

// ---------- Usuários da empresa ----------
adminRouter.get('/users', requirePerm('users.manage'), h(async (req) => (await req.db.all('SELECT id, name, username, role, phone, active, permissions, available, created_at FROM users WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY active DESC, role, name', [T(req)]))
  .map((u) => ({ ...u, effective: effectivePermissions(u.role, u.permissions) }))));
adminRouter.get('/users/meta', requirePerm('users.manage'), h((req) => ({ roles: ROLES.map((r) => ({ id: r, label: ROLE_LABELS[r], defaults: ROLE_DEFAULTS[r] })), permissions: PERMISSIONS, max_users: req.tenant!.plan?.max_users ?? null })));
adminRouter.get('/staff', requirePerm('dashboard.view', 'reports.view'), h((req) => req.db.all('SELECT id, name, role FROM users WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name', [T(req)])));

// M2: remover (excluir) um membro da equipe. Pede a confirmação da senha de quem está removendo (administrador da empresa).
// Quem tem histórico (lançou pedidos, pagamentos, caixa, etc.) é apenas desativado e escondido, para preservar a auditoria.
// Quem nunca registrou nada é apagado de vez.
adminRouter.delete('/users/:id', requirePerm('users.manage'), h(async (req) => {
  const uid = id(req);
  const { password } = z.object({ password: z.string().max(200).optional() }).parse(req.body);
  const target = await req.db.get('SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL', [uid, T(req)]);
  if (!target) throw notFound('Usuário não encontrado.');
  if (target.id === req.user!.id) throw bad('Você não pode remover o próprio acesso.');
  if (target.role === 'admin' && req.user!.role !== 'admin') throw forbidden('Apenas administradores removem administradores.');
  if (target.role === 'admin') {
    const admins = (await req.db.get("SELECT COUNT(*) n FROM users WHERE tenant_id = $1 AND role='admin' AND active AND deleted_at IS NULL AND id <> $2", [T(req), uid])).n;
    if (admins === 0) throw conflict('A empresa precisa de pelo menos um administrador ativo.');
  }
  await confirmPassword(req, password);
  const hist = (await req.db.get(`SELECT (
      EXISTS(SELECT 1 FROM order_items WHERE created_by = $1)
      OR EXISTS(SELECT 1 FROM orders WHERE waiter_id = $1 OR courier_id = $1)
      OR EXISTS(SELECT 1 FROM payments WHERE user_id = $1)
      OR EXISTS(SELECT 1 FROM cash_sessions WHERE user_id = $1)
      OR EXISTS(SELECT 1 FROM order_events WHERE user_id = $1)
      OR EXISTS(SELECT 1 FROM audit_log WHERE user_id = $1 OR authorized_by = $1)
    ) AS h`, [uid])).h;
  if (hist) {
    await req.db.run('UPDATE users SET active = 0, deleted_at = NOW(3), updated_at = NOW(3) WHERE id = $1', [uid]);
  } else {
    await req.db.run('DELETE FROM users WHERE id = $1 AND tenant_id = $2', [uid, T(req)]);
  }
  await req.db.run("UPDATE sessions SET revoked = true WHERE kind = 'tenant' AND subject_id = $1", [uid]);
  await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: 'user.delete', entity: 'user', entityId: uid, data: { username: target.username, role: target.role, soft: !!hist }, ip: req.ip });
  return { ok: true, soft: !!hist };
}));

const userSchema = z.object({
  name: z.string().min(2).max(80), username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Use apenas letras, números, ponto, hífen ou sublinhado.'),
  role: z.enum(ROLES), phone: z.string().max(25).optional().default(''), active: z.boolean().default(true),
  password: z.string().min(6).max(200).optional(), permissions: z.object({ grant: z.array(z.string()).default([]), revoke: z.array(z.string()).default([]) }).default({ grant: [], revoke: [] }),
});
adminRouter.post('/users', requirePerm('users.manage'), h(async (req) => {
  const u = userSchema.parse(req.body);
  if (!u.password) throw bad('Defina uma senha inicial (mínimo 6 caracteres).');
  if (u.role === 'admin' && req.user!.role !== 'admin') throw forbidden('Apenas administradores criam administradores.');
  await planLimit(req, 'max_users', 'users', 'usuários ativos', 'AND active');
  if (await req.db.get('SELECT 1 FROM users WHERE tenant_id = $1 AND lower(username) = lower($2)', [T(req), u.username])) throw conflict('Este usuário já existe.');
  const r = await req.db.get('INSERT INTO users (tenant_id, name, username, password_hash, role, phone, active, permissions) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [T(req), u.name, u.username, await hashPassword(u.password), u.role, u.phone, u.active, JSON.stringify(u.permissions)]);
  await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: 'user.create', entity: 'user', entityId: r.id, data: { username: u.username, role: u.role, permissions: u.permissions }, ip: req.ip });
  return { id: r.id };
}));
adminRouter.put('/users/:id', requirePerm('users.manage'), h(async (req) => {
  const u = userSchema.parse(req.body);
  const target = await req.db.get('SELECT * FROM users WHERE id = $1 AND tenant_id = $2', [id(req), T(req)]);
  if (!target) throw notFound();
  const self = target.id === req.user!.id;
  const permsChanged = JSON.stringify(target.permissions) !== JSON.stringify(u.permissions);
  if (self && (u.role !== target.role || permsChanged || !u.active)) throw forbidden('Você não pode alterar o próprio nível de acesso.');
  if ((target.role === 'admin' || u.role === 'admin') && req.user!.role !== 'admin') throw forbidden('Apenas administradores alteram administradores.');
  if (target.role === 'admin' && (u.role !== 'admin' || !u.active)) {
    const admins = (await req.db.get("SELECT COUNT(*) n FROM users WHERE tenant_id = $1 AND role='admin' AND active", [T(req)])).n;
    if (admins <= 1) throw conflict('A empresa precisa de pelo menos um administrador ativo.');
  }
  if (u.active && !target.active) await planLimit(req, 'max_users', 'users', 'usuários ativos', 'AND active');
  if (u.username.toLowerCase() !== target.username.toLowerCase() && (await req.db.get('SELECT 1 FROM users WHERE tenant_id = $1 AND lower(username) = lower($2) AND id <> $3', [T(req), u.username, target.id]))) throw conflict('Este usuário já existe.');
  await req.db.run('UPDATE users SET name=$1, username=$2, role=$3, phone=$4, active=$5, permissions=$6, updated_at=NOW(3) WHERE id=$7',
    [u.name, u.username, u.role, u.phone, u.active, JSON.stringify(u.permissions), target.id]);
  if (u.password) await req.db.run('UPDATE users SET password_hash = $1, failed_logins = 0, locked_until = NULL WHERE id = $2', [await hashPassword(u.password), target.id]);
  if (u.password || !u.active || u.role !== target.role) await req.db.run("UPDATE sessions SET revoked = true WHERE kind = 'tenant' AND subject_id = $1", [target.id]);
  await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: 'user.update', entity: 'user', entityId: target.id,
    data: { before: { role: target.role, active: target.active, permissions: target.permissions }, after: { role: u.role, active: u.active, permissions: u.permissions }, password_reset: !!u.password }, ip: req.ip });
  return { ok: true };
}));

// ---------- Configurações da empresa ----------
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida (use #RRGGBB).');
const settingsSchema = z.object({
  store_name: z.string().min(2).max(80), slogan: z.string().max(120), whatsapp: z.string().max(20), whatsapp_display: z.string().max(30), address: z.string().max(300), city: z.string().max(80),
  instagram: z.string().max(80), is_open: z.boolean(), closed_message: z.string().max(200), accept_delivery: z.boolean(), accept_pickup: z.boolean(),
  min_order_cents: z.number().int().min(0), delivery_estimate_minutes: z.number().int().min(1).max(300).nullable(), pickup_estimate_minutes: z.number().int().min(1).max(300).nullable(),
  allow_unlisted_neighborhood: z.boolean(), prep_alert_minutes: z.number().int().min(1).max(240),
  payment_methods: z.array(z.object({ id: z.string().regex(/^[a-z0-9_]+$/).max(30), name: z.string().min(2).max(40), active: z.boolean(), online: z.boolean() })).min(1),
  pix_key: z.string().max(120), banners: z.array(z.object({ title: z.string().max(60), subtitle: z.string().max(140), category: z.string().max(60).optional(), image_url: z.string().max(300).optional() })).max(8),
  kitchen_sectors: z.array(z.string().max(30)).min(1).max(10), timezone: z.string().max(60),
  self_order_enabled: z.boolean(), self_order_auto_kitchen: z.boolean(), self_order_counter_enabled: z.boolean(),
  hide_table_13: z.boolean(), team_pin: z.string().max(20).regex(/^\d*$/, 'O PIN deve conter apenas números.'),
  brand_color: hex, brand_dark: hex, menu_font: z.enum(['modern', 'slab']),
}).partial();
const SAFE_KEYS = ['store_name', 'whatsapp', 'whatsapp_display', 'address', 'city', 'prep_alert_minutes', 'payment_methods', 'kitchen_sectors', 'is_open', 'pix_key', 'brand_color', 'brand_dark', 'timezone', 'self_order_enabled', 'self_order_auto_kitchen', 'self_order_counter_enabled'];
adminRouter.get('/settings', requirePerm('settings.manage', 'orders.view', 'pdv.use', 'kitchen.use', 'tables.use', 'delivery.courier'), h(async (req) => {
  const s = await getSettings(req.db, T(req));
  if (!can(req.user, 'settings.manage')) return Object.fromEntries(SAFE_KEYS.map((k) => [k, s[k]]));
  return s;
}));
adminRouter.put('/settings', requirePerm('settings.manage'), h(async (req) => {
  const s = settingsSchema.parse(req.body);
  if (s.whatsapp !== undefined && s.whatsapp !== '') { s.whatsapp = digits(s.whatsapp); if (s.whatsapp.length < 12) throw bad('WhatsApp deve ter código do país e DDD, ex.: 5583998361492.'); }
  if (s.timezone) { try { new Intl.DateTimeFormat('pt-BR', { timeZone: s.timezone }); } catch { throw bad('Fuso horário inválido.'); } }
  const before = await getSettings(req.db, T(req));
  await req.db.tx(async (q) => { for (const [k, v] of Object.entries(s)) await setSetting(q, T(req), k, v); });
  const changed = Object.fromEntries(Object.entries(s).filter(([k, v]) => JSON.stringify(before[k]) !== JSON.stringify(v)).map(([k, v]) => [k, { from: before[k], to: v }]));
  if (Object.keys(changed).length) await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: 'settings.update', data: changed, ip: req.ip });
  if (s.store_name) await req.db.run('UPDATE tenants SET name = $1, updated_at = NOW(3) WHERE id = $2', [s.store_name, T(req)]);
  broadcast(T(req), 'settings'); return getSettings(req.db, T(req));
}));
adminRouter.post('/logo', requirePerm('settings.manage'), h(async (req) => {
  const { file_id } = z.object({ file_id: z.number().int().nullable() }).parse(req.body);
  if (file_id && !(await req.db.get('SELECT 1 FROM files WHERE id = $1 AND tenant_id = $2', [file_id, T(req)]))) throw bad('Arquivo inválido.');
  await req.db.run('UPDATE tenants SET logo_file_id = $1, updated_at = NOW(3) WHERE id = $2', [file_id, T(req)]);
  await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: 'settings.logo', ip: req.ip });
  return { ok: true };
}));
adminRouter.post('/store/open', requirePerm('settings.manage', 'orders.manage'), h(async (req) => {
  const { open } = z.object({ open: z.boolean() }).parse(req.body);
  await setSetting(req.db, T(req), 'is_open', open);
  await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: open ? 'store.open' : 'store.close', ip: req.ip });
  broadcast(T(req), 'settings'); return { is_open: open };
}));

// ---------- Auditoria ----------
adminRouter.get('/audit', requirePerm('audit.view'), h((req) => {
  const p: unknown[] = [T(req), Math.min(Number(req.query.limit) || 200, 1000)];
  let w = '';
  if (req.query.action) { p.push(`${req.query.action}%`); w = 'AND a.action LIKE $3'; }
  return req.db.all(`SELECT a.*, u.name user_name, au.name authorized_name, pu.name platform_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN users au ON au.id = a.authorized_by LEFT JOIN platform_users pu ON pu.id = a.platform_user_id
    WHERE a.tenant_id = $1 ${w} ORDER BY a.id DESC LIMIT $2`, p);
}));

// ---------- Exportação dos dados da empresa (backup próprio) ----------
adminRouter.get('/export', requirePerm('settings.manage'), h(async (req, res) => {
  const t = T(req);
  const tables = ['settings', 'categories', 'products', 'product_variants', 'option_groups', 'options', 'customers', 'customer_addresses', 'delivery_zones', 'dining_tables', 'orders', 'order_items', 'kitchen_tickets', 'order_events', 'payments', 'cash_sessions', 'cash_movements', 'expenses'];
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), tenant: req.tenant!.slug };
  for (const tb of tables) out[tb] = await req.db.all(`SELECT * FROM ${tb} WHERE tenant_id = $1`, [t]);
  out.users = await req.db.all('SELECT id, name, username, role, phone, active, created_at FROM users WHERE tenant_id = $1', [t]);
  await audit(req.db, { tenantId: t, userId: req.user!.id, action: 'backup.export', ip: req.ip });
  res.setHeader('Content-Disposition', `attachment; filename="${req.tenant!.slug}-dados-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(out);
}));
