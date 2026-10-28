// Comunicação com o servidor.
// - Ações (criar, entrar, lance…) vão para a API via HTTP.
// - Atualizações chegam pelo Supabase Realtime (produção) ou por polling (modo local, sem Supabase).

import { toPublic } from '/game-state.js';

const config = window.APP_CONFIG ?? {};
const sb = config.supabaseUrl && window.supabase
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: false } })
  : null;

// ------------------------------------------------------------ relógio do servidor

// Diferença estimada entre o relógio do servidor e o local (usa a medição de menor latência).
let offset = 0;
let bestRtt = Infinity;
export const serverNow = () => Date.now() + offset;

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const t0 = Date.now();
  const res = await fetch('/api/' + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t1 = Date.now();
  const data = await res.json().catch(() => ({ error: `Erro ${res.status}` }));
  const sNow = data?.serverNow ?? data?.game?.serverNow;
  if (sNow && t1 - t0 < bestRtt) {
    bestRtt = t1 - t0;
    offset = sNow - (t0 + t1) / 2;
  }
  if (!res.ok) {
    const err = new Error(data.error ?? `Erro ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ------------------------------------------------------------ assentos (token do jogador)

export function getSeat(id) {
  try {
    return JSON.parse(localStorage.getItem('seat:' + id));
  } catch {
    return null;
  }
}

export function saveSeat(id, token, color) {
  try {
    localStorage.setItem('seat:' + id, JSON.stringify({ token, color }));
  } catch {}
}

// ------------------------------------------------------------ assinaturas

/** Chama onState(estadoPúblico) sempre que a partida mudar. Retorna função para cancelar. */
export function subscribeGame(id, onState) {
  const refetch = () => api('games/' + id).then(onState).catch(() => {});
  const onVisible = () => document.visibilityState === 'visible' && refetch();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', refetch);

  if (!sb) {
    refetch();
    const timer = setInterval(refetch, 1000);
    return () => clearInterval(timer);
  }

  const onRow = (row) => {
    // Se a linha vier incompleta por algum motivo, busca o estado pela API.
    if (Array.isArray(row?.moves) && row.fen) onState(toPublic(row, serverNow()));
    else refetch();
  };
  // Ao (re)conectar, busca o estado atual para não perder nada que mudou no meio-tempo.
  const onStatus = (status) => status === 'SUBSCRIBED' && refetch();

  // Caminho rápido: o servidor publica cada novo estado neste canal privado (só ele pode enviar).
  const fast = sb
    .channel('game:' + id, { config: { private: true } })
    .on('broadcast', { event: 'state' }, ({ payload }) => onRow(payload?.row))
    .subscribe(onStatus);
  // Reserva: alterações da tabela (mais lento, mas não depende do broadcast).
  const backup = sb
    .channel('game-db:' + id)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${id}` }, ({ new: row }) => onRow(row))
    .subscribe(onStatus);
  return () => {
    sb.removeChannel(fast);
    sb.removeChannel(backup);
  };
}

/** Chama onChange() quando qualquer partida for criada ou alterada. */
export function subscribeLobby(onChange) {
  onChange();
  if (!sb) {
    const timer = setInterval(onChange, 4000);
    return () => clearInterval(timer);
  }
  let t;
  const debounced = () => {
    clearTimeout(t);
    t = setTimeout(onChange, 250);
  };
  const channel = sb
    .channel('lobby')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, debounced)
    .subscribe((status) => status === 'SUBSCRIBED' && debounced());
  const timer = setInterval(onChange, 60_000); // rede de segurança
  return () => {
    clearInterval(timer);
    sb.removeChannel(channel);
  };
}
