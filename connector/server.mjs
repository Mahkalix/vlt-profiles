import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

export const SITE = 'https://vlt-profiles-mahkalix.vercel.app';
const dir = path.dirname(fileURLToPath(import.meta.url));
export function worker(request) {
  return new Promise((resolve, reject) => {
    const child = spawn('pwsh.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'worker.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Operation interrompue apres 120 secondes. Verifie le compte avant de reessayer.')); }, 120_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', data => { output += data; if (output.length > 1_000_000) child.kill(); });
    // Do not log raw subprocess output: it can contain local account details.
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timeout); reject(new Error('PowerShell 7 introuvable. Installe-le, puis relance le connecteur.')); });
    child.on('close', () => {
      clearTimeout(timeout);
      try { const response = JSON.parse(output.replace(/^\uFEFF/, '').trim()); if (!response.ok) throw new Error(response.error); resolve(response.result); }
      catch (error) { reject(new Error(error instanceof SyntaxError ? 'Le connecteur local a renvoye une reponse invalide.' : error.message)); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(request));
  });
}
export function createBridge({ token = randomBytes(32).toString('hex'), origin = SITE, run = worker } = {}) {
  let busy = false;
  const server = http.createServer(async (req, res) => {
    const send = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
    // Exact origin and loopback Host checks defend against CSRF and DNS rebinding.
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) return send(403, { error: 'Hote refuse.' });
    const localOrigin = 'http://' + req.headers.host;
    if (req.method === 'GET' && ['/launch','/launch?web=1'].includes(req.url)) {
      const destination = req.url === '/launch?web=1' ? origin+'/' : '/';
      res.writeHead(302, { Location: destination+'#pair='+token, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); return res.end();
    }
    const assets = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/style.css': ['style.css','text/css'], '/icon.svg': ['icon.svg','image/svg+xml'] };
    if (req.method === 'GET' && Object.hasOwn(assets, req.url)) {
      try {
        const [file, type] = assets[req.url];
        const body = await readFile(path.join(dir, 'web', file));
        res.writeHead(200, { 'Content-Type': type+'; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); return res.end(body);
      } catch { return send(404, { error: 'Interface locale manquante. Telecharge la derniere version du connecteur.' }); }
    }
    if (![origin, localOrigin].includes(req.headers.origin)) return send(403, { error: 'Origine refusee.' });
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const provided = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
    const expected = Buffer.from(token);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return send(401, { error: 'Relance le connecteur pour associer cet onglet.' });
    if (req.method !== 'POST' || req.url !== '/api') return send(404, { error: 'Route inconnue.' });
    if (busy) return send(409, { error: 'Une operation est deja en cours.' });
    busy = true;
    try {
      let body = '';
      for await (const part of req) { body += part; if (body.length > 8192) { send(413, { error: 'Requete trop volumineuse.' }); return; } }
      let request;
      try { request = JSON.parse(body); } catch { return send(400, { error: 'Requete invalide.' }); }
      if (!['status', 'list', 'save', 'apply', 'restore'].includes(request.action)) return send(400, { error: 'Action inconnue.' });
      if (['save', 'apply', 'restore'].includes(request.action) && !/^[a-f0-9-]{36}$/i.test(request.account || '')) return send(400, { error: 'Compte invalide.' });
      if (['apply', 'restore'].includes(request.action) && !/^[A-Za-z0-9-]{1,100}$/.test(request.id || '')) return send(400, { error: 'Profil invalide.' });
      if (request.action === 'save' && (typeof request.name !== 'string' || !request.name.trim() || request.name.length > 60)) return send(400, { error: 'Nom de profil invalide.' });
      send(200, { ok: true, result: await run(request) });
    } catch (error) { send(400, { error: error.message }); }
    finally { busy = false; }
  });
  return { server, token };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bridge = createBridge();
  bridge.server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
      console.log('Ouverture du connecteur deja actif.');
      spawn('explorer.exe', ['http://127.0.0.1:43187/launch'], { windowsHide: true, stdio: 'ignore' }).on('error', () => console.error('Ouvre http://127.0.0.1:43187/launch dans ton navigateur.'));
    } else { console.error('Impossible de demarrer le connecteur sur le port 43187.'); process.exitCode = 1; }
  });
  bridge.server.listen(43187, '127.0.0.1', () => {
    const url = `http://127.0.0.1:43187/#pair=${bridge.token}`;
    console.log('VLT PROFILES | Connecteur actif. Garde cette fenetre ouverte.');
    console.log('Les profils sont stockes dans %LOCALAPPDATA%\\VLTProfiles.');
    spawn('explorer.exe', [url], { windowsHide: true, stdio: 'ignore' }).on('error', () => console.error('Impossible d ouvrir le navigateur. Relance le connecteur.'));
  });
}
