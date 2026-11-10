import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { minify } from 'terser';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const engine = (await read('src/engine.mjs')).replace(/^export /gm, '');
const ui = (await read('src/ui.mjs')).replace(/^import[\s\S]*?;\n/, '');
const { code } = await minify(engine + '\n' + ui, {
  toplevel: true, compress: { passes: 2 }, format: { comments: false },
});
const html = (await read('src/template.html')).replace('/*__GAME__*/', code).trim();
const raw = Buffer.byteLength(html), compressed = deflateSync(html, { level: 9 }).length;
if (raw > 32768 || compressed > 4096 || html.includes('\0')) {
  throw new Error(`Telegram limits exceeded: ${raw} raw, ${compressed} compressed bytes`);
}
await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/widget.html', root), html);
await writeFile(new URL('dist/index.html', root), await read('src/preview.html'));
console.log(`Widget: ${raw}/32768 bytes, zlib-9 ${compressed}/4096 bytes`);

