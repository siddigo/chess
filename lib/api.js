// Toda a API num único handler (uma função serverless só = menos "cold starts").
// Usado pela Vercel (api/handler.js) e pelo servidor local (dev-server.js).

import { Chess } from 'chess.js';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { getStore, Conflict } from './store.js';
import { toPublic, rawRemaining, clockRunning, turnOf, tcFor } from '../public/game-state.js';

const LEVELS = [0, 1, 2, 3, 4, 5, 6];
// Compensação de lag: até este tempo por lance pode ser descontado da cobrança
// do relógio, se o cliente informar que pensou menos do que o servidor mediu.
const MAX_LAG_COMP = 1000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const newId = (n) => randomBytes(n).toString('base64url');
const other = (c) => (c === 'w' ? 'b' : 'w');
const colorKey = (c) => (c === 'w' ? 'white' : 'black');
const cleanName = (s) => String(s ?? '').trim().slice(0, 24) || 'Anônimo';
const cleanLevel = (l) => (LEVELS.includes(Number(l)) ? Number(l) : 0);

function chessFor(row) {
  const chess = new Chess();
  for (const m of row.moves) chess.move({ from: m.from, to: m.to, promotion: m.promotion });
  return chess;
}

// Um lado sem material para dar mate não vence por tempo.
function canMate(chess, color) {
  const pieces = chess.board().flat().filter((p) => p && p.color === color && p.type !== 'k');
  if (pieces.length === 0) return false;
  return !(pieces.length === 1 && (pieces[0].type === 'n' || pieces[0].type === 'b'));
}

// ---------------------------------------------------------------- transições (retornam um patch)

function finishPatch(row, now, result, termination) {
  const patch = { status: 'finished', result, termination, draw_offer: null, finished_at: now };
  if (row.time_control) {
    patch.clock_w = Math.max(0, rawRemaining(row, 'w', now));
    patch.clock_b = Math.max(0, rawRemaining(row, 'b', now));
    patch.last_move_at = now;
  }
  return patch;
}

function flagFinish(row, now, loser) {
  const winner = other(loser);
  const patch = canMate(chessFor(row), winner)
    ? finishPatch(row, now, winner === 'w' ? '1-0' : '0-1', `Tempo esgotado — ${row[`${colorKey(loser)}_name`]} perdeu no tempo`)
    : finishPatch(row, now, '1/2-1/2', 'Tempo esgotado contra material insuficiente');
  patch[`clock_${loser}`] = 0;
  return patch;
}

/** Patch de "tempo esgotado" se o lado da vez estourou (com folga para o lag), senão null. */
function flagPatch(row, now) {
  if (!clockRunning(row)) return null;
  const turn = turnOf(row);
  if (rawRemaining(row, turn, now) > -MAX_LAG_COMP) return null;
  return flagFinish(row, now, turn);
}

function gameOverPatch(row, chess, now) {
  if (chess.isCheckmate()) {
    const winner = other(chess.turn());
    return finishPatch(row, now, winner === 'w' ? '1-0' : '0-1', 'Xeque-mate');
  }
  if (chess.isStalemate()) return finishPatch(row, now, '1/2-1/2', 'Afogamento');
  if (chess.isInsufficientMaterial()) return finishPatch(row, now, '1/2-1/2', 'Material insuficiente');
  if (chess.isThreefoldRepetition()) return finishPatch(row, now, '1/2-1/2', 'Repetição tripla');
  if (chess.isDrawByFiftyMoves()) return finishPatch(row, now, '1/2-1/2', 'Regra dos 50 lances');
  return null;
}

/** Lê a partida, aplica `fn` (que devolve um patch ou null) e grava; repete se houver conflito. */
async function mutate(id, fn) {
  const store = getStore();
  for (let attempt = 0; attempt < 5; attempt++) {
    const [row, secrets] = await Promise.all([store.get(id), store.secrets(id)]);
    if (!row) throw new HttpError(404, 'Partida não encontrada');
    const now = Date.now();
    const patch = fn(row, secrets, now);
    if (!patch) return row;
    let updated;
    try {
      updated = await store.update(id, row.version, patch);
    } catch (err) {
      if (!(err instanceof Conflict)) throw err;
      continue;
    }
    // Se o broadcast falhar, o Postgres Changes ainda entrega (só que mais devagar).
    await store.broadcast(updated).catch((err) => console.error(err.message));
    return updated;
  }
  throw new HttpError(409, 'A partida mudou enquanto seu pedido era processado. Tente de novo.');
}

function seatOf(secrets, token) {
  if (!token || typeof token !== 'string') return null;
  const eq = (a) => a && a.length === token.length && timingSafeEqual(Buffer.from(a), Buffer.from(token));
  if (eq(secrets.white_token)) return 'w';
  if (eq(secrets.black_token)) return 'b';
  return null;
}

function requirePlayer(row, secrets, token) {
  const seat = seatOf(secrets, token);
  if (!seat) throw new HttpError(403, 'Você não é jogador desta partida');
  if (row.status !== 'playing') throw new HttpError(409, 'A partida não está em andamento');
  return seat;
}

// ---------------------------------------------------------------- PGN

function pgnFor(row) {
  const chess = chessFor(row);
  const d = new Date(row.started_at ?? row.created_at);
  const pad = (n) => String(n).padStart(2, '0');
  const tcText = (c) => {
    const t = tcFor(row.time_control, c);
    return t ? `${t.initial / 1000}+${t.increment / 1000}` : '-';
  };
  const tc = tcText('w') === tcText('b') ? tcText('w') : '?';
  chess.setHeader('Event', 'Xadrez às cegas');
  chess.setHeader('Site', 'Xadrez às Cegas');
  chess.setHeader('Date', `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`);
  chess.setHeader('White', row.white_name ?? '?');
  chess.setHeader('Black', row.black_name ?? '?');
  chess.setHeader('Result', row.result ?? '*');
  chess.setHeader('TimeControl', tc);
  if (tc === '?') {
    chess.setHeader('WhiteTimeControl', tcText('w'));
    chess.setHeader('BlackTimeControl', tcText('b'));
  }
  chess.setHeader('WhiteVisionLevel', String(row.white_level ?? '?'));
  chess.setHeader('BlackVisionLevel', String(row.black_level ?? '?'));
  if (row.termination) chess.setHeader('Termination', row.termination);
  return chess.pgn();
}

// ---------------------------------------------------------------- rotas

async function listGames() {
  const rows = await getStore().list();
  const now = Date.now();
  return rows
    .filter((r) => r.status !== 'cancelled')
    .map((r) => {
      const { fen, moves, ...rest } = toPublic(r, now);
      return { ...rest, moveCount: moves.length };
    });
}

function cleanTimeControl(t) {
  if (!t || !(Number(t.minutes) > 0)) return null;
  return {
    initial: Math.round(Math.min(180, Number(t.minutes)) * 60_000),
    increment: Math.round(Math.max(0, Math.min(60, Number(t.increment) || 0)) * 1000),
  };
}

async function createGame(body) {
  const { name, level, opponentLevel, color, timeControl, opponentTimeControl } = body;
  const seat = color === 'white' ? 'w' : color === 'black' ? 'b' : Math.random() < 0.5 ? 'w' : 'b';
  const mineTc = cleanTimeControl(timeControl);
  // Sem `opponentTimeControl`, o adversário joga no mesmo ritmo.
  const oppTc = opponentTimeControl === undefined ? mineTc : cleanTimeControl(opponentTimeControl);
  if (!mineTc !== !oppTc) throw new HttpError(400, 'Os dois jogadores precisam ter relógio, ou nenhum');
  let tc = mineTc;
  if (mineTc && (mineTc.initial !== oppTc.initial || mineTc.increment !== oppTc.increment)) {
    tc = { [seat]: mineTc, [other(seat)]: oppTc };
  }
  const token = newId(18);
  const row = {
    id: newId(6),
    version: 0,
    status: 'waiting',
    created_at: Date.now(),
    started_at: null,
    finished_at: null,
    white_name: null,
    white_level: null,
    black_name: null,
    black_level: null,
    time_control: tc,
    clock_w: tcFor(tc, 'w')?.initial ?? null,
    clock_b: tcFor(tc, 'b')?.initial ?? null,
    last_move_at: null,
    moves: [],
    fen: new Chess().fen(),
    result: null,
    termination: null,
    draw_offer: null,
  };
  row[`${colorKey(seat)}_name`] = cleanName(name);
  row[`${colorKey(seat)}_level`] = cleanLevel(level);
  // O criador também define o nível do adversário, que só aceita.
  if (opponentLevel != null) row[`${colorKey(other(seat))}_level`] = cleanLevel(opponentLevel);
  await getStore().insert(row, { [`${colorKey(seat)}_token`]: token });
  return { id: row.id, token, color: seat, game: toPublic(row, Date.now()) };
}

async function joinGame(id, body) {
  const token = newId(18);
  let seat;
  const row = await mutate(id, (row) => {
    if (row.status !== 'waiting') throw new HttpError(409, 'Esta partida já tem dois jogadores');
    seat = row.white_name == null ? 'w' : 'b';
    return {
      [`${colorKey(seat)}_name`]: cleanName(body.name),
      // Desafios antigos (sem nível definido pelo criador) deixam quem aceita escolher.
      [`${colorKey(seat)}_level`]: row[`${colorKey(seat)}_level`] ?? cleanLevel(body.level),
      status: 'playing',
      started_at: Date.now(),
      last_move_at: Date.now(),
    };
  });
  await getStore().setSecrets(id, { [`${colorKey(seat)}_token`]: token });
  return { id, token, color: seat, game: toPublic(row, Date.now()) };
}

function move(id, { token, from, to, promotion, elapsed }) {
  return mutate(id, (row, secrets, now) => {
    const seat = requirePlayer(row, secrets, token);
    const flag = flagPatch(row, now);
    if (flag) return flag;
    if (turnOf(row) !== seat) throw new HttpError(409, 'Não é a sua vez');

    const chess = chessFor(row);
    let mv;
    try {
      mv = chess.move({ from, to, promotion });
    } catch {
      throw new HttpError(400, 'Lance ilegal');
    }

    const patch = {};
    if (row.time_control) {
      if (clockRunning(row)) {
        const serverElapsed = now - row.last_move_at;
        const claimed = Number.isFinite(elapsed) ? elapsed : serverElapsed;
        const charged = Math.min(serverElapsed, Math.max(serverElapsed - MAX_LAG_COMP, claimed));
        const left = row[`clock_${seat}`] - charged;
        if (left <= 0) return flagFinish(row, now, seat);
        patch[`clock_${seat}`] = left + tcFor(row.time_control, seat).increment;
      }
      patch.last_move_at = now;
    }
    patch.moves = [...row.moves, { san: mv.san, from: mv.from, to: mv.to, promotion: mv.promotion, t: now }];
    patch.fen = chess.fen();
    if (row.draw_offer && row.draw_offer !== seat) patch.draw_offer = null;

    const after = { ...row, ...patch };
    return { ...patch, ...gameOverPatch(after, chess, now) };
  });
}

function action(id, { token, type }) {
  return mutate(id, (row, secrets, now) => {
    if (type === 'cancel') {
      if (!seatOf(secrets, token)) throw new HttpError(403, 'Você não é jogador desta partida');
      if (row.status !== 'waiting') throw new HttpError(409, 'O desafio já foi aceito');
      return { status: 'cancelled', finished_at: now };
    }
    const seat = requirePlayer(row, secrets, token);
    const flag = flagPatch(row, now);
    if (flag) return flag;
    switch (type) {
      case 'resign':
        return finishPatch(row, now, seat === 'w' ? '0-1' : '1-0', `${row[`${colorKey(seat)}_name`]} abandonou`);
      case 'abort':
        if (row.moves.length >= 2) throw new HttpError(409, 'Só é possível abortar antes do segundo lance');
        return finishPatch(row, now, '*', 'Partida abortada');
      case 'offer-draw':
        if (row.draw_offer === other(seat)) return finishPatch(row, now, '1/2-1/2', 'Empate por acordo');
        return row.draw_offer === seat ? null : { draw_offer: seat };
      case 'accept-draw':
        if (row.draw_offer !== other(seat)) throw new HttpError(409, 'Não há proposta de empate');
        return finishPatch(row, now, '1/2-1/2', 'Empate por acordo');
      case 'decline-draw':
        return row.draw_offer === other(seat) ? { draw_offer: null } : null;
      default:
        throw new HttpError(400, 'Ação desconhecida');
    }
  });
}

async function getGame(id) {
  const row = await getStore().get(id);
  if (!row) throw new HttpError(404, 'Partida não encontrada');
  // Encerra por tempo "preguiçosamente": não há timer rodando no servidor.
  if (flagPatch(row, Date.now())) return mutate(id, (r, _s, now) => flagPatch(r, now));
  return row;
}

async function deleteGame(id, password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (expected) {
    const ok = typeof password === 'string' && password.length === expected.length &&
      timingSafeEqual(Buffer.from(password), Buffer.from(expected));
    if (!ok) throw new HttpError(401, 'Senha de administrador incorreta');
  } else if (process.env.VERCEL) {
    throw new HttpError(403, 'Defina ADMIN_PASSWORD nas variáveis de ambiente para poder apagar partidas');
  }
  const row = await getStore().get(id);
  if (!row) throw new HttpError(404, 'Partida não encontrada');
  if (row.status === 'playing') throw new HttpError(409, 'Não é possível apagar uma partida em andamento');
  await getStore().remove(id);
  return { ok: true };
}

// ---------------------------------------------------------------- HTTP

async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://local');
  // Na Vercel, o rewrite passa o caminho original em ?path=...
  let p = url.searchParams.get('path') ?? '';
  if (!p) p = url.pathname.replace(/^\/api\/?/, '');
  const [root, id, sub] = p.split('/').filter(Boolean);
  const m = req.method;

  try {
    if (root !== 'games') throw new HttpError(404, 'Rota não encontrada');
    const game = (row) => toPublic(row, Date.now());

    if (!id && m === 'GET') return send(res, 200, await listGames());
    if (!id && m === 'POST') return send(res, 200, await createGame(await readBody(req)));
    if (id && !sub && m === 'GET') return send(res, 200, game(await getGame(id)));
    if (id && !sub && m === 'DELETE') return send(res, 200, await deleteGame(id, req.headers['x-admin-password']));
    if (sub === 'pgn' && m === 'GET') {
      const row = await getStore().get(id);
      if (!row) throw new HttpError(404, 'Partida não encontrada');
      if (url.searchParams.has('download')) res.setHeader('Content-Disposition', `attachment; filename="partida-${id}.pgn"`);
      return send(res, 200, pgnFor(row), 'application/x-chess-pgn; charset=utf-8');
    }
    if (sub === 'join' && m === 'POST') return send(res, 200, await joinGame(id, await readBody(req)));
    if (sub === 'move' && m === 'POST') return send(res, 200, game(await move(id, await readBody(req))));
    if (sub === 'action' && m === 'POST') return send(res, 200, game(await action(id, await readBody(req))));
    if (sub === 'flag' && m === 'POST') return send(res, 200, game(await getGame(id)));
    throw new HttpError(404, 'Rota não encontrada');
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message, serverNow: Date.now() });
    console.error(err);
    return send(res, 500, { error: 'Erro interno: ' + err.message });
  }
}
