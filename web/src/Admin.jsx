import { useState } from 'react';
import { api } from './api.js';
import { Business, Items, Prices, Teams } from './Settings.jsx';
import { Field, SHORT, Status, fmtDay, today, useApp, useLoad } from './ui.jsx';

function Staff() {
  const { user: me } = useApp();
  const { data, reload, ...status } = useLoad(() => api('GET', '/users'));
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'employee' });
  const [resetting, setResetting] = useState(null); // { id, password }
  const [msg, setMsg] = useState(null);
  const run = async (fn, ok) => { setMsg(null); try { await fn(); if (ok) setMsg({ ok }); reload(); } catch (e) { setMsg({ error: e.message }); } };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const add = (e) => {
    e.preventDefault();
    run(async () => { await api('POST', '/users', form); setForm({ name: '', username: '', password: '', role: 'employee' }); }, `${form.name} can now sign in as "${form.username.toLowerCase()}".`);
  };

  return (
    <div className="space-y-4">
      <section className="card space-y-1 p-0">
        <h2 className="px-5 pt-5 font-display text-lg font-bold">Staff users</h2>
        <p className="px-5 pb-3 text-sm text-muted">Admins see and change everything. Employees add and edit orders, returns and pheras.</p>
        <Status {...status} />
        {(data || []).map((u) => (
          <div key={u._id} className="space-y-2 border-t border-line px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0">
                <span className={`block font-semibold ${u.active ? '' : 'text-faint line-through'}`}>{u.name}{u._id === me.id && ' (you)'}</span>
                <span className="block text-xs text-muted">signs in as {u.username}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <select className="input w-auto" aria-label={`Role for ${u.name}`} value={u.role} disabled={u._id === me.id}
                  onChange={(e) => run(() => api('PUT', `/users/${u._id}`, { role: e.target.value }), `${u.name} is now ${e.target.value === 'admin' ? 'an admin' : 'an employee'}.`)}>
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </select>
                <button type="button" className="btn" onClick={() => setResetting(resetting?.id === u._id ? null : { id: u._id, password: '' })}>Reset password</button>
                {u._id !== me.id && (
                  <button type="button" className={`btn ${u.active ? 'btn-danger' : ''}`}
                    onClick={() => run(() => api('PUT', `/users/${u._id}`, { active: !u.active }), u.active ? `${u.name} is switched off and signed out.` : `${u.name} can sign in again.`)}>
                    {u.active ? 'Switch off' : 'Switch on'}
                  </button>
                )}
              </span>
            </div>
            {resetting?.id === u._id && (
              <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('PUT', `/users/${u._id}`, { password: resetting.password }); setResetting(null); }, `New password set for ${u.name}. Tell them in person.`); }}>
                <Field label={`New password for ${u.name} (8 or more characters)`} className="min-w-0 flex-1">
                  <input className="input" type="text" autoComplete="off" required minLength={8} value={resetting.password} onChange={(e) => setResetting({ ...resetting, password: e.target.value })} />
                </Field>
                <button className="btn btn-primary">Set password</button>
              </form>
            )}
          </div>
        ))}
      </section>

      <form onSubmit={add} className="card grid gap-4 sm:grid-cols-2">
        <h2 className="font-display text-lg font-bold sm:col-span-2">Add a staff user</h2>
        <Field label="Full name"><input className="input" required value={form.name} onChange={set('name')} /></Field>
        <Field label="Sign-in name (no spaces)"><input className="input" required autoCapitalize="none" autoComplete="off" pattern="[A-Za-z0-9._\-]+" title="Letters, numbers, dot, dash or underscore" value={form.username} onChange={set('username')} /></Field>
        <Field label="Password (8 or more characters)"><input className="input" type="text" required minLength={8} autoComplete="off" value={form.password} onChange={set('password')} /></Field>
        <Field label="Role">
          <select className="input" value={form.role} onChange={set('role')}>
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <div className="sm:col-span-2"><button className="btn btn-primary">Add user</button></div>
      </form>
      {msg?.error && <p role="alert" className="text-bad">{msg.error}</p>}
      {msg?.ok && <p role="status" className="text-ok">{msg.ok}</p>}
    </div>
  );
}

// "qty.big_jar" → "given 20L J", "paidAmount" → "paid".
const FIELD = { qty: 'given', emptiesBack: 'empties back', returned: 'returned', filledOut: 'filled out', filledBack: 'filled back', lost: 'lost', prices: 'price', paidAmount: 'paid', deliveryCharge: 'delivery charge', dueDate: 'return by', partyPrice: 'party price', collectedBy: 'collected by', startTime: 'start time', endTime: 'end time', deliveryType: 'delivery', upiVpa: 'UPI ID', nameGu: 'Gujarati name', kind: 'order type' };
const field = (path) => path.split('.').map((part) => SHORT[part] || FIELD[part] || part).join(' ');
const show = (v) => (v === undefined || v === null || v === '' ? 'empty' : typeof v === 'object' ? JSON.stringify(v) : /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDay(v) : String(v));
const VERB = { create: 'added', update: 'changed', delete: 'deleted' };

function History() {
  const [staffOnly, setStaffOnly] = useState(false);
  const { data, reload, ...status } = useLoad(() => api('GET', `/audit${staffOnly ? '?role=employee' : ''}`), [staffOnly]);
  const [msg, setMsg] = useState(null);
  const [restoring, setRestoring] = useState(null); // one restore at a time; the button waits until it's done
  const restore = async (l) => {
    if (restoring || !window.confirm(`Put this ${l.what.toLowerCase()} back exactly as it was?`)) return;
    setMsg(null);
    setRestoring(l._id);
    try { await api('POST', `/audit/${l._id}/restore`); setMsg({ ok: `${l.what} restored.` }); reload(); } catch (e) { setMsg({ error: e.message }); } finally { setRestoring(null); }
  };
  const when = (at) => new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

  return (
    <section className="card space-y-1 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-display text-lg font-bold">Edit history</h2>
          <p className="text-sm text-muted">The latest 300 changes, newest first. Employee changes are marked. A deleted entry can be put back with Restore.</p>
        </div>
        <label className="btn cursor-pointer">
          <input type="checkbox" className="accent-accent" checked={staffOnly} onChange={(e) => setStaffOnly(e.target.checked)} /> Employee changes only
        </label>
      </div>
      <Status {...status} />
      {msg?.error && <p role="alert" className="px-5 text-bad">{msg.error}</p>}
      {msg?.ok && <p role="status" className="px-5 text-ok">{msg.ok}</p>}
      {data && !data.length && <p className="border-t border-line px-5 py-8 text-center text-muted">No changes recorded.</p>}
      {(data || []).map((l) => (
        <div key={l._id} className={`space-y-1 border-t border-line px-5 py-3 ${l.role === 'employee' ? 'border-l-4 border-l-warn bg-warn-soft/40' : ''}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span>
              <span className="font-semibold">{l.byName}</span>{' '}
              {l.role === 'employee' && <span className="chip chip-warn">employee</span>}{' '}
              {VERB[l.action]} <span className="font-semibold">{l.what.toLowerCase()}</span>{l.about && <> · {l.about.replace(/\d{4}-\d{2}-\d{2}/g, (d) => fmtDay(d))}</>}
            </span>
            <span className="text-xs text-muted">{when(l.at)}</span>
          </div>
          {l.changes && (
            <ul className="text-sm text-muted">
              {Object.entries(l.changes).map(([path, c]) => <li key={path}>{field(path)}: <span className="line-through">{show(c.from)}</span> → <span className="font-semibold text-fg">{show(c.to)}</span></li>)}
            </ul>
          )}
          {l.held && (
            <p className="text-sm text-muted">It had: {Object.entries(l.held).map(([path, v]) => `${field(path)} ${show(v)}`).join(', ') || 'nothing'}</p>
          )}
          {l.restorable && <button type="button" className="btn min-h-8 px-3 text-xs" disabled={Boolean(restoring)} onClick={() => restore(l)}>{restoring === l._id ? 'Restoring…' : 'Restore'}</button>}
        </div>
      ))}
    </section>
  );
}

// Downloads open in Excel or Google Sheets. Plain links: the browser sends the login cookie and saves the file.
const FILES = [['orders', 'Orders', 'every order with items, money and who entered it'], ['returns', 'Returns', 'items and money that came back'], ['payments', 'Payments', 'every rupee received, cash and UPI'], ['customers', 'Customers', 'what each one holds and owes today (dates don\'t apply)']];
function Export() {
  const [from, setFrom] = useState(`${today().slice(0, 8)}01`); // this month so far
  const [to, setTo] = useState(today());
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold">Export</h2>
        <p className="text-sm text-muted">CSV files for Excel or Google Sheets: keep a copy, or share with your accountant. Cancelled entries are marked; payments leave them out.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From"><input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <ul className="divide-y divide-line">
        {FILES.map(([what, label, sub]) => (
          <li key={what} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span><span className="font-semibold">{label}</span> <span className="block text-sm text-muted">{sub}</span></span>
            {what === 'customers' ? <a className="btn" href="/api/export/customers" download>Download customers</a>
              : from && to ? <a className="btn" href={`/api/export/${what}?from=${from}&to=${to}`} download>Download {label.toLowerCase()}</a>
                : <span className="btn cursor-not-allowed opacity-50" aria-disabled="true" title="Pick both dates first">Download {label.toLowerCase()}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

const TABS = [['prices', 'Prices'], ['items', 'Items on sale'], ['business', 'UPI & customer page'], ['teams', 'Teams'], ['staff', 'Staff'], ['history', 'Edit history'], ['export', 'Export']];

export default function Admin() {
  const { user } = useApp();
  const [tab, setTab] = useState('prices');
  if (user.role !== 'admin') return <p className="card text-muted">Admins only.</p>;
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="h1">Admin</h1>
      <div role="tablist" aria-label="Admin sections" className="flex flex-wrap gap-2">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`btn ${tab === id ? 'btn-primary' : ''}`}>{label}</button>
        ))}
      </div>
      {tab === 'prices' && <Prices />}
      {tab === 'items' && <Items />}
      {tab === 'business' && <Business />}
      {tab === 'teams' && <Teams />}
      {tab === 'staff' && <Staff />}
      {tab === 'history' && <History />}
      {tab === 'export' && <Export />}
    </div>
  );
}

// Anyone signed in can change their own password.
export function Password() {
  const [form, setForm] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    try { await api('POST', '/auth/password', form); setForm({ current: '', next: '' }); setMsg({ ok: 'Password changed.' }); } catch (err) { setMsg({ error: err.message }); }
  };
  return (
    <form onSubmit={submit} className="card max-w-md space-y-4">
      <h1 className="h1">Change password</h1>
      <Field label="Current password"><input className="input" type="password" required autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} /></Field>
      <Field label="New password (8 or more characters)"><input className="input" type="password" required minLength={8} autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} /></Field>
      {msg?.error && <p role="alert" className="text-bad">{msg.error}</p>}
      {msg?.ok && <p role="status" className="text-ok">{msg.ok}</p>}
      <button className="btn btn-primary">Change password</button>
    </form>
  );
}
