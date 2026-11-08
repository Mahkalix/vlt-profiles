import { SECURITY_HEADERS } from './security.mjs';
import { STATIC_ASSETS } from './static-assets.mjs';
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
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Operation timed out after 120 seconds. Check the account before retrying.')); }, 120_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', data => { output += data; if (output.length > 1_000_000) child.kill(); });
    // Do not log raw subprocess output: it can contain local account details.
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timeout); reject(new Error('PowerShell 7 not found. Install it and restart the connector.')); });
    child.on('close', () => {
      clearTimeout(timeout);
      try { const response = JSON.parse(output.replace(/^\uFEFF/, '').trim()); if (!response.ok) throw new Error(response.error); resolve(response.result); }
      catch (error) { reject(new Error(error instanceof SyntaxError ? 'The local connector returned an invalid response.' : error.message)); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(request));
  });
}
export function createBridge({ token = randomBytes(32).toString('hex'), origin = SITE, run = worker } = {}) {
  let busy = false;
  const server = http.createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 8192 }, async (req, res) => {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
    const send = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
    // Exact origin and loopback Host checks defend against CSRF and DNS rebinding.
    if (req.headers.host !== '127.0.0.1:'+req.socket.localPort) return send(403, { error: 'Host rejected.' });
    const localOrigin = 'http://' + req.headers.host;
    const requestUrl = new URL(req.url, localOrigin);
    if (req.method === 'GET' && requestUrl.pathname === '/launch') {
      if ((req.headers.origin && ![origin, localOrigin].includes(req.headers.origin)) || (req.headers['sec-fetch-dest'] && req.headers['sec-fetch-dest'] !== 'document')) return send(403, { error: 'Origin rejected.' });
      const destination = requestUrl.searchParams.get('web') === '1' ? origin+'/' : '/';
      const lang = requestUrl.searchParams.get('lang');
      const query = ['fr', 'en'].includes(lang) ? '?lang='+lang : '';
      res.writeHead(302, { Location: destination+query+'#pair='+token, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); return res.end();
    }
    const assets = STATIC_ASSETS;
    if (req.method === 'GET' && Object.hasOwn(assets, requestUrl.pathname)) {
      try {
        const [file, type] = assets[requestUrl.pathname];
        const body = await readFile(path.join(dir, 'web', file));
        res.writeHead(200, { 'Content-Type': type+'; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); return res.end(body);
      } catch { return send(404, { error: 'Local interface missing. Download the latest connector.' }); }
    }
    if (![origin, localOrigin].includes(req.headers.origin)) return send(403, { error: 'Origin rejected.' });
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const provided = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
    const expected = Buffer.from(token);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return send(401, { error: 'Pair this browser with the connector again.' });
    if (req.method !== 'POST' || req.url !== '/api') return send(404, { error: 'Unknown route.' });
    if (busy) return send(409, { error: 'Another operation is already running.' });
    busy = true;
    try {
      let body = '';
      for await (const part of req) { body += part; if (Buffer.byteLength(body) > 8192) { send(413, { error: 'Request too large.' }); return; } }
      let request;
      try { request = JSON.parse(body); } catch { return send(400, { error: 'Invalid request.' }); }
      if (!request || typeof request !== 'object' || Array.isArray(request)) return send(400, { error: 'Invalid request.' });
      if (Object.keys(request).some(key => !['action','id','account','name'].includes(key))) return send(400, { error: 'Invalid request.' });
      if (!['status', 'list', 'save', 'apply', 'restore', 'delete'].includes(request.action)) return send(400, { error: 'Unknown action.' });
      if (['save', 'apply', 'restore'].includes(request.action) && (typeof request.account !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(request.account))) return send(400, { error: 'Invalid account.' });
      if (['apply', 'restore', 'delete'].includes(request.action) && (typeof request.id !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(request.id))) return send(400, { error: 'Invalid profile.' });
      if (request.action === 'save' && (typeof request.name !== 'string' || !request.name.trim() || request.name.length > 60)) return send(400, { error: 'Invalid profile name.' });
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
