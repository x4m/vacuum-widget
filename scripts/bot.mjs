import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('Set TELEGRAM_BOT_TOKEN, then run npm run bot.');
const html = await readFile(new URL('../dist/widget.html', import.meta.url), 'utf8');
if (Buffer.byteLength(html) > 32768 || deflateSync(html, { level: 9 }).length > 4096) {
  throw new Error('Widget exceeds Telegram size limits.');
}
const allowed = new Set((process.env.TELEGRAM_ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean));
const apiBase = 'https://api.telegram.org/bot' + token + '/';
async function api(method, body) {
  const response = await fetch(apiBase + method, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(35000),
  });
  const data = await response.json();
  if (!data.ok) {
    const error = new Error(method + ': ' + (data.description || response.status));
    error.retryAfter = data.parameters?.retry_after;
    throw error;
  }
  return data.result;
}
const me = await api('getMe', {});
console.log(`@${me.username} ready. Open it and send /start. Ctrl-C stops delivery, not games already sent.`);
if (process.argv.includes('--send')) {
  if (!process.env.TELEGRAM_CHAT_ID) throw new Error('Set TELEGRAM_CHAT_ID for --send.');
  await deliver(process.env.TELEGRAM_CHAT_ID);
} else {
  let offset = 0;
  for (;;) {
    try {
      const updates = await api('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
      for (const u of updates) {
        offset = u.update_id + 1;
        const m = u.message;
        if (!m || m.chat.type !== 'private' || (allowed.size && !allowed.has(String(m.from.id)))) continue;
        if (/^\/(start|game)(?:@\w+)?(?:\s|$)/.test(m.text || '')) {
          await deliver(m.chat.id);
          if (process.argv.includes('--once')) process.exit(0);
        }
      }
    } catch (e) {
      console.error(e.message);
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.max(2, e.retryAfter || 2)));
    }
  }
}
async function deliver(chatId) {
  await api('sendWidget', { chat_id: chatId, html, allow_queries: false,
    caption: 'VACUUM Cleaner: keep a tiny PostgreSQL database running for 60 seconds. Tap pages to reclaim removable versions. Old snapshots hold newer dead versions. All gameplay runs locally, with no network requests.' });
  console.log('Game delivered.');
}

