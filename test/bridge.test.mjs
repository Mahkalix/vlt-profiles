import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createBridge, SITE } from '../connector/server.mjs';
async function fixture(t, run = async request => ({ action: request.action })) {
  const bridge = createBridge({ token: 'a'.repeat(64), run });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  t.after(() => { bridge.server.closeAllConnections(); bridge.server.close(); });
  const url = `http://127.0.0.1:${bridge.server.address().port}/api`;
  const request = (body, headers = {}, method = 'POST') => fetch(url, { method, headers: { Origin: SITE, Authorization: `Bearer ${bridge.token}`, 'Content-Type': 'application/json', ...headers }, body: method === 'POST' ? JSON.stringify(body) : undefined });
  return { request, url };
}
test('bridge authenticates paired requests and exact origins', async t => {
  let calls = 0;
  const { request, url } = await fixture(t, async () => { calls++; return { profiles: [] }; });
  assert.equal((await request({ action: 'list' }, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await request({ action: 'list' }, { Authorization: 'Bearer wrong' })).status, 401);
  const status = await new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { Host: 'attacker.example', Origin: SITE } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end('{}');
  });
  assert.equal(status, 403);
  assert.equal(calls, 0);
  const response = await request({ action: 'list' });
  assert.equal(response.status, 200); assert.equal(calls, 1);
  assert.equal(response.headers.get('access-control-allow-origin'), SITE);
  assert.deepEqual((await response.json()).result.profiles, []);
});
test('preflight supports local network access without invoking Riot', async t => {
  const { request } = await fixture(t, () => { throw new Error('Unexpected worker invocation'); });
  const response = await request(null, { Authorization: '' }, 'OPTIONS');
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-private-network'), 'true');
});
test('invalid routes, names, account ids, and paths never reach the worker', async t => {
  const { request } = await fixture(t, () => { throw new Error('Unexpected worker invocation'); });
  for (const body of [{ action: 'unknown' }, { action: 'apply', id: '../secret', account: '0'.repeat(36) }, { action: 'save', name: '', account: '0'.repeat(36) }, { action: 'apply', id: 'valid', account: 'invalid' }]) assert.equal((await request(body)).status, 400);
});
test('concurrent operations are serialized', async t => {
  let release; let started;
  const ready = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const { request } = await fixture(t, async () => { started(); await pending; return {}; });
  const first = request({ action: 'list' }); await ready;
  assert.equal((await request({ action: 'list' })).status, 409);
  release(); assert.equal((await first).status, 200);
});
test('local interface works without cross-origin permission and exposes no private files', async t => {
  const { request, url } = await fixture(t);
  const localOrigin = new URL(url).origin;
  assert.equal((await request({ action: 'list' }, { Origin: localOrigin })).status, 200);
  const page = await fetch(localOrigin + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /VLT/);
  assert.equal((await fetch(localOrigin + '/worker.ps1')).status, 403);
  for (const route of ['/docs', '/docs/', '/docs.html', '/docs?lang=fr']) {
    const docs = await fetch(localOrigin + route);
    assert.equal(docs.status, 200);
    const html = await docs.text();
    assert.match(html, /<html lang="en">/);
    assert.match(html, /Documentation sections/);
    assert.doesNotMatch(html, /src="\/app.js"/);
  }
});

test('language survives pairing and static pages without allowing arbitrary redirects', async t => {
  const { url } = await fixture(t);
  const base = new URL(url).origin;
  assert.equal((await fetch(base+'/?lang=fr')).status, 200);
  for (const asset of ['i18n.js', 'translations.js']) assert.equal((await fetch(base+'/'+asset)).status, 200);
  const paired = await fetch(base+'/launch?web=1&lang=fr&redirect=https://attacker.example', {redirect:'manual'});
  assert.equal(paired.status, 302);
  assert.equal(paired.headers.get('location'), SITE+'/?lang=fr#pair='+'a'.repeat(64));
  const defaultLaunch = await fetch(base+'/launch', {redirect:'manual'});
  assert.equal(defaultLaunch.headers.get('location'), SITE+'/#pair='+'a'.repeat(64));
  const local = await fetch(base+'/launch?local=1&lang=en', {redirect:'manual'});
  assert.equal(local.headers.get('location'), '/?lang=en#pair='+'a'.repeat(64));
});

test('bridge blocks hostile pairing, malformed API input and script framing', async t => {
 let calls=0;const {request,url}=await fixture(t,async()=>{calls++;return {};});const base=new URL(url).origin;
 for(const headers of [{Origin:'https://attacker.example'},{'Sec-Fetch-Dest':'iframe'}]) assert.equal((await fetch(base+'/launch',{headers,redirect:'manual'})).status,403);
 for(const body of [null,[],{action:'delete',id:['valid']},{action:'list',unexpected:true},{action:'save',name:'a',account:'-'.repeat(36)}])assert.equal((await request(body)).status,400);
 assert.equal((await request({action:'save',name:'x'.repeat(9000),account:'00000000-0000-0000-0000-000000000001'})).status,413);
 assert.equal(calls,0);
 const page=await fetch(base+'/');assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);assert.equal(page.headers.get('referrer-policy'),'no-referrer');assert.equal(page.headers.get('x-content-type-options'),'nosniff');
 for(const route of ['/sw.js','/manifest.webmanifest','/assets/icons/icon-192.png'])assert.equal((await fetch(base+route)).status,200);
 for(const route of ['/worker.ps1','/security.mjs','/Profils-Cloud/test.json','/.env','/comptes.json'])assert.equal((await fetch(base+route)).status,403);
});
