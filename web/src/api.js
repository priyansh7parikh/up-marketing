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
  const r = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body && JSON.stringify(body),
  });
  const json = await r.json().catch(() => null);
  if (r.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('upm:logout'));
  if (!r.ok) throw new Error(json?.error || `Request failed (${r.status})`);
  return json;
}
