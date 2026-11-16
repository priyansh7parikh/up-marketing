// All server calls. A 401 on any non-auth call means the session ended: tell the app to show login.
// The same GET asked twice at once (the menu badges and the page both want /customers) shares one request.
const inFlight = new Map();
export function api(method, path, body) {
  if (method !== 'GET') return send(method, path, body);
  if (!inFlight.has(path)) inFlight.set(path, send(method, path).finally(() => inFlight.delete(path)));
  return inFlight.get(path);
}

async function send(method, path, body) {
  if (method === 'POST' && body === undefined) body = {}; // server only accepts JSON POSTs (CSRF guard)
  // A request that never answers (bad signal, server restarting) fails after 60s instead of leaving "Loading…" up.
  // 60s, not less: the free server can take ~50s to wake. Saves are safe to retry (they carry a once-only key).
  const r = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  }).catch((e) => {
    throw new Error(e.name === 'TimeoutError' ? 'The server did not answer. Check the internet and try again.' : 'Could not reach the server. Check the internet and try again.');
  });
  const json = await r.json().catch(() => null);
  if (r.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('upm:logout'));
  if (!r.ok) throw new Error(json?.error || `Request failed (${r.status})`);
  return json;
}
