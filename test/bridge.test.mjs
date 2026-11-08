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
