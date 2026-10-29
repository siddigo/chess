// Stockfish (WebAssembly) num Web Worker, conversando pelo protocolo UCI.
// Roda no navegador de quem está olhando: nada passa pelo servidor.
//
// Versão "lite single-thread" do Stockfish.js 17.1 (GPL v3, https://github.com/nmrugg/stockfish.js):
// ~7 MB e não precisa dos cabeçalhos de isolamento (COOP/COEP) da versão com várias threads.

const ENGINE_URL = '/vendor/stockfish/stockfish.js';

/**
 * Avaliação sempre do ponto de vista das BRANCAS:
 * `{ cp }` em centipeões, ou `{ mate, winner }` (mate em N lances; `mate: 0` = já é mate).
 * @typedef {{ cp: number } | { mate: number, winner: 'w'|'b' }} Score
 * @typedef {{ score: Score, pv: string[] }} Line   pv em UCI (ex.: 'g1f3', 'e7e8q')
 * @typedef {{ depth: number, lines: Line[] }} Result
 */

export class Engine {
  constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.listener = null;
    this.worker.onmessage = (e) => this.listener?.(String(e.data));
    this.ready = new Promise((resolve, reject) => {
      this.worker.onerror = (e) => reject(new Error(e.message || 'Não foi possível carregar o Stockfish'));
      this.listener = (line) => {
        if (line === 'uciok') this.send('isready');
        if (line === 'readyok') {
          this.listener = null;
          resolve();
        }
      };
      this.send('uci');
    });
    // Uma busca por vez: as chamadas entram numa fila.
    this.queue = this.ready;
  }

  send(cmd) {
    this.worker.postMessage(cmd);
  }

  /**
   * Analisa uma posição. Resolve com as linhas da última profundidade completa
   * (ou o que houver, se a busca for interrompida com `stop()`).
   * @param {string} fen
   * @param {{ depth?: number, multipv?: number }} [opts]
   * @returns {Promise<Result>}
   */
  analyse(fen, { depth = 14, multipv = 3 } = {}) {
    const run = this.queue.then(() => this.search(fen, depth, multipv));
    this.queue = run.catch(() => {});
    return run;
  }

  search(fen, depth, multipv) {
    const whiteToMove = fen.split(' ')[1] === 'w';
    return new Promise((resolve) => {
      let current = { depth: 0, lines: [] };
      let partial = { depth: 0, lines: [] };
      // Com menos lances legais que o MultiPV pedido, o engine manda menos linhas por profundidade.
      let expected = 1;
      this.listener = (line) => {
        if (line.startsWith('bestmove')) {
          this.listener = null;
          // Se a busca foi interrompida no meio de uma profundidade, fica com a anterior completa.
          resolve(current.lines.length ? current : partial);
          return;
        }
        const info = parseInfo(line, whiteToMove);
        if (!info) return;
        if (info.depth !== partial.depth) partial = { depth: info.depth, lines: [] };
        partial.lines[info.multipv - 1] = { score: info.score, pv: info.pv };
        expected = Math.max(expected, info.multipv);
        if (partial.lines.filter(Boolean).length >= expected) {
          current = { depth: partial.depth, lines: partial.lines.filter(Boolean) };
        }
      };
      this.send(`setoption name MultiPV value ${multipv}`);
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
    });
  }

  /** Interrompe a busca em andamento (a promessa dela resolve com o que já tiver). */
  stop() {
    if (this.listener) this.send('stop');
  }

  terminate() {
    this.listener = null;
    this.worker.terminate();
  }
}

/** Lê uma linha `info ... score ... pv ...`; ignora as parciais (lowerbound/upperbound). */
function parseInfo(line, whiteToMove) {
  if (!line.startsWith('info ') || !line.includes(' pv ') || / (lower|upper)bound/.test(line)) return null;
  const depth = Number(/ depth (\d+)/.exec(line)?.[1]);
  const multipv = Number(/ multipv (\d+)/.exec(line)?.[1] ?? 1);
  const m = / score (cp|mate) (-?\d+)/.exec(line);
  if (!depth || !m) return null;
  const sign = whiteToMove ? 1 : -1;
  const value = Number(m[2]) * sign;
  const score = m[1] === 'cp' ? { cp: value } : { mate: value, winner: value > 0 ? 'w' : 'b' };
  const pv = line.slice(line.indexOf(' pv ') + 4).trim().split(/\s+/);
  return { depth, multipv, score, pv };
}
