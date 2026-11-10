// A game model, not an implementation of PostgreSQL visibility checks.
// Slots: 0 = free, -1 = live, positive = committed deletion epoch.
export const PAGES = 9, SLOTS = 12, DURATION = 60, CREDIT_CAP = 4;

export function random(g) {
  g.seed = (Math.imul(g.seed, 1664525) + 1013904223) >>> 0;
  return g.seed / 4294967296;
}

export function createGame(seed = 1) {
  const g = { v: 1, seed: seed >>> 0, turn: 0, credit: CREDIT_CAP,
    score: 0, reclaimed: 0, queue: 0, holds: [], status: 'ready',
    note: 'Tap red versions away. Keep writes moving for 60 seconds.',
    pages: Array.from({ length: PAGES }, () => Array(SLOTS).fill(0)) };
  for (const page of g.pages) {
    for (let i = 0; i < 6; i++) page[i] = -1;
    for (let i = 6; i < 9; i++) page[i] = 1;
    // Vary the layout, but keep the same initial capacity in every game.
    for (let i = page.length - 1; i > 0; i--) {
      const j = Math.floor(random(g) * (i + 1));
      [page[i], page[j]] = [page[j], page[i]];
    }
  }
  return g;
}

export function horizon(g) {
  return g.holds.length ? Math.min(...g.holds.map(h => h.start)) : g.turn + 2;
}

export function pageStats(g, page) {
  const limit = horizon(g);
  return { live: page.filter(x => x === -1).length,
    dead: page.filter(x => x > 0 && x < limit).length,
    held: page.filter(x => x > 0 && x >= limit).length };
}

export function totals(g) {
  return g.pages.reduce((s, p) => {
    const c = pageStats(g, p);
    return { live: s.live + c.live, dead: s.dead + c.dead, held: s.held + c.held };
  }, { live: 0, dead: 0, held: 0 });
}

export function sweep(g, index) {
  if (g.status !== 'playing' || g.credit < 1 || !g.pages[index]) return 0;
  g.credit--;
  let removed = 0;
  const limit = horizon(g);
  g.pages[index] = g.pages[index].map(x => {
    if (x > 0 && x < limit) { removed++; return 0; }
    return x;
  });
  g.reclaimed += removed;
  g.score += removed * 10;
  g.note = removed ? `Page ${index + 1}: ${removed} versions reclaimed.` :
    'One I/O credit spent. No removable versions on that page.';
  return removed;
}

export function endReport(g) {
  if (g.status !== 'playing' || !g.holds.length) return false;
  g.holds.sort((a, b) => a.start - b.start);
  g.holds.shift();
  g.score -= 60;
  g.note = 'Report ended early. Horizon advanced. Cost: 60 points.';
  return true;
}

export function tick(g) {
  if (g.status !== 'playing') return;
  g.turn++;
  g.credit = Math.min(CREDIT_CAP, g.credit + 1);
  g.holds = g.holds.filter(h => h.end > g.turn);
  if ([8, 20, 32, 44].includes(g.turn)) {
    g.holds.push({ start: g.turn, end: g.turn + 14 });
    g.note = 'A long report opened a snapshot. Newer dead versions are held.';
  }
  const rate = 2 + (g.turn % 12 >= 9 ? 1 : 0);
  for (let i = 0; i < rate; i++) {
    const live = [];
    g.pages.forEach((p, pi) => p.forEach((x, si) => {
      if (x === -1) live.push([pi, si]);
    }));
    if (live.length) {
      const [pi, si] = live[Math.floor(random(g) * live.length)];
      g.pages[pi][si] = g.turn;
    }
  }
  g.queue += rate;
  for (let i = 0; i < rate + 1 && g.queue; i++) {
    const free = [];
    g.pages.forEach((p, pi) => p.forEach((x, si) => {
      if (x === 0) free.push([pi, si]);
    }));
    if (!free.length) break;
    const [pi, si] = free[Math.floor(random(g) * free.length)];
    g.pages[pi][si] = -1;
    g.queue--;
  }
  // Failure takes precedence over surviving the final second.
  if (g.queue >= 8) {
    g.status = 'lost';
    g.note = 'Writes stalled. Too many inserts waited for reusable space.';
  } else if (g.turn >= DURATION) {
    g.status = 'won';
    g.score += 200;
    g.note = 'Shift complete! +200 for keeping the database running.';
  }
}

export function restoreGame(text) {
  try {
    const g = JSON.parse(text);
    if (g.v !== 1 || !Array.isArray(g.pages) || g.pages.length !== PAGES ||
      !g.pages.every(p => Array.isArray(p) && p.length === SLOTS &&
        p.every(x => Number.isInteger(x) && x >= -1 && x <= 61)) ||
      !['ready', 'playing', 'paused', 'won', 'lost'].includes(g.status) ||
      !Number.isInteger(g.turn) || g.turn < 0 || g.turn > DURATION ||
      !Number.isInteger(g.credit) || g.credit < 0 || g.credit > CREDIT_CAP ||
      !Number.isFinite(g.score) || !Number.isInteger(g.queue) || g.queue < 0 ||
      !Array.isArray(g.holds) || g.holds.length > 2 ||
      !g.holds.every(h => Number.isInteger(h.start) && Number.isInteger(h.end)) ||
      !Number.isInteger(g.seed) || !Number.isInteger(g.reclaimed) ||
      typeof g.note !== 'string' || g.note.length > 160) return null;
    if (g.status === 'playing') g.status = 'paused';
    return g;
  } catch { return null; }
}
