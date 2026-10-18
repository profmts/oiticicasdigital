import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { config } from './config.js';

// Sem top-level await: a Hostinger (LiteSpeed/lsnode) carrega o servidor com require(),
// e o Node não permite require() de um módulo ESM que use await fora de função.
async function main() {
  const db = await openDatabase();
  const app = await createApp(db);

  const server = app.listen(config.port, () => {
    console.log(`${config.platformName} rodando em http://localhost:${config.port}${config.demoMode ? '  [MODO DEMONSTRAÇÃO]' : ''}`);
    console.log(`Banco de dados: MySQL (${config.databaseUrl ? 'DATABASE_URL' : `${config.dbUser}@${config.dbHost}:${config.dbPort}/${config.dbName}`})`);
  });

  const shutdown = async () => { server.close(); await db.close(); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
