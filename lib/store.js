// Armazenamento das partidas.
//
// - Com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: Postgres do Supabase (produção).
// - Sem elas (só localmente): memória + data/dev-games.json, para testar sem Supabase.
//
// Toda alteração de partida usa controle otimista pela coluna `version`, então
// dois pedidos simultâneos (ex.: lance e "tempo esgotado") nunca se sobrescrevem.

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { supabaseEnv } from './env.js';

export class Conflict extends Error {}

function supabaseStore(url, key) {
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Node < 22 não tem WebSocket nativo, e o cliente do Supabase exige um.
    realtime: { transport: globalThis.WebSocket ?? ws },
  });
  const check = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  return {
    async get(id) {
      return check(await db.from('games').select('*').eq('id', id).maybeSingle());
    },
    async list(limit = 500) {
      return check(await db.from('games').select('*').order('created_at', { ascending: false }).limit(limit));
    },
    async insert(row, secrets) {
      check(await db.from('games').insert(row));
      check(await db.from('game_secrets').insert({ game_id: row.id, ...secrets }));
    },
    async update(id, version, patch) {
      const rows = check(
        await db.from('games').update({ ...patch, version: version + 1 }).eq('id', id).eq('version', version).select('*'),
      );
      if (!rows.length) throw new Conflict();
      return rows[0];
    },
    async secrets(id) {
      return check(await db.from('game_secrets').select('*').eq('game_id', id).maybeSingle()) ?? {};
    },
    async setSecrets(id, patch) {
      check(await db.from('game_secrets').update(patch).eq('game_id', id));
    },
    async remove(id) {
      check(await db.from('games').delete().eq('id', id));
    },
    // Envia o novo estado pelo canal privado "game:<id>" (Realtime Broadcast).
    // É bem mais rápido que esperar o Postgres Changes. Só a chave secreta pode enviar.
    async broadcast(row) {
      const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify({ messages: [{ topic: `game:${row.id}`, event: 'state', payload: { row }, private: true }] }),
      });
      if (!res.ok) throw new Error(`broadcast: HTTP ${res.status}`);
    },
  };
}

function localStore() {
  const file = path.join(process.cwd(), 'data', 'dev-games.json');
  let state = { games: {}, secrets: {} };
  try {
    state = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  const persist = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 1));
  };
  const clone = (v) => (v == null ? v : structuredClone(v));
  return {
    async get(id) {
      return clone(state.games[id]) ?? null;
    },
    async list(limit = 500) {
      return clone(Object.values(state.games).sort((a, b) => b.created_at - a.created_at).slice(0, limit));
    },
    async insert(row, secrets) {
      state.games[row.id] = clone(row);
      state.secrets[row.id] = { ...secrets };
      persist();
    },
    async update(id, version, patch) {
      const cur = state.games[id];
      if (!cur || cur.version !== version) throw new Conflict();
      state.games[id] = { ...cur, ...clone(patch), version: version + 1 };
      persist();
      return clone(state.games[id]);
    },
    async secrets(id) {
      return { ...(state.secrets[id] ?? {}) };
    },
    async setSecrets(id, patch) {
      state.secrets[id] = { ...state.secrets[id], ...patch };
      persist();
    },
    async remove(id) {
      delete state.games[id];
      delete state.secrets[id];
      persist();
    },
    async broadcast() {}, // modo local usa polling
  };
}

let store;
export function getStore() {
  if (store) return store;
  const { url, secretKey } = supabaseEnv();
  if (url && secretKey) store = supabaseStore(url, secretKey);
  else if (process.env.VERCEL) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente da Vercel');
  else store = localStore();
  return store;
}
