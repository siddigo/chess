// Verifica a configuração do Supabase: npm run check
// Nunca imprime as chaves. Cria partidas de teste e as apaga no final.
//
// Requer o servidor local rodando com o mesmo .env (npm run dev) em CHECK_URL
// (padrão http://localhost:3000), para testar também a API.

import { createClient } from '@supabase/supabase-js';
import { supabaseEnv } from '../lib/env.js';

try {
  process.loadEnvFile('.env');
} catch {}

const { url: SUPABASE_URL, publicKey: SUPABASE_ANON_KEY, secretKey: SUPABASE_SERVICE_ROLE_KEY } = supabaseEnv();
const BASE = (process.env.CHECK_URL ?? 'http://localhost:3000') + '/api/';
let failures = 0;
const ok = (msg) => console.log('  ✓ ' + msg);
const bad = (msg) => (failures++, console.log('  ✗ ' + msg));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\nVariáveis de ambiente');
const vars = { 'URL do projeto': SUPABASE_URL, 'chave pública (anon/publishable)': SUPABASE_ANON_KEY, 'chave secreta (service_role/secret)': SUPABASE_SERVICE_ROLE_KEY };
for (const [k, v] of Object.entries(vars)) (v ? ok : bad)(`${k}: ${v ? 'encontrada' : 'NÃO encontrada'}`);
if (failures) process.exit(1);
if (SUPABASE_ANON_KEY === SUPABASE_SERVICE_ROLE_KEY) bad('SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY são iguais — confira qual é a pública e qual é a secreta');

const WebSocketImpl = globalThis.WebSocket ?? (await import('ws')).default;
const opts = { auth: { persistSession: false, autoRefreshToken: false }, ...(WebSocketImpl ? { realtime: { transport: WebSocketImpl } } : {}) };
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, opts);
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, opts);
const created = [];

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${data.error ?? ''}`);
  return data;
}

try {
  console.log('\nBanco (chave secreta)');
  {
    const { error } = await admin.from('games').select('id').limit(1);
    if (error) throw new Error('Tabela games inacessível: ' + error.message + ' — rodou o supabase/schema.sql?');
    ok('tabela games existe');
    const { error: e2 } = await admin.from('game_secrets').select('game_id').limit(1);
    e2 ? bad('tabela game_secrets: ' + e2.message) : ok('tabela game_secrets existe');
  }

  console.log('\nAPI local (' + BASE + ')');
  const a = await call('POST', 'games', { name: '__teste__', level: 5, color: 'white', timeControl: { minutes: 1, increment: 0 } });
  created.push(a.id);
  ok('criar partida');
  const b = await call('POST', `games/${a.id}/join`, { name: '__teste2__', level: 0 });
  b.color === 'b' && b.game.status === 'playing' ? ok('aceitar desafio') : bad('aceitar desafio');

  console.log('\nPermissões do navegador (chave pública)');
  {
    const { data, error } = await anon.from('games').select('id,fen').eq('id', a.id);
    !error && data.length === 1 ? ok('lê partidas') : bad('não consegue ler games: ' + (error?.message ?? 'sem linhas'));
    const { data: s } = await anon.from('game_secrets').select('*').eq('game_id', a.id);
    !s?.length ? ok('NÃO lê tokens (game_secrets)') : bad('consegue ler game_secrets — os tokens estão expostos!');
    await anon.from('games').update({ result: 'hack' }).eq('id', a.id);
    const { data: after } = await admin.from('games').select('result').eq('id', a.id).single();
    after.result !== 'hack' ? ok('NÃO altera partidas') : bad('consegue alterar games — falta RLS!');
    const { error: insErr } = await anon.from('games').insert({ id: 'hack-' + Date.now(), status: 'waiting', created_at: 0, fen: 'x' });
    insErr ? ok('NÃO cria partidas') : bad('consegue inserir em games — falta RLS!');
  }

  console.log('\nRealtime');
  if (!WebSocketImpl) {
    bad('sem WebSocket neste Node (instale com: npm i --no-save ws) — teste pulado');
  } else {
    const events = [];
    const channel = anon
      .channel('game:' + a.id, { config: { private: true } })
      .on('broadcast', { event: 'state' }, ({ payload }) => events.push({ at: Date.now(), row: payload.row }));
    const status = await new Promise((resolve) => {
      channel.subscribe((s) => ['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(s) && resolve(s));
      setTimeout(() => resolve('timeout'), 10_000);
    });
    if (status !== 'SUBSCRIBED') bad('não conectou ao Realtime: ' + status);
    else {
      ok('conectado');
      await sleep(1500);
      const delays = [];
      const plan = [[a, 'f2', 'f3'], [b, 'e7', 'e5'], [a, 'g2', 'g4'], [b, 'd8', 'h4']];
      let final;
      for (const [p, from, to] of plan) {
        const n = events.length;
        const t0 = Date.now();
        final = await call('POST', `games/${a.id}/move`, { token: p.token, from, to });
        // Espera o evento desta versão (identificado pelo número de lances).
        const ply = final.moves.length;
        const arrived = () => events.find((e) => e.row.moves?.length === ply);
        while (!arrived() && Date.now() - t0 < 5000) await sleep(10);
        delays.push(arrived() ? arrived().at - t0 : null);
      }
      const fmt = delays.map((d) => (d == null ? 'NÃO CHEGOU' : d + ' ms')).join(', ');
      delays.every((d) => d != null)
        ? ok(`recebeu todos os lances (lance → tela do oponente: ${fmt})`)
        : bad(`nem todos os lances chegaram: ${fmt}`);
      const last = events.at(-1)?.row;
      Array.isArray(last?.moves) && last.moves.length === 4 ? ok('linha chega completa (lista de lances)') : bad('linha chegou sem a lista de lances');
      final.status === 'finished' && final.result === '0-1' ? ok('xeque-mate detectado') : bad('partida não terminou como esperado');
      await anon.removeChannel(channel);
    }
  }

  console.log('\nPGN');
  const pgn = await (await fetch(BASE + `games/${a.id}/pgn`)).text();
  pgn.includes('[WhiteVisionLevel "5"]') ? ok('gerado') : bad('PGN inesperado');
} catch (err) {
  bad(err.message);
  if (/fetch failed|ECONNREFUSED/.test(err.message)) console.log('    → O servidor local está rodando? Abra outro terminal com: npm run dev');
} finally {
  if (created.length) {
    await admin.from('games').delete().in('id', created);
    console.log('\n(partidas de teste apagadas)');
  }
  console.log(failures ? `\n${failures} problema(s) encontrado(s).\n` : '\nTudo certo! ✓\n');
  process.exit(failures ? 1 : 0);
}
