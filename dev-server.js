'use strict';
/*
 * Petit serveur de test local (facultatif).
 * En production, le dossier docs/ est publié tel quel sur GitHub Pages : aucun serveur n'est nécessaire.
 * Usage : node dev-server.js   puis ouvrir http://localhost:3000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, 'docs');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json'
};

function lanAddress() {
  const all = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) all.push(i.address);
  }
  return all.find(a => a.startsWith('192.168.')) || all.find(a => a.startsWith('10.')) || all[0] || 'localhost';
}

http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ lan: `http://${lanAddress()}:${PORT}` }));
  }
  const file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Introuvable'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ★ TALENT (test local) ★\n  Télé : http://localhost:${PORT}\n  Téléphones : ${'http://' + lanAddress() + ':' + PORT}/join.html\n`);
});
