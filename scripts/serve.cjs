/* SPDX-License-Identifier: MIT; Copyright (c) 2026 ArmPath Lite contributors */
// Local preview server. No dependencies, no directory listing, no external binding.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml' };
function createServer() {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    let relative;
    try { relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end('Bad request'); return; }
    // fs.readFile throws synchronously for NUL paths, outside its error callback.
    if (relative.includes('\0')) { res.writeHead(400); res.end('Bad request'); return; }
    if (relative.endsWith('/')) relative += 'index.html';
    const parts = relative.replaceAll('\\', '/').split('/');
    if (parts.some(p => p.startsWith('.') && p !== '.')) { res.writeHead(404); res.end('Not found'); return; }
    const filename = path.resolve(root, '.' + relative);
    if (!filename.startsWith(root + path.sep)) { res.writeHead(404); res.end('Not found'); return; }
    fs.readFile(filename, (error, bytes) => {
      if (error) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    });
  });
}
module.exports = { createServer };
if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535.');
  const server = createServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`ArmPath Lite local preview: http://127.0.0.1:${port}`));
}
