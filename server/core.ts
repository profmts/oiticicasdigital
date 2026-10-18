import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import type { DB, Q } from './db.js';
import { config } from './config.js';
import { effectivePermissions, type Permission, type Role } from './permissions.js';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}
export const bad = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const forbidden = (msg = 'Você não tem permissão para esta ação.') => new HttpError(403, msg);
export const notFound = (msg = 'Registro não encontrado.') => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);

export interface SessionUser {
  id: number; tenantId: number; name: string; username: string; role: Role; permissions: Permission[]; available: boolean; impersonatedBy?: number | null;
}
export interface PlatformUser { id: number; name: string; username: string }
export interface TenantCtx { id: number; slug: string; name: string; status: string; plan: any | null; logo_file_id: number | null; trial_ends_at: string | null }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: SessionUser; platformUser?: PlatformUser; tenant?: TenantCtx; db: DB } }
}

export const COOKIE = 'od_session';
export const PLATFORM_COOKIE = 'od_platform';
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function loadTenant(q: Q, id: number): Promise<TenantCtx | undefined> {
  const t = await q.get(`SELECT t.id, t.slug, t.name, t.status, t.logo_file_id, t.trial_ends_at,
      p.id plan_id, p.name plan_name, p.max_users, p.max_tables, p.max_products, p.features
    FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id WHERE t.id = $1`, [id]);
  if (!t) return undefined;
  const plan = t.plan_id ? { id: t.plan_id, name: t.plan_name, max_users: t.max_users, max_tables: t.max_tables, max_products: t.max_products, features: t.features } : null;
  return { id: t.id, slug: t.slug, name: t.name, status: t.status, logo_file_id: t.logo_file_id, trial_ends_at: t.trial_ends_at, plan };
}
export async function tenantBySlug(q: Q, slug: string) {
  const r = await q.get('SELECT id FROM tenants WHERE slug = $1', [String(slug).toLowerCase()]);
  return r ? loadTenant(q, r.id) : undefined;
}
export const tenantActive = (t: TenantCtx) => t.status === 'ativo' || (t.status === 'teste' && (!t.trial_ends_at || t.trial_ends_at > new Date().toISOString()));
export const feature = (t: TenantCtx | undefined, f: string) => !t?.plan?.features || t.plan.features[f] !== false;

export async function loadUser(q: Q, id: number): Promise<SessionUser | undefined> {
  const u = await q.get('SELECT id, tenant_id, name, username, role, permissions, active, available FROM users WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!u || !u.active) return undefined;
  return { id: u.id, tenantId: u.tenant_id, name: u.name, username: u.username, role: u.role, available: u.available,
    permissions: effectivePermissions(u.role, u.permissions || {}) };
}

export async function createSession(q: Q, kind: 'tenant' | 'platform', subjectId: number, ua: string | undefined, impersonatedBy: number | null = null) {
  const token = randomToken();
  const expires = new Date(Date.now() + (impersonatedBy ? 4 / 24 : config.sessionDays) * 864e5).toISOString();
  await q.run('INSERT INTO sessions (token_hash, kind, subject_id, user_agent, expires_at, impersonated_by) VALUES ($1, $2, $3, $4, $5, $6)',
    [sha256(token), kind, subjectId, ua || null, expires, impersonatedBy]);
  return { token, expires };
}
export const cookieOpts = (days = config.sessionDays) => ({ httpOnly: true, sameSite: 'lax' as const, secure: config.cookieSecure, path: '/', maxAge: days * 864e5 });

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE];
    if (token) {
      const s = await req.db.get("SELECT subject_id, expires_at, revoked, impersonated_by FROM sessions WHERE token_hash = $1 AND kind = 'tenant'", [sha256(token)]);
      if (s && !s.revoked && s.expires_at > new Date().toISOString()) {
        const u = await loadUser(req.db, s.subject_id);
        const t = u && (await loadTenant(req.db, u.tenantId));
        if (u && t && (tenantActive(t) || s.impersonated_by)) { req.user = { ...u, impersonatedBy: s.impersonated_by }; req.tenant = t; }
      }
    }
    const ptoken = req.cookies?.[PLATFORM_COOKIE];
    if (ptoken) {
      const s = await req.db.get("SELECT subject_id, expires_at, revoked FROM sessions WHERE token_hash = $1 AND kind = 'platform'", [sha256(ptoken)]);
      if (s && !s.revoked && s.expires_at > new Date().toISOString()) {
        const p = await req.db.get('SELECT id, name, username, active FROM platform_users WHERE id = $1', [s.subject_id]);
        if (p?.active) req.platformUser = { id: p.id, name: p.name, username: p.username };
      }
    }
    next();
  } catch (e) { next(e); }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || !req.tenant) return next(new HttpError(401, 'Faça login para continuar.'));
  next();
}
export function requirePlatform(req: Request, _res: Response, next: NextFunction) {
  if (!req.platformUser) return next(new HttpError(401, 'Faça login na plataforma.'));
  next();
}

export const can = (u: SessionUser | undefined, p: Permission) => !!u && u.permissions.includes(p);

export function requirePerm(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Faça login para continuar.'));
    if (!perms.some((p) => can(req.user, p))) return next(forbidden());
    next();
  };
}

/** Autorização de supervisor da MESMA empresa (ex.: gerente digita a senha no caixa). Retorna quem autorizou. */
export async function authorize(req: Request, perm: Permission, auth?: { username?: string; password?: string }): Promise<number> {
  if (can(req.user, perm)) return req.user!.id;
  if (auth?.username && auth?.password) {
    const u = await req.db.get('SELECT id, password_hash FROM users WHERE tenant_id = $1 AND lower(username) = lower($2) AND active', [req.tenant!.id, auth.username]);
    if (u && (await checkPassword(auth.password, u.password_hash))) {
      const full = await loadUser(req.db, u.id);
      if (full && can(full, perm)) return full.id;
    }
    throw new HttpError(403, 'Autorização recusada: usuário/senha inválidos ou sem permissão.');
  }
  throw new HttpError(403, 'Esta ação precisa de autorização de um supervisor.', { needsAuthorization: perm });
}

/** Confirma a senha do PRÓPRIO usuário logado (ações destrutivas da empresa, ex.: excluir produto/usuário). */
export async function confirmPassword(req: Request, password?: string): Promise<void> {
  if (!req.user) throw new HttpError(401, 'Faça login para continuar.');
  if (!password) throw new HttpError(403, 'Confirme a sua senha para continuar.', { needsPasswordConfirm: true });
  const row = await req.db.get('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!row || !(await checkPassword(password, row.password_hash))) throw new HttpError(403, 'Senha incorreta.');
}

/** Exige a senha de um administrador da PLATAFORMA (ações só do dono do sistema, ex.: excluir mesa, reiniciar empresa). */
export async function authorizePlatform(req: Request, auth?: { username?: string; password?: string }): Promise<number> {
  if (!auth?.username || !auth?.password) throw new HttpError(403, 'Esta ação precisa do usuário e senha do administrador da plataforma.', { needsPlatformAuth: true });
  const p = await req.db.get('SELECT id, password_hash FROM platform_users WHERE lower(username) = lower($1) AND active', [auth.username]);
  if (p && (await checkPassword(auth.password, p.password_hash))) return p.id as number;
  throw new HttpError(403, 'Usuário ou senha do administrador da plataforma inválidos.');
}

export async function audit(q: Q, p: { tenantId?: number | null; userId?: number | null; platformUserId?: number | null; action: string; entity?: string; entityId?: number | null; data?: unknown; reason?: string | null; authorizedBy?: number | null; ip?: string }) {
  await q.run('INSERT INTO audit_log (tenant_id, user_id, platform_user_id, action, entity, entity_id, data_json, reason, authorized_by, ip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [p.tenantId ?? null, p.userId ?? null, p.platformUserId ?? null, p.action, p.entity ?? null, p.entityId ?? null,
      p.data === undefined ? null : JSON.stringify(p.data), p.reason ?? null, p.authorizedBy && p.authorizedBy !== p.userId ? p.authorizedBy : null, p.ip ?? null]);
}

/** Wrapper de rota com tratamento de erros assíncronos. */
export const h = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (e) { next(e); }
};

// ---------- Configurações da empresa ----------
export async function getSettings(q: Q, tenantId: number): Promise<Record<string, any>> {
  const rows = await q.all('SELECT `key`, value FROM settings WHERE tenant_id = $1', [tenantId]);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
export async function getSetting<T = any>(q: Q, tenantId: number, key: string): Promise<T> {
  const r = await q.get('SELECT value FROM settings WHERE tenant_id = $1 AND `key` = $2', [tenantId, key]);
  return r ? r.value : (undefined as T);
}
export async function setSetting(q: Q, tenantId: number, key: string, value: unknown) {
  await q.run('INSERT INTO settings (tenant_id, `key`, value) VALUES ($1, $2, $3) ON DUPLICATE KEY UPDATE value = VALUES(value)', [tenantId, key, JSON.stringify(value)]);
}

// ---------- Tempo real (Server-Sent Events), isolado por empresa ----------
type Client = { res: Response; tenantId: number };
const clients = new Set<Client>();
export function sseSubscribe(res: Response, tenantId: number) {
  const c = { res, tenantId };
  clients.add(c);
  return () => clients.delete(c);
}
/**
 * Emite apenas "algo mudou" + escopo, somente para as telas da mesma empresa.
 * Cada tela busca de novo os dados pela API, que aplica as permissões.
 */
export function broadcast(tenantId: number, scope: string, data: Record<string, unknown> = {}) {
  const msg = `event: change\ndata: ${JSON.stringify({ scope, ...data, at: Date.now() })}\n\n`;
  for (const c of clients) if (c.tenantId === tenantId) { try { c.res.write(msg); } catch { clients.delete(c); } }
}
setInterval(() => { for (const c of clients) { try { c.res.write(': ping\n\n'); } catch { clients.delete(c); } } }, 25000).unref();

export const digits = (s: string | null | undefined) => (s || '').replace(/\D/g, '');

/** Limite simples por chave (IP) contra abuso nos formulários públicos. */
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number, msg = 'Muitas solicitações em sequência. Aguarde alguns minutos.') {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new HttpError(429, msg);
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
}
