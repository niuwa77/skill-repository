import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// A static loopback server only. It never reads a skill repository or writes user files.
const PORT = 4317;
const assets = new Map([
  ['/', ['index.html','text/html; charset=utf-8']],
  ['/index.html', ['index.html','text/html; charset=utf-8']],
  ['/app.mjs', ['app.mjs','text/javascript; charset=utf-8']],
  ['/core.mjs', ['core.mjs','text/javascript; charset=utf-8']],
  ['/store.mjs', ['store.mjs','text/javascript; charset=utf-8']],
  ['/style.css', ['style.css','text/css; charset=utf-8']],
  ['/mark.svg', ['mark.svg','image/svg+xml']],
]);
const server = http.createServer(async (req,res) => {
  if (req.headers.host !== `127.0.0.1:${PORT}` && req.headers.host !== `localhost:${PORT}`) {
    res.writeHead(403); res.end('Forbidden host'); return;
  }
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'");
  if (req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405,{Allow:'GET, HEAD'}); res.end(); return;}
  const pathname = new URL(req.url,'http://127.0.0.1').pathname;
  if (pathname === '/__skillvault_health') {res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({app:'skill-vault-local',version:'1.1.0'})); return;}
  const asset = assets.get(pathname);
  if (!asset) {res.writeHead(404); res.end('Not found'); return;}
  try {
    const body = await readFile(new URL(`./dist/${asset[0]}`,import.meta.url));
    res.writeHead(200,{'Content-Type':asset[1],'Content-Length':body.byteLength});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {res.writeHead(500); res.end('Unable to read application file');}
});
server.on('error',error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Reuse the existing Skill Vault or close the application using this port.` : error.message);
  process.exitCode = 1;
});
server.listen(PORT,'127.0.0.1',() => console.log(`Skill Vault: http://127.0.0.1:${PORT}/\nServing ${fileURLToPath(new URL('./dist',import.meta.url))}\nLocal only. Press Ctrl+C to stop.`));
process.on('SIGINT',() => server.close(() => process.exit(0)));
process.on('SIGTERM',() => server.close(() => process.exit(0)));
