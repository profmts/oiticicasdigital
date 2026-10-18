import { Router } from 'express';
import { z } from 'zod';
import { h, bad, HttpError, COOKIE, createSession, checkPassword, hashPassword, sha256, audit, requireAuth, cookieOpts, tenantBySlug, tenantActive, rateLimit } from '../core.js';
import { config } from '../config.js';
import { ROLE_HOME, ROLE_LABELS, PERMISSIONS } from '../permissions.js';

export const authRouter = Router();
const DUMMY_HASH = hashPassword('senha-inexistente'); // iguala o tempo de resposta para usuários inexistentes

export const logoUrl = (t: { logo_file_id: number | null }) => (t.logo_file_id ? `/files/${t.logo_file_id}` : null);

/** Dados públicos mínimos da empresa (tela de login da equipe). */
authRouter.get('/tenant/:slug', h(async (req) => {
  const t = await tenantBySlug(req.db, String(req.params.slug));
  if (!t) throw new HttpError(404, 'Empresa não encontrada. Confira o código de acesso.');
  return { slug: t.slug, name: t.name, logo_url: logoUrl(t), active: tenantActive(t) };
}));

authRouter.post('/login', h(async (req, res) => {
  const { company, username, password } = z.object({ company: z.string().min(1).max(60), username: z.string().min(1).max(60), password: z.string().min(1).max(200) }).parse(req.body);
  rateLimit(`login:${req.ip}`, 30, 10 * 60000, 'Muitas tentativas de login. Aguarde alguns minutos.');
  const fail = () => { throw new HttpError(401, 'Empresa, usuário ou senha inválidos.'); };
  const t = await tenantBySlug(req.db, company.trim());
  const u = t ? await req.db.get('SELECT * FROM users WHERE tenant_id = $1 AND lower(username) = lower($2)', [t.id, username.trim()]) : undefined;
  if (!t || !u || !u.active) { await checkPassword(password, await DUMMY_HASH); return fail(); }
  if (!tenantActive(t)) throw new HttpError(403, t.status === 'teste' ? 'O período de teste desta empresa terminou. Fale com o suporte da plataforma.' : 'Acesso da empresa suspenso. Fale com o suporte da plataforma.');
  if (u.locked_until && u.locked_until > new Date().toISOString()) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  if (!(await checkPassword(password, u.password_hash))) {
    const fails = u.failed_logins + 1;
    const lock = fails >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null;
    await req.db.run('UPDATE users SET failed_logins = $1, locked_until = $2 WHERE id = $3', [lock ? 0 : fails, lock, u.id]);
    await audit(req.db, { tenantId: t.id, userId: u.id, action: 'auth.login_failed', entity: 'user', entityId: u.id, ip: req.ip });
    return fail();
  }
  await req.db.run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [u.id]);
  const s = await createSession(req.db, 'tenant', u.id, req.headers['user-agent']);
  res.cookie(COOKIE, s.token, cookieOpts());
  await audit(req.db, { tenantId: t.id, userId: u.id, action: 'auth.login', entity: 'user', entityId: u.id, ip: req.ip });
  return { ok: true, home: ROLE_HOME[u.role as keyof typeof ROLE_HOME] };
}));

authRouter.post('/logout', h(async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) await req.db.run('UPDATE sessions SET revoked = true WHERE token_hash = $1', [sha256(token)]);
  res.clearCookie(COOKIE, { path: '/' });
  return { ok: true };
}));

authRouter.get('/me', h(async (req) => {
  const base = { platform: config.platformName, platform_user: req.platformUser ? { name: req.platformUser.name } : null, demo: config.demoMode };
  if (!req.user || !req.tenant) return { ...base, user: null };
  const t = req.tenant;
  return {
    ...base,
    user: { ...req.user, role_label: ROLE_LABELS[req.user.role], home: ROLE_HOME[req.user.role] },
    tenant: { id: t.id, slug: t.slug, name: t.name, status: t.status, logo_url: logoUrl(t), plan: t.plan, trial_ends_at: t.trial_ends_at },
    permissions_catalog: PERMISSIONS,
  };
}));

authRouter.post('/password', requireAuth, h(async (req) => {
  const { current, next } = z.object({ current: z.string(), next: z.string().min(8).max(200) }).parse(req.body);
  const u = await req.db.get('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
  if (!(await checkPassword(current, u.password_hash))) throw bad('Senha atual incorreta.');
  await req.db.run('UPDATE users SET password_hash = $1, updated_at = NOW(3) WHERE id = $2', [await hashPassword(next), req.user!.id]);
  const token = req.cookies?.[COOKIE];
  await req.db.run("UPDATE sessions SET revoked = true WHERE kind = 'tenant' AND subject_id = $1 AND token_hash <> $2", [req.user!.id, token ? sha256(token) : '']);
  await audit(req.db, { tenantId: req.tenant!.id, userId: req.user!.id, action: 'user.password_change', entity: 'user', entityId: req.user!.id, ip: req.ip });
  return { ok: true };
}));
