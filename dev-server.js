// Servidor para rodar no seu computador (npm run dev). Imita a Vercel:
// arquivos de public/ + a mesma API de lib/api.js.
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import handler from './lib/api.js';

const PORT = Number(process.env.PORT) || 3000;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain', '.wasm': 'application/wasm' };
const REWRITES = [[/^\/game\/[^/]+$/, '/game.html'], [/^\/replay\/[^/]+$/, '/replay.html'], [/^\/history$/, '/history.html'], [/^\/ao-vivo$/, '/live.html'],[/^\/$/, '/index.html']];

createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://local');
  if (pathname.startsWith('/api/')) return handler(req, res);
  let file = pathname;
  for (const [re, target] of REWRITES) if (re.test(file)) file = target;
  const full = path.join('public', path.normalize(file));
  if (!full.startsWith('public') || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.statusCode = 404;
    return res.end('Não encontrado');
  }
  const type = TYPES[path.extname(full)] ?? 'application/octet-stream';
  res.setHeader('Content-Type', type.startsWith('text/') || type.endsWith('json') || type.endsWith('xml') ? type + '; charset=utf-8' : type);
  fs.createReadStream(full).pipe(res);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`\nXadrez às cegas (local) rodando!\n\n  Neste computador:  http://localhost:${PORT}`);
  for (const addrs of Object.values(os.networkInterfaces()))
    for (const a of addrs ?? []) if (a.family === 'IPv4' && !a.internal) console.log(`  Na rede local:     http://${a.address}:${PORT}`);
  console.log('');
});
