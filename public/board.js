// Tabuleiro reutilizável (partida e replay) com os níveis de visualização.
//
// Nível 0: xadrez normal
// Nível 1: cavalos e bispos viram peças de damas
// Nível 2: + torres
// Nível 3: todas exceto peões (dama e rei incluídos)
// Nível 4: todas as peças viram peças de damas
// Nível 5: peças invisíveis
// Nível 6: sem tabuleiro, só a notação (lances digitados)

import { tcFor } from '/game-state.js';

export const LEVEL_NAMES = [
  'Normal',
  'Cavalos e bispos ocultos',
  'Peças menores e torres ocultas',
  'Só peões visíveis',
  'Todas como damas',
  'Peças invisíveis',
  'Só a notação',
];

/** Nível em que não há tabuleiro: só a lista de lances. */
export const NOTATION_ONLY = 6;

const DISGUISED = [
  '',
  'nb',
  'nbr',
  'nbrqk',
  'nbrqkp',
];

const FILES = 'abcdefgh';

/** Como a peça aparece para quem está olhando: 'sprite' | 'checker' | 'hidden'. */
export function appearance(type, level) {
  if (level >= 5) return 'hidden';
  return DISGUISED[level].includes(type) ? 'checker' : 'sprite';
}

export class Board {
  /**
   * @param {HTMLElement} el
   * @param {{ onSquareDown?: (sq:string)=>void, onDrop?: (from:string,to:string)=>void }} handlers
   */
  constructor(el, handlers = {}) {
    this.el = el;
    this.handlers = handlers;
    this.orientation = 'w';
    this.squares = new Map();
    el.classList.add('board');
    this.build();
    this.bindPointer();
  }

  build() {
    this.el.innerHTML = '';
    this.squares.clear();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const file = this.orientation === 'w' ? f : 7 - f;
        const rank = this.orientation === 'w' ? 7 - r : r;
        const sq = FILES[file] + (rank + 1);
        const div = document.createElement('div');
        div.className = `sq ${(file + rank) % 2 === 0 ? 'dark' : 'light'}`;
        div.dataset.sq = sq;
        if (f === 0) div.insertAdjacentHTML('beforeend', `<span class="coord rank">${rank + 1}</span>`);
        if (r === 7) div.insertAdjacentHTML('beforeend', `<span class="coord file">${FILES[file]}</span>`);
        this.el.appendChild(div);
        this.squares.set(sq, div);
      }
    }
    // Setas (melhores lances da análise) por cima das casas.
    this.arrowsEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.arrowsEl.setAttribute('class', 'arrows');
    this.arrowsEl.setAttribute('viewBox', '0 0 8 8');
    this.el.appendChild(this.arrowsEl);
    this.arrowsKey = '';
  }

  /** Centro da casa nas coordenadas do SVG (0–8), conforme a orientação. */
  center(sq) {
    const f = FILES.indexOf(sq[0]);
    const r = Number(sq[1]) - 1;
    return this.orientation === 'w' ? [f + 0.5, 7.5 - r] : [7.5 - f, r + 0.5];
  }

  /** @param {{from:string,to:string,kind?:string}[]} arrows `kind` vira classe CSS (ex.: 'best', 'alt'). */
  renderArrows(arrows) {
    const key = arrows.map((a) => a.from + a.to + a.kind).join();
    if (key === this.arrowsKey) return;
    this.arrowsKey = key;
    // A primeira fica por cima: desenha de trás para a frente.
    this.arrowsEl.innerHTML = [...arrows].reverse().map((a) => {
      const [x1, y1] = this.center(a.from);
      const [x2, y2] = this.center(a.to);
      const len = Math.hypot(x2 - x1, y2 - y1);
      const [dx, dy] = [(x2 - x1) / len, (y2 - y1) / len];
      const [nx, ny] = [-dy, dx];
      const shaft = 0.2, head = 0.5, headLen = 0.45;
      const start = [x1 + dx * 0.15, y1 + dy * 0.15];
      const tip = [x2 - dx * 0.15, y2 - dy * 0.15];
      const base = [tip[0] - dx * headLen, tip[1] - dy * headLen];
      const p = (pt, w) => `${(pt[0] + nx * w).toFixed(3)},${(pt[1] + ny * w).toFixed(3)}`;
      const points = [p(start, shaft / 2), p(base, shaft / 2), p(base, head / 2), p(tip, 0),
        p(base, -head / 2), p(base, -shaft / 2), p(start, -shaft / 2)].join(' ');
      return `<polygon class="${a.kind ?? 'best'}" points="${points}"/>`;
    }).join('');
  }

  setOrientation(color) {
    if (color === this.orientation) return;
    this.orientation = color;
    this.build();
  }

  /**
   * @param {{ board: (null|{type:string,color:string,square:string})[][], level:number,
   *   lastMove?: {from:string,to:string}|null, selected?: string|null, targets?: {to:string,capture:boolean}[],
   *   checkSquare?: string|null, arrows?: {from:string,to:string,kind?:string}[] }} s
   */
  render(s) {
    this.renderArrows(s.arrows ?? []);
    const targets = new Map((s.targets ?? []).map((t) => [t.to, t]));
    const pieces = new Map();
    for (const row of s.board) for (const p of row) if (p) pieces.set(p.square, p);

    for (const [sq, div] of this.squares) {
      div.classList.toggle('last', !!s.lastMove && (s.lastMove.from === sq || s.lastMove.to === sq));
      div.classList.toggle('selected', s.selected === sq);
      div.classList.toggle('check', s.checkSquare === sq);
      const t = targets.get(sq);
      div.classList.toggle('target', !!t && !t.capture);
      div.classList.toggle('target-capture', !!t && t.capture);

      const p = pieces.get(sq);
      let pieceEl = div.querySelector('.piece');
      if (!p) {
        pieceEl?.remove();
        continue;
      }
      const look = appearance(p.type, s.level);
      const cls = `piece ${look} ${p.color === 'w' ? 'white' : 'black'}`;
      const bg = look === 'sprite' ? `url(/pieces/${p.color}${p.type.toUpperCase()}.svg)` : '';
      if (!pieceEl) {
        pieceEl = document.createElement('div');
        div.appendChild(pieceEl);
      }
      if (pieceEl.className !== cls) pieceEl.className = cls;
      if (pieceEl.style.backgroundImage !== bg) pieceEl.style.backgroundImage = bg;
    }
  }

  squareAt(x, y) {
    const el = document.elementFromPoint(x, y)?.closest('.sq');
    return el && this.el.contains(el) ? el.dataset.sq : null;
  }

  bindPointer() {
    let drag = null;

    this.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const sq = this.squareAt(e.clientX, e.clientY);
      if (!sq) return;
      e.preventDefault();
      this.handlers.onSquareDown?.(sq);

      const pieceEl = this.squares.get(sq).querySelector('.piece');
      if (!pieceEl || !this.squares.get(sq).classList.contains('selected')) return;
      drag = { from: sq, pieceEl, startX: e.clientX, startY: e.clientY, moved: false };
      this.el.setPointerCapture(e.pointerId);
    });

    this.el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      drag.pieceEl.classList.add('dragging');
      drag.pieceEl.style.transform = `translate(${dx}px, ${dy}px)`;
    });

    const end = (e) => {
      if (!drag) return;
      const { from, pieceEl, moved } = drag;
      drag = null;
      pieceEl.classList.remove('dragging');
      pieceEl.style.transform = '';
      if (!moved) return;
      const to = this.squareAt(e.clientX, e.clientY);
      if (to && to !== from) this.handlers.onDrop?.(from, to);
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  }
}

// ---------------------------------------------------------------- notação

const PT = { K: 'R', Q: 'D', R: 'T', B: 'B', N: 'C' };

export function formatSan(san, lang) {
  if (lang !== 'pt') return san;
  return san.replace(/[KQRBN]/g, (c) => PT[c]);
}

const FROM_PT = { R: 'K', D: 'Q', T: 'R', B: 'B', C: 'N' };
const SAN_RE = /^([KQRBN])?([a-h])?([1-8])?[x:-]?([a-h][1-8])=?([QRBN])?$/;

/**
 * Interpreta um lance digitado (SAN como `Cf3`, `exd5`, `O-O`, `e8=D`, ou coordenadas como `g1f3`)
 * na notação da configuração (`lang` 'pt' ou 'en'). `moves` são os lances legais (verbose do chess.js).
 * As mensagens de erro não dizem nada sobre a posição: só se o texto é ilegal, ambíguo ou incompleto.
 * @returns {{ move: object } | { error: string }}
 */
export function parseMoveInput(moves, text, lang) {
  let s = String(text).trim().replace(/[+#!?\s]/g, '');
  if (!s) return { error: 'Digite um lance' };

  const castle = s.replace(/0/g, 'O').toUpperCase();
  if (castle === 'O-O' || castle === 'O-O-O') {
    const flag = castle === 'O-O' ? 'k' : 'q';
    const m = moves.find((mv) => mv.flags.includes(flag));
    return m ? { move: m } : { error: `Lance ilegal: ${text.trim()}` };
  }

  // Peças em maiúscula; as colunas (inclusive a "b") ficam em minúscula.
  if (lang === 'pt') s = s.replace(/[RDTBC]/g, (c) => FROM_PT[c]);
  const p = SAN_RE.exec(s);
  if (!p) return { error: `Não entendi "${text.trim()}". Exemplos: ${lang === 'pt' ? 'Cf3, exd5, O-O, e8=D' : 'Nf3, exd5, O-O, e8=Q'}` };
  const [, piece, file, rank, to, promo] = p;

  // Origem completa (ex.: g1f3) vale para qualquer peça; sem ela, sem letra é peão.
  const type = piece ? piece.toLowerCase() : file && rank ? null : 'p';
  let found = moves.filter((m) =>
    m.to === to
    && (!type || m.piece === type)
    && (!file || m.from[0] === file)
    && (!rank || m.from[1] === rank));
  if (promo) found = found.filter((m) => m.promotion === promo.toLowerCase());

  if (!found.length) return { error: `Lance ilegal: ${text.trim()}` };
  if (found.every((m) => m.promotion) && !promo) {
    return { error: `Indique a peça da promoção (ex.: ${formatSan(to + '=Q', lang)})` };
  }
  if (found.length > 1) {
    return { error: `Lance ambíguo: indique a coluna ou a linha de origem (ex.: ${formatSan('Nbd2, R1e2', lang)})` };
  }
  return { move: found[0] };
}

export function getPref(key, fallback) {
  try {
    const v = localStorage.getItem('pref:' + key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function setPref(key, value) {
  try {
    localStorage.setItem('pref:' + key, JSON.stringify(value));
  } catch {}
}

export function resultText(result) {
  return { '1-0': '1–0', '0-1': '0–1', '1/2-1/2': '½–½', '*': '—' }[result] ?? '';
}

export function formatClock(ms) {
  if (ms == null) return '';
  const total = Math.max(0, ms);
  if (total < 10_000) return (total / 1000).toFixed(1);
  const s = Math.ceil(total / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function timeControlText(tc, color) {
  if (!tc) return 'Sem relógio';
  const text = (t) => `${t.initial / 60000}+${t.increment / 1000}`;
  if (color) return text(tcFor(tc, color));
  return tc.w ? `${text(tc.w)} brancas · ${text(tc.b)} pretas` : text(tc);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
