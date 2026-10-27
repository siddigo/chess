// Carrega o .env (se existir) e executa o script indicado: node scripts/env.js <script>
import path from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  process.loadEnvFile('.env');
} catch {}
await import(pathToFileURL(path.resolve(process.argv[2])).href);
