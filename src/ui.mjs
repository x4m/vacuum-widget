import { createGame, restoreGame, horizon, pageStats, totals, sweep,
  endReport, tick, DURATION } from './engine.mjs';

const $ = id => document.getElementById(id);
const W = window.TelegramWidget;
let game = null, best = 0, help = false;
try {
  game = restoreGame(localStorage.getItem('vacuum.game'));
  best = Number(localStorage.getItem('vacuum.best')) || 0;
} catch {}
game = game || createGame((Date.now() ^ (Math.random() * 4294967296)) >>> 0);

function save() {
  try {
    localStorage.setItem('vacuum.game', JSON.stringify(game));
    localStorage.setItem('vacuum.best', String(best));
  } catch {}
}

function render() {
  if (game.status === 'won' || game.status === 'lost') best = Math.max(best, game.score);
  const t = totals(game), occupied = t.live + t.dead + t.held;
  $('time').textContent = (DURATION - game.turn) + 's';
  $('score').textContent = game.score;
  $('credits').textContent = '●'.repeat(game.credit) + '○'.repeat(4 - game.credit);
  $('space').style.width = (occupied / 108 * 100) + '%';
  $('space').className = occupied > 98 ? 'danger' : '';
  $('capacity').textContent = occupied + '/108 slots · ' + game.queue + '/8 writes waiting';
  $('best').textContent = 'BEST ' + best;
  $('notice').textContent = game.note;
  $('report').textContent = game.holds.length ?
    'Oldest snapshot: ' + (game.holds[0].end - game.turn) + 's left' : 'No old snapshot';
  $('end').disabled = game.status !== 'playing' || !game.holds.length;
  $('play').textContent = game.status === 'playing' ? 'Pause' :
    game.status === 'ready' ? 'Start shift' : game.status === 'paused' ? 'Resume' : 'Play again';
  $('result').textContent = game.status === 'won' ? 'DATABASE ONLINE' :
    game.status === 'lost' ? 'WRITERS STALLED' : 'KEEP THE WRITES FLOWING';
  const limit = horizon(game);
  game.pages.forEach((p, i) => {
    const s = pageStats(game, p), el = $('p' + i);
    el.disabled = game.status !== 'playing' || game.credit < 1;
    el.title = `Page ${i + 1}: ${s.dead} removable, ${s.held} held, ${s.live} live`;
    el.innerHTML = '<span class="pagehead">' + String(i + 1).padStart(2, '0') +
      '<b>' + (s.dead ? '+' + s.dead : s.held ? 'HELD' : 'LIVE') + '</b></span><span class="slots">' +
      p.map(x => '<i class="' + (x === 0 ? 'free' : x === -1 ? 'live' : x < limit ? 'dead' : 'held') + '"></i>').join('') + '</span>';
  });
  $('board').hidden = help;
  $('instructions').hidden = !help;
  $('help').textContent = help ? 'Back to game' : 'How to play';
  save();
}

for (let i = 0; i < 9; i++) {
  const b = document.createElement('button');
  b.id = 'p' + i;
  b.className = 'page';
  b.onclick = () => { sweep(game, i); render(); };
  $('board').appendChild(b);
}
$('play').onclick = () => {
  if (game.status === 'won' || game.status === 'lost') game = createGame(Date.now() >>> 0);
  game.status = game.status === 'playing' ? 'paused' : 'playing';
  help = false;
  render();
};
$('end').onclick = () => { endReport(game); render(); };
$('help').onclick = () => {
  help = !help;
  if (game.status === 'playing') game.status = 'paused';
  render();
};
function pause() {
  if (game.status === 'playing') { game.status = 'paused'; render(); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
if (W) W.onEvent('deactivated', pause);
setInterval(() => {
  if (!document.hidden && (!W || W.isActive !== false) && game.status === 'playing') {
    tick(game);
    render();
  }
}, 1000);
render();
if (W && typeof W.ready === 'function') W.ready();
