// Prepara a pasta public/: copia as bibliotecas do navegador e gera config.js
// com as chaves PÚBLICAS do Supabase (URL + anon/publishable key).
import fs from 'node:fs';

fs.mkdirSync('public/vendor', { recursive: true });
fs.copyFileSync('node_modules/chess.js/dist/esm/chess.js', 'public/vendor/chess.js');
fs.copyFileSync('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'public/vendor/supabase.js');

const config = {
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
};
fs.writeFileSync('public/config.js', `window.APP_CONFIG = ${JSON.stringify(config)};\n`);
console.log(config.supabaseUrl ? `Supabase: ${config.supabaseUrl}` : 'Sem Supabase: modo local (polling, dados em data/dev-games.json)');
