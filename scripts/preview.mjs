import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const server = createServer(async (req, res) => {
  const path = req.url?.split('?')[0];
  if (!['/', '/index.html', '/widget.html'].includes(path)) {
    res.writeHead(404).end('Not found'); return;
  }
  try {
    const name = path === '/' ? 'index.html' : path.slice(1);
    const data = await readFile(new URL('../dist/' + name, import.meta.url));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(data);
  } catch { res.writeHead(500).end('Run npm run build first.'); }
});
server.listen(Number(process.env.PORT || 4174), '127.0.0.1', () => {
  console.log(`Preview: http://127.0.0.1:${server.address().port}`);
});

