// Prepara a pasta public/: copia as bibliotecas do navegador e gera config.js
// com as chaves PÚBLICAS do Supabase (URL + anon/publishable key).
import fs from 'node:fs';
import { supabaseEnv } from '../lib/env.js';

fs.mkdirSync('public/vendor', { recursive: true });
fs.copyFileSync('node_modules/chess.js/dist/esm/chess.js', 'public/vendor/chess.js');
fs.copyFileSync('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'public/vendor/supabase.js');

// Stockfish (GPL v3): versão lite single-thread, com a licença e os autores junto.
// O .js procura o .wasm com o mesmo nome, na mesma pasta.
const sf = 'node_modules/stockfish';
const sfName = fs.readdirSync(`${sf}/src`).find((f) => /^stockfish-[\d.]+-lite-single-\w+\.js$/.test(f));
if (!sfName) throw new Error('Stockfish lite single-thread não encontrado em node_modules/stockfish/src');
fs.mkdirSync('public/vendor/stockfish', { recursive: true });
fs.copyFileSync(`${sf}/src/${sfName}`, 'public/vendor/stockfish/stockfish.js');
fs.copyFileSync(`${sf}/src/${sfName.replace(/\.js$/, '.wasm')}`, 'public/vendor/stockfish/stockfish.wasm');
fs.copyFileSync(`${sf}/Copying.txt`, 'public/vendor/stockfish/COPYING.txt');
fs.copyFileSync(`${sf}/AUTHORS`, 'public/vendor/stockfish/AUTHORS.txt');

const { url, publicKey } = supabaseEnv();
const config = { supabaseUrl: url, supabaseAnonKey: publicKey };
fs.writeFileSync('public/config.js', `window.APP_CONFIG = ${JSON.stringify(config)};\n`);
console.log(config.supabaseUrl ? `Supabase: ${config.supabaseUrl}${publicKey ? '' : ' (FALTA a chave pública!)'}` : 'Sem Supabase: modo local (polling, dados em data/dev-games.json)');
