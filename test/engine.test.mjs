import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, horizon, sweep, endReport, tick, restoreGame, totals, pageStats } from '../src/engine.mjs';

test('an old snapshot retains newer dead versions, not every dead version', () => {
  const g = createGame(1); g.status = 'playing'; g.turn = 8;
  g.holds = [{ start: 4, end: 15 }];
  g.pages[0] = [-1, 1, 3, 4, 7, 0, 0, 0, 0, 0, 0, 0];
  assert.equal(horizon(g), 4);
  assert.equal(sweep(g, 0), 2);
  assert.deepEqual(g.pages[0], [-1, 0, 0, 4, 7, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(g.credit, 3);
  assert.equal(g.score, 20);
});

test('ending only the oldest snapshot advances the horizon to the next one', () => {
  const g = createGame(1); g.status = 'playing'; g.turn = 12;
  g.holds = [{ start: 4, end: 18 }, { start: 10, end: 24 }];
  g.pages[0] = [3, 7, 11, -1, 0, 0, 0, 0, 0, 0, 0, 0];
  assert.equal(endReport(g), true);
  assert.equal(horizon(g), 10);
  assert.equal(g.score, -60);
  assert.equal(sweep(g, 0), 2);
  assert.equal(g.pages[0][2], 11);
});

test('I/O limits actions and paused games do not advance', () => {
  const g = createGame(2); g.status = 'playing'; g.credit = 0;
  const before = JSON.stringify(g);
  assert.equal(sweep(g, 0), 0); assert.equal(JSON.stringify(g), before);
  tick(g); assert.equal(g.credit, 1);
  g.status = 'paused'; const paused = JSON.stringify(g);
  tick(g); assert.equal(JSON.stringify(g), paused);
});

test('snapshots expire without charging the early-ending penalty', () => {
  const g = createGame(3); g.status = 'playing'; g.turn = 6;
  g.holds = [{ start: 2, end: 7 }];
  tick(g); assert.deepEqual(g.holds, []); assert.equal(g.score, 0);
});

test('saved games resume paused, fit storage, and reject malformed saves', () => {
  const g = createGame(5); g.status = 'playing'; tick(g);
  assert.ok(Buffer.byteLength(JSON.stringify(g)) < 3500);
  assert.equal(restoreGame(JSON.stringify(g)).status, 'paused');
  assert.equal(restoreGame('{'), null);
  assert.equal(restoreGame(JSON.stringify({ ...g, pages: [] })), null);
});

test('doing nothing loses, while deliberate page selection can survive', () => {
  const idle = createGame(6); idle.status = 'playing';
  while (idle.status === 'playing') tick(idle);
  assert.equal(idle.status, 'lost'); assert.ok(idle.turn < 60);
  let wins = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = createGame(seed); g.status = 'playing';
    while (g.status === 'playing') {
      while (g.credit) {
        const choices = g.pages.map((p, i) => [pageStats(g, p).dead, i]).sort((a, b) => b[0] - a[0]);
        if (!choices[0][0]) break;
        sweep(g, choices[0][1]);
      }
      if (g.queue >= 3 && g.holds.length) endReport(g);
      tick(g);
      const t = totals(g);
      assert.ok(t.live + t.dead + t.held <= 108);
      assert.ok(g.pages.every(p => p.length === 12));
    }
    if (g.status === 'won') wins++;
  }
  assert.ok(wins >= 35, `deliberate strategy won only ${wins}/40`);
});
