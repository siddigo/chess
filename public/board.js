// Tabuleiro reutilizável (partida e replay) com os níveis de visualização.
//
// Nível 0: xadrez normal
// Nível 1: cavalos e bispos viram peças de damas
// Nível 2: + torres
// Nível 3: todas exceto peões (dama e rei incluídos)
// Nível 4: todas as peças viram peças de damas
// Nível 5: peças invisíveis

export const LEVEL_NAMES = [
  'Normal',
  'Cavalos e bispos ocultos',
  'Peças menores e torres ocultas',
  'Só peões visíveis',
  'Todas como damas',
  'Peças invisíveis',
];

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
  }

  setOrientation(color) {
    if (color === this.orientation) return;
    this.orientation = color;
    this.build();
  }

  /**
   * @param {{ board: (null|{type:string,color:string,square:string})[][], level:number,
   *   lastMove?: {from:string,to:string}|null, selected?: string|null, targets?: {to:string,capture:boolean}[],
   *   checkSquare?: string|null }} s
   */
  render(s) {
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

export function timeControlText(tc) {
  if (!tc) return 'Sem relógio';
  return `${tc.initial / 60000}+${tc.increment / 1000}`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
