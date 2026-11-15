// All server calls. A 401 on any non-auth call means the session ended: tell the app to show login.
export async function api(method, path, body) {
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
