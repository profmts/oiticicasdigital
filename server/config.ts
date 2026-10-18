import path from 'node:path';

const root = process.env.APP_ROOT || process.cwd();

export const config = {
  appRoot: root,
  port: Number(process.env.PORT || 3000),
  /** mysql://usuario:senha@host:3306/banco — ou use DB_HOST, DB_USER, DB_PASSWORD e DB_NAME */
  databaseUrl: process.env.DATABASE_URL || '',
  dbHost: process.env.DB_HOST || '',
  dbPort: Number(process.env.DB_PORT || 3306),
  dbUser: process.env.DB_USER || '',
  dbPassword: process.env.DB_PASSWORD || '',
  dbName: process.env.DB_NAME || '',
  dbSsl: process.env.DATABASE_SSL === 'true',
  dbPoolSize: Number(process.env.DATABASE_POOL || 10),
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
  sessionDays: Number(process.env.SESSION_DAYS || 7),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  demoMode: process.env.DEMO_MODE === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
  platformName: process.env.PLATFORM_NAME || 'OUTICICAS DIGITAL',
  /** cria a empresa Espetinho do Sergio automaticamente na primeira execução */
  seedEspetinho: process.env.SEED_ESPETINHO !== 'false',
  maxUploadBytes: 3 * 1024 * 1024,
  /** código exigido para criar o primeiro administrador da plataforma (obrigatório em produção) */
  setupToken: process.env.SETUP_TOKEN || '',
  production: process.env.NODE_ENV === 'production',
};
