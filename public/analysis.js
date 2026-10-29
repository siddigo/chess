// Análise com engine: avaliação, classificação dos lances, precisão e os
// elementos visuais compartilhados pelo replay e pela análise ao vivo
// (barra de avaliação e gráfico).

import { Chess } from '/vendor/chess.js';
import { formatSan } from '/board.js';

export const DEPTHS = [
  { depth: 10, label: 'Rápida' },
  { depth: 14, label: 'Normal' },
  { depth: 18, label: 'Profunda' },
];

/**
 * Analisa uma posição. Mate e afogamento são resolvidos aqui, sem o engine.
 * @returns {Promise<import('/engine.js').Result & { score: import('/engine.js').Score }>}
 */
export async function analysePosition(engine, fen, opts) {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return { depth: 0, lines: [], score: { mate: 0, winner: chess.turn() === 'w' ? 'b' : 'w' } };
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return { depth: 0, lines: [], score: { cp: 0 } };
  const r = await engine.analyse(fen, opts);
  return { ...r, score: r.lines[0]?.score ?? { cp: 0 } };
}

/** Chance de vitória das brancas (0–100), pela mesma curva do Lichess. */
export function winPercent(score) {
  if ('mate' in score) return score.winner === 'w' ? 100 : 0;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * score.cp)) - 1);
}

/** `+1.3`, `−0.4`, `#3` (brancas dão mate em 3), `#-2`, `1-0` (já é mate). */
export function formatScore(score) {
  if ('mate' in score) {
    if (score.mate === 0) return score.winner === 'w' ? '1-0' : '0-1';
    return `#${score.winner === 'w' ? '' : '-'}${Math.abs(score.mate)}`;
  }
  const v = score.cp / 100;
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
}

// ---------------------------------------------------------------- lances

/** Classes de lance pela perda de chance de vitória (pontos de 0 a 100) de quem jogou. */
export const CLASSES = {
  excellent: { label: 'Excelente', symbol: '' },
  good: { label: 'Bom', symbol: '' },
  inaccuracy: { label: 'Imprecisão', symbol: '?!' },
  mistake: { label: 'Erro', symbol: '?' },
  blunder: { label: 'Capivarada', symbol: '??' },
};

function classify(loss, isBest) {
  if (isBest || loss < 2) return 'excellent';
  if (loss < 5) return 'good';
  if (loss < 10) return 'inaccuracy';
  if (loss < 15) return 'mistake';
  return 'blunder';
}

/** Precisão de um lance (0–100) pela perda de chance de vitória (fórmula do Lichess). */
function moveAccuracy(loss) {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
}

export const uciOf = (m) => m.from + m.to + (m.promotion ?? '');

/**
 * Avalia o lance que levou da posição `before` à `after` (análises das duas posições).
 * @param {'w'|'b'} color quem jogou
 */
export function reviewMove(before, after, move, color) {
  const mover = (score) => (color === 'w' ? winPercent(score) : 100 - winPercent(score));
  const loss = Math.max(0, mover(before.score) - mover(after.score));
  const best = before.lines[0]?.pv[0] ?? null;
  const isBest = best === uciOf(move);
  return { loss, best, isBest, cls: classify(loss, isBest), accuracy: moveAccuracy(loss) };
}

/** Resumo de um jogador: precisão média e número de imprecisões, erros e capivaradas. */
export function summarize(reviews, color) {
  const mine = reviews.filter((r, i) => r && (i % 2 === 0 ? 'w' : 'b') === color);
  const count = (cls) => mine.filter((r) => r.cls === cls).length;
  return {
    moves: mine.length,
    accuracy: mine.length ? mine.reduce((s, r) => s + r.accuracy, 0) / mine.length : null,
    inaccuracy: count('inaccuracy'),
    mistake: count('mistake'),
    blunder: count('blunder'),
  };
}

/** Linha principal em notação, numerada a partir da posição (ex.: `12. Cf3 Cc6 13. Bb5`). */
export function lineText(fen, pv, lang, max = 8) {
  const chess = new Chess(fen);
  let num = Number(fen.split(' ')[5]) || 1;
  let out = chess.turn() === 'b' ? `${num}... ` : '';
  for (const uci of pv.slice(0, max)) {
    let m;
    try {
      m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
    if (m.color === 'w') out += `${num}. `;
    else num++;
    out += formatSan(m.san, lang) + ' ';
  }
  return out.trim();
}

/** O lance UCI em SAN (na notação escolhida), na posição dada. */
export function sanOf(fen, uci, lang) {
  try {
    const m = new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return formatSan(m.san, lang);
  } catch {
    return uci;
  }
}

// ---------------------------------------------------------------- visual

/** Barra de avaliação vertical: a parte branca cresce com a chance de vitória das brancas. */
export function renderEvalBar(el, score, orientation) {
  if (!el.firstChild) el.innerHTML = '<div class="fill"></div><span class="label"></span>';
  const w = score ? winPercent(score) : 50;
  el.classList.toggle('flipped', orientation === 'b');
  el.classList.toggle('black-better', w < 50);
  el.querySelector('.fill').style.height = `${w}%`;
  el.querySelector('.label').textContent = score ? formatScore(score).replace(/^[+−]/, '') : '';
  el.title = score ? `Avaliação: ${formatScore(score)}` : '';
}

/**
 * Gráfico de avaliação ao longo da partida. Clicar leva ao lance.
 * @param {SVGSVGElement} svg
 * @param {({score:object}|undefined)[]} results análise de cada posição (índice = lance)
 * @param {(object|undefined)[]} reviews classificação de cada lance
 * @param {number} current posição selecionada
 * @param {(ply:number)=>void} onSelect
 */
export function renderGraph(svg, results, reviews, current, onSelect) {
  const n = Math.max(1, results.length - 1);
  const y = (r) => (r ? 100 - winPercent(r.score) : 50).toFixed(2);
  const pts = results.map((r, i) => `${i},${y(r)}`).join(' ');
  const marks = reviews
    .map((r, i) => (r && (r.cls === 'mistake' || r.cls === 'blunder')
      ? `<line class="mark ${r.cls}" x1="${i + 1}" x2="${i + 1}" y1="0" y2="100"/>` : ''))
    .join('');
  svg.setAttribute('viewBox', `0 0 ${n} 100`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = `
    <polygon class="area" points="0,100 ${pts} ${results.length - 1},100"/>
    <line class="mid" x1="0" x2="${n}" y1="50" y2="50"/>
    ${marks}
    <line class="cursor" x1="${current}" x2="${current}" y1="0" y2="100"/>`;
  svg.onclick = (e) => {
    const rect = svg.getBoundingClientRect();
    onSelect(Math.round(((e.clientX - rect.left) / rect.width) * n));
  };
  svg.querySelectorAll('line').forEach((l) => l.setAttribute('vector-effect', 'non-scaling-stroke'));
}
