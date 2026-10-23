import { Router, type Request } from 'express';
import { z } from 'zod';
import { h, bad, notFound, conflict, HttpError, PLATFORM_COOKIE, COOKIE, createSession, checkPassword, hashPassword, sha256, audit, authorizePlatform, requirePlatform, cookieOpts, rateLimit, digits } from '../core.js';

// Esquema do administrador criado pela plataforma (primeira conta da empresa). CPF, telefone e e-mail são opcionais.
const adminSchema = z.object({
  name: z.string().min(2).max(80),
  username: z.string().min(3).max(40).regex(/^[a-z0-9._-]+$/, 'Use só letras minúsculas, números, ponto, hífen ou sublinhado.'),
  password: z.string().min(8).max(200),
  cpf: z.string().max(14).optional(), phone: z.string().max(25).optional(), email: z.string().max(160).optional(),
});
const adminFields = (a: { cpf?: string; phone?: string; email?: string }) => ({
  phone: a.phone ? digits(a.phone).slice(0, 13) : '', // coluna phone é NOT NULL
  cpf: a.cpf && digits(a.cpf).length === 11 ? digits(a.cpf) : null,
  email: a.email?.trim() ? a.email.trim().slice(0, 160) : null,
});
import { createTenant, newTableToken } from '../seed/catalog.js';
import { config } from '../config.js';

/** Painel da plataforma OITICICAS DIGITAL: empresas, planos e suporte. */
export const platformRouter = Router();
const DUMMY = hashPassword('x-inexistente');
const RESERVED = new Set(['admin', 'entrar', 'plataforma', 'api', 'garcom', 'cozinha', 'motoboy', 'imprimir', 'files', 'assets', 'uploads', 'pedido', 'mesa', 'login', 'www', 'app', 'suporte']);

platformRouter.get('/setup-needed', h(async (req) => ({ needed: !(await req.db.get('SELECT 1 FROM platform_users LIMIT 1')), token_required: !!config.setupToken || config.production, platform: config.platformName })));
platformRouter.post('/setup', h(async (req, res) => {
  if (await req.db.get('SELECT 1 FROM platform_users LIMIT 1')) throw new HttpError(403, 'A plataforma já foi configurada.');
  const b = z.object({ name: z.string().min(2).max(80), username: z.string().min(3).max(60).regex(/^[a-zA-Z0-9._@-]+$/), password: z.string().min(10, 'Use pelo menos 10 caracteres.').max(200), setup_token: z.string().max(200).optional() }).parse(req.body);
  // em produção, só quem tem o SETUP_TOKEN (variável de ambiente) cria o primeiro administrador
  if (config.production && !config.setupToken) throw new HttpError(403, 'Defina a variável de ambiente SETUP_TOKEN no servidor para liberar a configuração inicial.');
  if (config.setupToken && b.setup_token !== config.setupToken) throw new HttpError(403, 'Código de configuração inválido.');
  const r = await req.db.get('INSERT INTO platform_users (name, username, password_hash) VALUES ($1,$2,$3) RETURNING id', [b.name, b.username.toLowerCase(), await hashPassword(b.password)]);
  await audit(req.db, { platformUserId: r.id, action: 'platform.setup', ip: req.ip });
  const s = await createSession(req.db, 'platform', r.id, req.headers['user-agent']);
  res.cookie(PLATFORM_COOKIE, s.token, cookieOpts());
  return { ok: true };
}));
platformRouter.post('/login', h(async (req, res) => {
  const { username, password } = z.object({ username: z.string().min(1).max(60), password: z.string().min(1).max(200) }).parse(req.body);
  rateLimit(`plogin:${req.ip}`, 15, 10 * 60000, 'Muitas tentativas. Aguarde alguns minutos.');
  const u = await req.db.get('SELECT * FROM platform_users WHERE username = $1', [username.trim().toLowerCase()]);
  if (!u || !u.active) { await checkPassword(password, await DUMMY); throw new HttpError(401, 'Usuário ou senha inválidos.'); }
  if (u.locked_until && u.locked_until > new Date().toISOString()) throw new HttpError(429, 'Acesso bloqueado temporariamente. Aguarde 15 minutos.');
  if (!(await checkPassword(password, u.password_hash))) {
    const fails = u.failed_logins + 1;
    await req.db.run('UPDATE platform_users SET failed_logins = $1, locked_until = $2 WHERE id = $3', [fails >= 5 ? 0 : fails, fails >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null, u.id]);
    await audit(req.db, { platformUserId: u.id, action: 'platform.login_failed', ip: req.ip });
    throw new HttpError(401, 'Usuário ou senha inválidos.');
  }
  await req.db.run('UPDATE platform_users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [u.id]);
  const s = await createSession(req.db, 'platform', u.id, req.headers['user-agent']);
  res.cookie(PLATFORM_COOKIE, s.token, cookieOpts());
  await audit(req.db, { platformUserId: u.id, action: 'platform.login', ip: req.ip });
  return { ok: true };
}));
platformRouter.post('/logout', h(async (req, res) => {
  const tk = req.cookies?.[PLATFORM_COOKIE];
  if (tk) await req.db.run('UPDATE sessions SET revoked = true WHERE token_hash = $1', [sha256(tk)]);
  res.clearCookie(PLATFORM_COOKIE, { path: '/' });
  return { ok: true };
}));
platformRouter.get('/me', h((req) => ({ user: req.platformUser || null, platform: config.platformName })));

platformRouter.use(requirePlatform);
const P = (req: Request) => req.platformUser!.id;

platformRouter.get('/overview', h(async (req) => {
  const tenants = await req.db.get(`SELECT COUNT(*) total, COALESCE(SUM(status='ativo'),0) ativos, COALESCE(SUM(status='teste'),0) teste, COALESCE(SUM(status='suspenso'),0) suspensos FROM tenants`);
  const today = await req.db.get(`SELECT COUNT(*) orders, COALESCE(SUM(total_cents),0) total FROM orders WHERE created_at >= NOW(3) - INTERVAL 24 HOUR AND status NOT IN ('cancelado','aguardando_confirmacao')`);
  const month = await req.db.get(`SELECT COUNT(*) orders, COALESCE(SUM(total_cents),0) total FROM orders WHERE created_at >= DATE_FORMAT(NOW(3), '%Y-%m-01') AND status NOT IN ('cancelado','aguardando_confirmacao')`);
  const mrr = await req.db.get(`SELECT COALESCE(SUM(p.price_cents),0) v, COALESCE(SUM(p.price_cents IS NULL),0) sem_preco FROM tenants t JOIN plans p ON p.id = t.plan_id WHERE t.status = 'ativo'`);
  return { tenants, today, month, mrr };
}));

platformRouter.get('/tenants', h((req) => req.db.all(`SELECT t.id, t.slug, t.name, t.status, t.trial_ends_at, t.created_at, t.contact_name, t.contact_phone, t.contact_email, t.document, t.notes, t.plan_id, p.name plan_name,
  (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.active) users,
  (SELECT COUNT(*) FROM orders o WHERE o.tenant_id = t.id AND o.created_at >= NOW(3) - INTERVAL 30 DAY AND o.status <> 'cancelado') orders_30d,
  (SELECT MAX(o.created_at) FROM orders o WHERE o.tenant_id = t.id) last_order
  FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id ORDER BY t.created_at DESC`)));

const slugSchema = z.string().min(3).max(50).regex(/^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$/, 'Use letras minúsculas, números e hífen (ex.: pizzaria-do-joao).');
platformRouter.post('/tenants', h(async (req) => {
  const b = z.object({
    name: z.string().min(2).max(80), slug: slugSchema, plan_id: z.number().int().nullable().optional(), status: z.enum(['ativo', 'teste']).default('ativo'),
    trial_days: z.number().int().min(1).max(90).optional(), document: z.string().max(30).default(''), contact_name: z.string().max(80).default(''),
    contact_phone: z.string().max(25).default(''), contact_email: z.string().max(120).default(''),
    admin: adminSchema,
    tables: z.number().int().min(0).max(200).default(0),
  }).parse(req.body);
  if (RESERVED.has(b.slug)) throw bad('Este endereço é reservado pelo sistema. Escolha outro.');
  if (await req.db.get('SELECT 1 FROM tenants WHERE slug = $1', [b.slug])) throw conflict('Este endereço já está em uso.');
  const hash = await hashPassword(b.admin.password);
  const af = adminFields(b.admin);
  const id = await req.db.tx(async (q) => {
    const tid = await createTenant(q, { ...b, trial_ends_at: b.status === 'teste' ? new Date(Date.now() + (b.trial_days || 15) * 864e5).toISOString() : null });
    await q.run("INSERT INTO users (tenant_id, name, username, password_hash, role, phone, cpf, email) VALUES ($1,$2,$3,$4,'admin',$5,$6,$7)", [tid, b.admin.name, b.admin.username.toLowerCase(), hash, af.phone, af.cpf, af.email]);
    for (let i = 1; i <= b.tables; i++) await q.run('INSERT INTO dining_tables (tenant_id, label, sort, qr_token) VALUES ($1,$2,$3,$4)', [tid, String(i), i, newTableToken()]);
    await audit(q, { tenantId: tid, platformUserId: P(req), action: 'platform.tenant_create', entity: 'tenant', entityId: tid, data: { slug: b.slug, plan_id: b.plan_id, status: b.status }, ip: req.ip });
    return tid;
  });
  return { id };
}));

platformRouter.put('/tenants/:id', h(async (req) => {
  const b = z.object({
    name: z.string().min(2).max(80), slug: slugSchema, plan_id: z.number().int().nullable(), status: z.enum(['ativo', 'teste', 'suspenso', 'cancelado']),
    trial_ends_at: z.string().nullable().optional(), document: z.string().max(30).default(''), contact_name: z.string().max(80).default(''),
    contact_phone: z.string().max(25).default(''), contact_email: z.string().max(120).default(''), notes: z.string().max(1000).default(''),
  }).parse(req.body);
  const old = await req.db.get('SELECT * FROM tenants WHERE id = $1', [Number(req.params.id)]);
  if (!old) throw notFound();
  if (RESERVED.has(b.slug)) throw bad('Este endereço é reservado pelo sistema.');
  if (b.slug !== old.slug && (await req.db.get('SELECT 1 FROM tenants WHERE slug = $1', [b.slug]))) throw conflict('Este endereço já está em uso.');
  await req.db.run(`UPDATE tenants SET name=$1, slug=$2, plan_id=$3, status=$4, trial_ends_at=$5, document=$6, contact_name=$7, contact_phone=$8, contact_email=$9, notes=$10, updated_at=NOW(3) WHERE id=$11`,
    [b.name, b.slug, b.plan_id, b.status, b.trial_ends_at || null, b.document, b.contact_name, b.contact_phone, b.contact_email, b.notes, old.id]);
  if (['suspenso', 'cancelado'].includes(b.status)) await req.db.run(`UPDATE sessions SET revoked = true WHERE kind = 'tenant' AND subject_id IN (SELECT id FROM users WHERE tenant_id = $1)`, [old.id]);
  await audit(req.db, { tenantId: old.id, platformUserId: P(req), action: 'platform.tenant_update', entity: 'tenant', entityId: old.id, data: { before: { slug: old.slug, status: old.status, plan_id: old.plan_id }, after: { slug: b.slug, status: b.status, plan_id: b.plan_id } }, ip: req.ip });
  return { ok: true, slug_changed: b.slug !== old.slug };
}));

platformRouter.get('/tenants/:id/users', h((req) => req.db.all('SELECT id, name, username, role, active, phone, cpf, email FROM users WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY role, name', [Number(req.params.id)])));
platformRouter.post('/tenants/:id/admins', h(async (req) => {
  // cria um administrador para a empresa (ex.: a empresa Espetinho do Sergio criada na primeira execução)
  const b = adminSchema.parse(req.body);
  const tid = Number(req.params.id);
  if (!(await req.db.get('SELECT 1 FROM tenants WHERE id = $1', [tid]))) throw notFound();
  if (await req.db.get('SELECT 1 FROM users WHERE tenant_id = $1 AND lower(username) = lower($2)', [tid, b.username])) throw conflict('Este usuário já existe nesta empresa.');
  const af = adminFields(b);
  const r = await req.db.get("INSERT INTO users (tenant_id, name, username, password_hash, role, phone, cpf, email) VALUES ($1,$2,$3,$4,'admin',$5,$6,$7) RETURNING id", [tid, b.name, b.username.toLowerCase(), await hashPassword(b.password), af.phone, af.cpf, af.email]);
  await audit(req.db, { tenantId: tid, platformUserId: P(req), action: 'platform.admin_create', entity: 'user', entityId: r.id, data: { username: b.username }, ip: req.ip });
  return { id: r.id };
}));
platformRouter.post('/tenants/:id/reset-password', h(async (req) => {
  const b = z.object({ user_id: z.number().int(), password: z.string().min(8).max(200) }).parse(req.body);
  const u = await req.db.get('SELECT id FROM users WHERE id = $1 AND tenant_id = $2', [b.user_id, Number(req.params.id)]);
  if (!u) throw notFound('Usuário não encontrado nesta empresa.');
  await req.db.run('UPDATE users SET password_hash = $1, failed_logins = 0, locked_until = NULL, active = true WHERE id = $2', [await hashPassword(b.password), u.id]);
  await req.db.run("UPDATE sessions SET revoked = true WHERE kind = 'tenant' AND subject_id = $1", [u.id]);
  await audit(req.db, { tenantId: Number(req.params.id), platformUserId: P(req), action: 'platform.password_reset', entity: 'user', entityId: u.id, ip: req.ip });
  return { ok: true };
}));

// M3: Reiniciar empresa. Apaga TODOS os dados operacionais e a auditoria da empresa (pedidos, pagamentos,
// caixas, entregas, clientes), mantém o cardápio, a logo, as cores e as configurações, remove toda a equipe
// e deixa um único administrador novo. Só o dono da plataforma, confirmando a senha e a frase de segurança.
platformRouter.post('/tenants/:id/reset', h(async (req) => {
  const b = z.object({
    confirm: z.string(),
    auth: z.object({ username: z.string().max(60), password: z.string().max(200) }).optional(),
    admin: adminSchema,
  }).parse(req.body);
  const tid = Number(req.params.id);
  const tenant = await req.db.get('SELECT id, slug, name FROM tenants WHERE id = $1', [tid]);
  if (!tenant) throw notFound('Empresa não encontrada.');
  if (b.confirm.trim().toUpperCase() !== 'REINICIAR') throw bad('Para confirmar, digite a palavra REINICIAR.');
  const platformUserId = await authorizePlatform(req, b.auth);

  await req.db.tx(async (q) => {
    await q.run('SET @od_wipe = 1');
    // Dados operacionais (filhos antes dos pais, por causa das chaves estrangeiras)
    await q.run('DELETE FROM order_items WHERE tenant_id = $1', [tid]);
    await q.run('DELETE FROM payments WHERE tenant_id = $1', [tid]);
    await q.run('DELETE FROM order_events WHERE tenant_id = $1', [tid]);
    await q.run('DELETE FROM kitchen_tickets WHERE tenant_id = $1', [tid]);
    await q.run('DELETE FROM cash_movements WHERE tenant_id = $1', [tid]);
    await q.run('DELETE FROM orders WHERE tenant_id = $1', [tid]);
    await q.run('DELETE FROM cash_sessions WHERE tenant_id = $1', [tid]);
    await q.run('DELETE FROM expenses WHERE tenant_id = $1', [tid]);
    await q.run('DELETE FROM customer_addresses WHERE tenant_id = $1', [tid]);
    await q.run('DELETE FROM customers WHERE tenant_id = $1', [tid]);
    await q.run('DELETE FROM audit_log WHERE tenant_id = $1', [tid]);
    // Equipe: encerra sessões e remove todos os usuários
    await q.run("UPDATE sessions SET revoked = true WHERE kind = 'tenant' AND subject_id IN (SELECT id FROM users WHERE tenant_id = $1)", [tid]);
    await q.run('DELETE FROM users WHERE tenant_id = $1', [tid]);
    // Zera a numeração de pedidos e cria o administrador novo do cliente
    await q.run('UPDATE tenants SET order_seq = 0 WHERE id = $1', [tid]);
    await q.run("INSERT INTO users (tenant_id, name, username, password_hash, role, phone, cpf, email) VALUES ($1,$2,$3,$4,'admin',$5,$6,$7)",
      [tid, b.admin.name, b.admin.username.toLowerCase(), await hashPassword(b.admin.password), adminFields(b.admin).phone, adminFields(b.admin).cpf, adminFields(b.admin).email]);
    await q.run('SET @od_wipe = NULL');
  });

  // Registro do ato de reinicialização (fica na auditoria da empresa, já zerada, como primeiro evento novo)
  await audit(req.db, { tenantId: tid, platformUserId, action: 'platform.tenant_reset', entity: 'tenant', entityId: tid,
    data: { tenant: tenant.slug, new_admin: b.admin.username }, ip: req.ip });
  return { ok: true };
}));

/** Suporte: entra no painel da empresa como o administrador dela (sessão de 4h, registrada na auditoria da empresa). */
platformRouter.post('/tenants/:id/impersonate', h(async (req, res) => {
  const { reason } = z.object({ reason: z.string().min(3).max(200) }).parse(req.body);
  const u = await req.db.get("SELECT id FROM users WHERE tenant_id = $1 AND role = 'admin' AND active ORDER BY id LIMIT 1", [Number(req.params.id)]);
  if (!u) throw bad('A empresa não tem administrador ativo.');
  const s = await createSession(req.db, 'tenant', u.id, req.headers['user-agent'], P(req));
  res.cookie(COOKIE, s.token, cookieOpts(4 / 24));
  await audit(req.db, { tenantId: Number(req.params.id), platformUserId: P(req), action: 'platform.impersonate', entity: 'user', entityId: u.id, reason, ip: req.ip });
  return { ok: true };
}));

// ---------- Planos ----------
const planSchema = z.object({
  name: z.string().min(2).max(60), description: z.string().max(400).default(''), price_cents: z.number().int().min(0).nullable(),
  max_users: z.number().int().min(1).nullable(), max_tables: z.number().int().min(0).nullable(), max_products: z.number().int().min(1).nullable(),
  features: z.object({ delivery: z.boolean(), self_order: z.boolean(), kds: z.boolean(), reports: z.boolean() }), active: z.boolean().default(true),
});
platformRouter.get('/plans', h((req) => req.db.all('SELECT p.*, (SELECT COUNT(*) FROM tenants t WHERE t.plan_id = p.id) tenants FROM plans p ORDER BY p.id')));
platformRouter.post('/plans', h(async (req) => {
  const p = planSchema.parse(req.body);
  const r = await req.db.get('INSERT INTO plans (name, description, price_cents, max_users, max_tables, max_products, features, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [p.name, p.description, p.price_cents, p.max_users, p.max_tables, p.max_products, JSON.stringify(p.features), p.active]);
  await audit(req.db, { platformUserId: P(req), action: 'platform.plan_create', entity: 'plan', entityId: r.id, data: p, ip: req.ip });
  return { id: r.id };
}));
platformRouter.put('/plans/:id', h(async (req) => {
  const p = planSchema.parse(req.body);
  const r = await req.db.run('UPDATE plans SET name=$1, description=$2, price_cents=$3, max_users=$4, max_tables=$5, max_products=$6, features=$7, active=$8 WHERE id=$9',
    [p.name, p.description, p.price_cents, p.max_users, p.max_tables, p.max_products, JSON.stringify(p.features), p.active, Number(req.params.id)]);
  if (!r.rowCount) throw notFound();
  await audit(req.db, { platformUserId: P(req), action: 'platform.plan_update', entity: 'plan', entityId: Number(req.params.id), data: p, ip: req.ip });
  return { ok: true };
}));

// ---------- Equipe da plataforma ----------
platformRouter.get('/users', h((req) => req.db.all('SELECT id, name, username, active, created_at FROM platform_users ORDER BY name')));
platformRouter.post('/users', h(async (req) => {
  const b = z.object({ name: z.string().min(2).max(80), username: z.string().min(3).max(60).regex(/^[a-zA-Z0-9._@-]+$/), password: z.string().min(10).max(200) }).parse(req.body);
  if (await req.db.get('SELECT 1 FROM platform_users WHERE username = $1', [b.username.toLowerCase()])) throw conflict('Usuário já existe.');
  const r = await req.db.get('INSERT INTO platform_users (name, username, password_hash) VALUES ($1,$2,$3) RETURNING id', [b.name, b.username.toLowerCase(), await hashPassword(b.password)]);
  await audit(req.db, { platformUserId: P(req), action: 'platform.user_create', entity: 'platform_user', entityId: r.id, ip: req.ip });
  return { id: r.id };
}));
platformRouter.put('/users/:id', h(async (req) => {
  const b = z.object({ active: z.boolean(), password: z.string().min(10).max(200).optional() }).parse(req.body);
  const target = Number(req.params.id);
  if (target === P(req) && !b.active) throw bad('Você não pode desativar o próprio acesso.');
  await req.db.run('UPDATE platform_users SET active = $1 WHERE id = $2', [b.active, target]);
  if (b.password) await req.db.run('UPDATE platform_users SET password_hash = $1 WHERE id = $2', [await hashPassword(b.password), target]);
  if (!b.active || b.password) await req.db.run("UPDATE sessions SET revoked = true WHERE kind = 'platform' AND subject_id = $1", [target]);
  await audit(req.db, { platformUserId: P(req), action: 'platform.user_update', entity: 'platform_user', entityId: target, data: { active: b.active, password_reset: !!b.password }, ip: req.ip });
  return { ok: true };
}));

platformRouter.get('/audit', h((req) => req.db.all(`SELECT a.*, pu.name platform_name, t.name tenant_name FROM audit_log a LEFT JOIN platform_users pu ON pu.id = a.platform_user_id LEFT JOIN tenants t ON t.id = a.tenant_id
  WHERE a.platform_user_id IS NOT NULL ORDER BY a.id DESC LIMIT 300`)));
