# VACUUM Cleaner

A one-minute PostgreSQL mini-game that fits inside a Telegram message.

**[Play in your browser](https://x4m.github.io/vacuum-widget/)**

Nine pages. A steady stream of writes. A report that really likes its old snapshot.
You are VACUUM. Keep the database running.

## Play

- Tap a page to remove its **red** row versions. Each one frees a slot and earns 10 points.
- Scanning a page costs one I/O credit. One credit recovers each second, up to four.
- **Striped amber** versions are retained by the oldest snapshot. Wait for its report to
  finish, or end the oldest report early for 60 points.
- Live versions stay. If eight inserts are waiting for space, the shift ends.
- Survive 60 seconds for a 200-point bonus.

The game pauses when hidden, when opening help, and when restored from storage.
The current game and best completed score stay on this device. No leaderboard,
tracking, network requests, database server, or model.

This is a deliberately small game model, not a PostgreSQL simulator. All changes
are treated as committed. An old snapshot retains newer dead versions, not every
dead version. Reclaiming a slot models reusable space **inside** a page: it does
not shrink the relation or compact live tuples between pages. Pins, indexes,
freezing, WAL, and the actual global visibility machinery are outside the model.

## Build and preview

Node.js 22.9 or newer:

```sh
npm ci
npm run build
npm test
npm run preview
```

Open http://127.0.0.1:4174. The preview can switch between light and dark themes.
`dist/widget.html` is the complete offline game. `dist/index.html` is a browser
frame around it and is not part of the Telegram payload.

The build refuses HTML above 32,768 UTF-8 bytes or 4,096 bytes after zlib level 9,
the limits in the [Telegram widget specification](https://core.telegram.org/bots/widgets).
Only the build and browser tests have npm dependencies. The game and delivery bot
have no runtime dependencies.

## Send it in Telegram

Create a bot with [@BotFather](https://t.me/BotFather), then copy `.env.example`
to `.env` and set `TELEGRAM_BOT_TOKEN`. Never commit that file.

```sh
npm run bot
```

Open your bot and send `/start` or `/game`. It sends one self-contained widget.
The bot uses long polling, so a laptop works: no VM, HTTPS endpoint, or incoming
port is needed. To deliver a single game and stop:

```sh
npm run bot -- --once
```

**Once delivered, the bot can stop. The game keeps working.** The widget makes no
requests to it. A continuously running bot is only needed to deliver new copies.
Optionally set `TELEGRAM_ALLOWED_USERS` to a comma-separated list of user IDs.

If you already know the destination chat ID, set `TELEGRAM_CHAT_ID` and run
`npm run bot -- --send`. The user must have opened the private chat first.

As of Bot API 10.4 (November 9, 2026), production widgets can only be sent in a
**private chat with the bot** and cannot be forwarded. To share in a community
chat, post the browser link above, or a link to a running delivery bot. Group
widgets and forwarding are currently test-server features. See
[Telegram availability](https://core.telegram.org/bots/widgets#availability).

## Checks

```sh
npm test
npx playwright install chromium --only-shell
npm run test:browser
```

Engine tests cover snapshot horizons, I/O budgets, report expiration, saved
state, and a survival strategy across 40 seeds. Browser checks exercise the
actual built widget, phone-size layout, help, saved-game restoration, restart,
both themes, and Telegram deactivation. Screenshots go to `test-results/`.
The browser preview is not the QuickJS/native-renderer sandbox. Actual Telegram
rendering still needs a compatible client and a bot token.

Sources are in `src/`. `npm run build` assembles them into the single HTML
payload. There are no external assets, fonts, libraries, or scripts in it.

