'use strict';
// Local static preview only; no app server, database, authentication or writes.
// Run: node scripts/quiet-workspace-preview.js [port]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2] || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const themes = pathname.startsWith('/themes/');
    const base = path.join(root, themes ? 'themes' : 'public');
    const relative = pathname === '/' ? 'quiet-workspace-demo.html' : pathname.slice(themes ? 8 : 1);
    const file = path.resolve(base, relative);
    const within = path.relative(base, file);
    if (within.startsWith('..') || path.isAbsolute(within)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, bytes) => {
      if (error) { res.writeHead(404).end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(bytes);
    });
  } catch { res.writeHead(400).end('Bad request'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Quiet Workspace preview: http://127.0.0.1:${port}/`));
