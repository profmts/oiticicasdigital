import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { ZodError, z } from 'zod';

z.config(z.locales.pt()); // mensagens de validação em português
import { findDir, type DB } from './db.js';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { HttpError, authenticate } from './core.js';
import { authRouter } from './routes/auth.js';
import { publicRouter, catalogRouter, filesRouter } from './routes/catalog.js';
import { opsRouter } from './routes/operations.js';
import { adminRouter } from './routes/admin.js';
import { platformRouter } from './routes/platform.js';
import { seedPlatform } from './seed/catalog.js';

export async function createApp(db: DB) {
  await seedPlatform(db);

  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.db = db;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (config.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    next();
  });
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  // Proteção CSRF: requisições que alteram dados precisam vir do próprio site.
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (origin) {
      try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Origem não permitida.' }); } catch { return res.status(403).json({ error: 'Origem inválida.' }); }
    }
    next();
  });

  app.get('/api/health', async (_req, res) => {
    try { await db.get('SELECT 1'); res.json({ ok: true, db: db.kind, demo: config.demoMode }); } catch { res.status(503).json({ ok: false }); }
  });
  app.use('/api', authenticate);
  app.use('/api/auth', authRouter);
  app.use('/api/platform', platformRouter);
  app.use('/api/public', publicRouter);
  app.use('/api', catalogRouter);
  app.use('/api', opsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use('/files', filesRouter);

  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDir = findDir(path.join(here, 'client'), path.join(here, '..', 'dist', 'client'), path.join(config.appRoot, 'dist', 'client'));
  if (fs.existsSync(clientDir)) {
    app.use('/assets', express.static(path.join(clientDir, 'assets'), { maxAge: '365d', immutable: true }));
    app.use(express.static(clientDir, { maxAge: '1h', index: false }));
    app.get(/^\/(?!api|files).*/, (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
  }

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const field = first?.path.join('.');
      return res.status(400).json({ error: first ? (field && !first.message.endsWith(".") ? `${field}: ${first.message}` : first.message) : 'Dados inválidos.', issues: err.issues });
    }
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    const e = err as any;
    if (e?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
    if (e?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Arquivo muito grande (máx. 3 MB).' });
    if (/não podem ser|não podem ser alterados/.test(String(e?.sqlMessage || e?.message || ''))) return res.status(409).json({ error: e.sqlMessage || e.message });
    if (e?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Registro duplicado.' });
    console.error(`[erro] ${req.method} ${req.path}`, err);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  });
  return app;
}
