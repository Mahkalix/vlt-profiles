import test from 'node:test';
import assert from 'node:assert/strict';
import { networkPermission, connectorRequest } from '../public/connector-client.js';

test('loopback permissions preserve denied states and support older browsers', async () => {
  assert.equal(await networkPermission({ query: async () => ({state: 'denied'}) }), 'denied');
  const names = [];
  assert.equal(await networkPermission({query: async ({name}) => {
    names.push(name);
    if (name === 'loopback-network') throw new TypeError('Unsupported');
    return {state: 'granted'};
  }}), 'granted');
  assert.deepEqual(names, ['loopback-network', 'local-network-access']);
  assert.equal(await networkPermission({query: async () => {throw new TypeError('Unsupported');}}), 'prompt');
  assert.equal(await networkPermission(null), 'prompt');
});

test('hosted calls reach loopback only, with pairing and no redirect or cookie forwarding', () => {
  const {url, options} = connectorRequest('list', {}, 'test-pair', 'https://vlt.example');
  assert.equal(url, 'http://127.0.0.1:43187/api');
  assert.equal(options.targetAddressSpace, 'loopback');
  assert.equal(options.redirect, 'error');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.headers.Authorization, 'Bearer test-pair');
  assert.deepEqual(JSON.parse(options.body), {action: 'list'});
  assert.equal(connectorRequest('list', {}, 'test-pair', 'http://127.0.0.1:1234', true).url, 'http://127.0.0.1:1234/api');
});
