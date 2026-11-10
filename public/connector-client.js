export async function networkPermission(permissions = globalThis.navigator?.permissions) {
  if (!permissions) return 'prompt';
  for (const name of ['loopback-network', 'local-network-access']) {
    try { return (await permissions.query({ name })).state; }
    catch { /* Older browsers may not expose this permission. */ }
  }
  return 'prompt';
}

export function connectorRequest(action, extra, token, origin, local = false) {
  return {
    url: local ? origin + '/api' : 'http://127.0.0.1:43187/api',
    options: {
      method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error',
      targetAddressSpace: 'loopback',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...extra }),
      signal: AbortSignal.timeout(['apply', 'restore', 'save'].includes(action) ? 125_000 : 12_000),
      cache: 'no-store'
    }
  };
}
