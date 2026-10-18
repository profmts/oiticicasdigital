// Copia migrations e imagens de seed para dentro de dist/, deixando o pacote compilado autossuficiente.
import fs from 'node:fs';
fs.rmSync('dist/migrations', { recursive: true, force: true });
fs.cpSync('server/migrations', 'dist/migrations', { recursive: true });
fs.cpSync('server/seed/assets', 'dist/assets', { recursive: true });
console.log('assets copiados para dist/');
