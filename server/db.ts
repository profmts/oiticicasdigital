import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Pastas procuradas em ordem: funciona rodando com tsx (server/) ou com o pacote compilado (dist/). */
export function findDir(...candidates: string[]) { return candidates.find((d) => fs.existsSync(d)) || candidates[0]; }

/**
 * Camada de banco: MySQL 8+ ou MariaDB 10.6+ (o banco da hospedagem Hostinger).
 * O código do sistema escreve parâmetros como $1, $2… e esta camada converte para o formato do MySQL,
 * trata datas em UTC, campos JSON e booleanos. Nunca concatena valores no SQL.
 */
export interface Q {
  all<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = any>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ rowCount: number; rows: any[]; insertId: number }>;
  exec(sql: string): Promise<void>;
}
export interface DB extends Q {
  kind: 'mysql';
  tx<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Colunas guardadas como texto JSON: são devolvidas já como objeto. */
const JSON_COLS = new Set(['value', 'permissions', 'options_json', 'address_json', 'data_json', 'features', 'summary_json']);
const ISO_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d{1,6})?Z$/;

/** $1..$n → ? (na ordem em que aparecem), datas ISO → formato MySQL em UTC, objetos → JSON. */
export function prepare(sql: string, params: unknown[] = []) {
  const out: unknown[] = [];
  const text = sql.replace(/\$(\d+)/g, (_m, n) => { out.push(params[Number(n) - 1]); return '?'; });
  const conv = out.map((v) => {
    if (typeof v === 'string') { const m = ISO_RE.exec(v); return m ? `${m[1]} ${m[2]}${(m[3] || '.000').slice(0, 4)}` : v; }
    if (v instanceof Date) return v.toISOString().replace('T', ' ').replace('Z', '');
    if (v === undefined) return null;
    return v;
  });
  return { text, values: conv };
}

function typeCast(field: any, next: () => any) {
  if (field.type === 'DATETIME' || field.type === 'TIMESTAMP') {
    const v = field.string();
    return v == null ? null : new Date(v.replace(' ', 'T') + 'Z').toISOString();
  }
  if (field.type === 'DATE') return field.string();
  if (field.type === 'TINY' && field.length === 1) { const v = field.string(); return v == null ? null : v === '1'; }
  if (field.type === 'JSON') { const v = field.string(); return v == null ? null : JSON.parse(v); }
  return next();
}

function fixRow(r: any) {
  for (const k of Object.keys(r)) {
    if (JSON_COLS.has(k) && typeof r[k] === 'string') { try { r[k] = JSON.parse(r[k]); } catch { /* texto comum */ } }
  }
  return r;
}

type Conn = { query: (sql: string, values?: unknown[]) => Promise<any> };
function wrap(c: Conn, multi: (sql: string) => Promise<void>): Q {
  const exec = async (sql: string, params?: unknown[]) => {
    // Emulação de "INSERT ... RETURNING id" (o MySQL não tem RETURNING)
    const ret = /\s+RETURNING\s+id\s*$/i.exec(sql);
    const { text, values } = prepare(ret ? sql.slice(0, ret.index) : sql, params);
    const [res] = await c.query(text, values);
    if (Array.isArray(res)) return { rows: res.map(fixRow), rowCount: res.length, insertId: 0 };
    const rows: any[] = ret ? [{ id: res.insertId }] : [];
    return { rows, rowCount: res.affectedRows ?? 0, insertId: res.insertId ?? 0 };
  };
  return {
    all: async (sql, p) => (await exec(sql, p)).rows,
    get: async (sql, p) => (await exec(sql, p)).rows[0],
    run: (sql, p) => exec(sql, p),
    exec: multi,
  };
}

/** Configuração de conexão: DATABASE_URL (mysql://...) ou DB_HOST/DB_USER/DB_PASSWORD/DB_NAME. */
export function connectionOptions(url = config.databaseUrl): mysql.PoolOptions {
  const base: mysql.PoolOptions = {
    timezone: 'Z', typeCast, decimalNumbers: true, supportBigNumbers: true, bigNumberStrings: false, charset: 'utf8mb4_unicode_ci',
    connectionLimit: config.dbPoolSize, waitForConnections: true, enableKeepAlive: true,
    ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined,
  };
  if (url) return { ...base, uri: url };
  return { ...base, host: config.dbHost, port: config.dbPort, user: config.dbUser, password: config.dbPassword, database: config.dbName };
}

const SESSION_SQL = "SET time_zone = '+00:00', sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'";

export async function openDatabase(url = config.databaseUrl): Promise<DB> {
  const opts = connectionOptions(url);
  if (!opts.uri && !opts.host) throw new Error('Banco de dados não configurado: defina DATABASE_URL ou DB_HOST, DB_USER, DB_PASSWORD e DB_NAME.');
  const pool = mysql.createPool(opts);
  pool.on('connection', (conn: any) => { conn.query(SESSION_SQL); });
  const multi = async (sql: string) => {
    const { connectionLimit: _l, waitForConnections: _w, queueLimit: _q, maxIdle: _m, idleTimeout: _i, ...single } = opts;
    const c = await mysql.createConnection({ ...single, multipleStatements: true });
    try { await c.query(SESSION_SQL); await c.query(sql); } finally { await c.end(); }
  };
  const db: DB = {
    kind: 'mysql', ...wrap(pool, multi),
    async tx(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const out = await fn(wrap(conn, multi));
        await conn.commit();
        return out;
      } catch (e) { await conn.rollback().catch(() => {}); throw e; } finally { conn.release(); }
    },
    async close() { await pool.end(); },
  };
  await db.get('SELECT 1');
  await migrate(db);
  return db;
}

export async function migrate(db: DB) {
  await db.run('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(120) PRIMARY KEY, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB');
  const dir = findDir(path.join(here, 'migrations'), path.join(here, '..', 'server', 'migrations'), path.join(config.appRoot, 'server', 'migrations'));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  // Trava para duas instâncias não migrarem ao mesmo tempo
  await db.tx(async (q) => {
    await q.get("SELECT GET_LOCK('outicicas_migrate', 60) AS l");
    try {
      for (const f of files) {
        if (await q.get('SELECT 1 FROM schema_migrations WHERE name = $1', [f])) continue;
        const sql = fs.readFileSync(path.join(dir, f), 'utf8');
        if (sql.includes('-- @@')) {
          // melhor esforço (ex.: gatilhos que hospedagens compartilhadas podem não permitir)
          for (const stmt of sql.split('-- @@').slice(1).map((s) => s.trim()).filter(Boolean)) {
            try { await db.exec(stmt); } catch (e: any) { console.warn(`[db] ${f}: item ignorado (${e.code || e.message})`); }
          }
        } else {
          await db.exec(sql);
        }
        await q.run('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        console.log(`[db] migration aplicada: ${f}`);
      }
    } finally { await q.get("SELECT RELEASE_LOCK('outicicas_migrate') AS l"); }
  });
}

export const nowIso = () => new Date().toISOString();
