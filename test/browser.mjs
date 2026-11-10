import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const server = createServer(async (req, res) => {
  const file = req.url === '/widget.html' ? 'widget.html' : 'index.html';
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(await readFile(new URL('../dist/' + file, import.meta.url)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [], external = [];
try {
  const page = await browser.newPage({ viewport: { width: 420, height: 850 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    if (route.request().url().startsWith(base)) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await page.clock.install();
  await page.goto(base);
  const game = page.frameLocator('iframe');
  await game.locator('#play').waitFor();
  assert.equal(await game.locator('.page').count(), 9);
  assert.equal(await game.locator('.slots i').count(), 108);
  for (const width of [200, 294, 320, 390, 600]) {
    await page.locator('iframe').evaluate((el, w) => { el.style.width = w + 'px'; }, width);
    const bounds = await game.locator('body').evaluate(el => ({
      height: el.getBoundingClientRect().height,
      width: el.scrollWidth, viewport: document.documentElement.clientWidth,
    }));
    assert.ok(bounds.height <= 600, `${width}px: widget is ${bounds.height}px tall`);
    assert.ok(bounds.width <= bounds.viewport, `${width}px: horizontal overflow`);
  }
  await page.locator('iframe').evaluate(el => { el.style.width = '100%'; });
  await game.locator('#play').click();
  await game.locator('#p0').click();
  assert.equal(await game.locator('#score').textContent(), '30');
  assert.equal(await game.locator('#best').textContent(), 'BEST 0');
  await page.clock.runFor(8000);
  assert.match(await game.locator('#report').textContent(), /Oldest snapshot/);
  assert.ok(await game.locator('.slots .held').count() > 0);
  await game.locator('#end').click();
  assert.equal(await game.locator('#score').textContent(), '-30');
  await game.locator('#help').click();
  const pausedTime = await game.locator('#time').textContent();
  await page.clock.runFor(4000);
  assert.equal(await game.locator('#time').textContent(), pausedTime);
  assert.equal(await game.locator('#play').textContent(), 'Resume');
  const helpFit = await game.locator('#instructions').evaluate(el => el.scrollHeight <= el.clientHeight);
  assert.ok(helpFit, 'instructions overflow');
  await game.locator('#help').click();
  await game.locator('#play').click();
  await page.reload();
  assert.equal(await game.locator('#play').textContent(), 'Resume');
  assert.equal(await game.locator('#score').textContent(), '-30');
  assert.equal(await game.locator('#time').textContent(), pausedTime);
  await page.clock.runFor(3000);
  assert.equal(await game.locator('#time').textContent(), pausedTime);
  await game.locator('#play').click();
  await page.clock.runFor(60000);
  assert.equal(await game.locator('#result').textContent(), 'WRITERS STALLED');
  await game.locator('#play').click();
  assert.equal(await game.locator('#score').textContent(), '0');
  assert.equal(await game.locator('#time').textContent(), '60s');
  await game.locator('#play').click(); // pause for stable screenshots
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL('../test-results/preview-dark.png', import.meta.url).pathname, fullPage: true });
  await page.locator('#theme').click();
  await page.screenshot({ path: new URL('../test-results/preview-light.png', import.meta.url).pathname, fullPage: true });

  // Emulate Telegram's lifecycle bridge, which is absent in a browser preview.
  const tg = await browser.newPage({ viewport: { width: 320, height: 700 } });
  await tg.addInitScript(() => {
    window.widgetEvents = {};
    window.TelegramWidget = { isActive: true,
      onEvent: (name, fn) => { window.widgetEvents[name] = fn; },
      ready: () => { window.widgetReady = true; } };
  });
  tg.on('pageerror', e => errors.push(e.message));
  await tg.clock.install();
  await tg.goto(base + '/widget.html');
  assert.equal(await tg.evaluate(() => window.widgetReady), true);
  await tg.locator('#play').click();
  await tg.evaluate(() => {
    window.TelegramWidget.isActive = false;
    window.widgetEvents.deactivated();
  });
  await tg.clock.runFor(5000);
  assert.equal(await tg.locator('#time').textContent(), '60s');
  assert.equal(await tg.locator('#play').textContent(), 'Resume');
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log('Browser checks passed: responsive layout, gameplay, help, pause, restore, restart, themes, Telegram lifecycle, no external requests.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

