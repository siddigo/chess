// Carrega o .env (se existir) e executa o script indicado: node scripts/env.js [--local] <script>
// --local ignora o Supabase e usa a base fake (data/dev-games.json).
import path from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  process.loadEnvFile('.env');
} catch {}
const args = process.argv.slice(2);
if (args[0] === '--local') {
  process.env.LOCAL_DB = '1';
  args.shift();
}
await import(pathToFileURL(path.resolve(args[0])).href);
