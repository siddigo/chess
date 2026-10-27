// Compartilhado entre o servidor (api/) e o navegador: converte uma linha da
// tabela `games` no estado público da partida e calcula os relógios.
// Não pode depender de nada específico de Node ou do navegador.

export const turnOf = (row) => (row.moves.length % 2 === 0 ? 'w' : 'b');

// O relógio só começa a correr depois que cada lado fez seu primeiro lance.
export const clockRunning = (row) => row.status === 'playing' && !!row.time_control && row.moves.length >= 2;

/** Tempo restante (ms) de `color` no instante `now` (relógio do servidor), sem arredondar para zero. */
export function rawRemaining(row, color, now) {
  if (!row.time_control) return null;
  let t = color === 'w' ? row.clock_w : row.clock_b;
  if (clockRunning(row) && turnOf(row) === color) t -= now - row.last_move_at;
  return t;
}

export function toPublic(row, now) {
  const player = (c) => (row[`${c}_name`] == null ? null : { name: row[`${c}_name`], level: row[`${c}_level`] });
  const clamp = (v) => (v == null ? null : Math.max(0, v));
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    white: player('white'),
    black: player('black'),
    timeControl: row.time_control,
    clocks: row.time_control ? { w: clamp(rawRemaining(row, 'w', now)), b: clamp(rawRemaining(row, 'b', now)) } : null,
    clockRunning: clockRunning(row),
    serverNow: now,
    turn: turnOf(row),
    fen: row.fen,
    moves: row.moves.map(({ san, from, to, promotion }) => ({ san, from, to, promotion })),
    result: row.result,
    termination: row.termination,
    drawOffer: row.draw_offer,
  };
}
