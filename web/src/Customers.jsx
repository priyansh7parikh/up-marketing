import { useState } from 'react';
import { api } from './api.js';
import { BUSINESS, DueChip, Field, Status, fmtDay, go, rupees, telHref, useApp, useLoad, vesselText, waHref } from './ui.jsx';

function Balance({ s, names }) {
  const vessels = vesselText(s.held, names);
  return (
    <div className="flex flex-wrap gap-1.5">
      {vessels && <span className="chip chip-accent">{vessels}</span>}
      {s.owed > 0 && <span className="chip chip-bad">{rupees(s.owed)} pending</span>}
      {s.credit > 0 && <span className="chip chip-ok">{rupees(s.credit)} credit</span>}
      {!vessels && !s.owed && !s.credit && <span className="chip chip-ok">all clear</span>}
      <DueChip s={s} />
    </div>
  );
}

export function Customers({ pendingOnly = false }) {
  const { names } = useApp();
  const { data, ...status } = useLoad(() => api('GET', '/customers'));
  const [q, setQ] = useState('');
  const [onlyPending, setOnlyPending] = useState(pendingOnly);
  const needle = q.trim().toLowerCase();
  const list = [...(data || [])].sort((a, b) => (pendingOnly ? (a.oldestDate || '9').localeCompare(b.oldestDate || '9') : 0)).filter((c) => (!onlyPending || c.pending || c.owed > 0 || Object.keys(c.held).length)
    && (!needle || [c.name, c.nameGu, c.phone].some((v) => v?.toLowerCase().includes(needle))));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow mb-1">{pendingOnly ? 'Follow up' : 'Ledger'}</div>
          <h1 className="h1">{pendingOnly ? 'Pending' : 'Customers'}</h1>
          <p className="mt-1 text-muted">{pendingOnly ? 'Customers still holding vessels or owing money, oldest first.' : 'Everyone you have sold to, with what they hold and owe.'}</p>
        </div>
        <a href="#/orders/new" className="btn btn-primary">+ New order</a>
      </div>
      <div className="flex flex-wrap gap-3">
        <input className="input max-w-md flex-1" type="search" placeholder="Search name or phone" aria-label="Search customers" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="btn cursor-pointer">
          <input type="checkbox" className="accent-accent" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Pending only
        </label>
      </div>
      <Status {...status} />
      {data && !list.length && <p className="card text-muted">{data.length ? 'No customers match.' : 'No customers yet. They are added when you save an order.'}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => (
          <a key={c._id} href={`#/customers/${c._id}`} className="card block space-y-3 hover:border-accent">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">{c.name}</div>
                <div className="truncate text-xs text-muted">{[c.nameGu, c.phone].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <span className="chip">{c.category}</span>
            </div>
            <Balance s={c} names={names} />
          </a>
        ))}
      </div>
    </div>
  );
}

const EMPTY = { name: '', nameGu: '', phone: '', address: '', category: 'regular', notes: '' };

function CustomerForm({ customer, onSaved }) {
  const [form, setForm] = useState({ ...EMPTY, ...customer });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...form, phone: form.phone.replace(/[\s-]/g, '') || undefined };
      const saved = await api('PUT', `/customers/${customer._id}`, body);
      onSaved(saved);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="card max-w-2xl space-y-4">
      <h1 className="h1">Edit customer</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><input className="input" required value={form.name} onChange={set('name')} /></Field>
        <Field label="Name in Gujarati (optional)"><input className="input" lang="gu" value={form.nameGu || ''} onChange={set('nameGu')} /></Field>
        <Field label="Phone"><input className="input" type="tel" inputMode="tel" placeholder="10 digits" value={form.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Type">
          <select className="input" value={form.category} onChange={set('category')}>
            <option value="regular">Regular</option>
            <option value="party">Party order</option>
          </select>
        </Field>
        <Field label="Address" className="sm:col-span-2"><textarea className="input py-2" rows="2" value={form.address || ''} onChange={set('address')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><input className="input" value={form.notes || ''} onChange={set('notes')} /></Field>
      </div>
      {error && <p role="alert" className="text-bad">{error}</p>}
      <div className="flex gap-3">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn" onClick={() => onSaved(null)}>Cancel</button>
      </div>
    </form>
  );
}

const KIND = { order: 'Order', collection: 'Return / cash', settlement: 'Settled' };

export function CustomerDetail({ id }) {
  const { names, user } = useApp();
  const { data: c, reload, ...status } = useLoad(() => api('GET', `/customers/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  if (!c) return <Status {...status} />;
  if (editing) return <CustomerForm customer={c} onSaved={() => { setEditing(false); reload(); }} />;

  const vessels = vesselText(c.held, names);
  const reminder = `Hello ${c.name}, this is ${BUSINESS}. Pending: ${[vessels, c.owed > 0 && rupees(c.owed)].filter(Boolean).join(' and ') || 'nothing'}. Thank you.`;
  const remove = async () => {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try { await api('DELETE', `/customers/${id}`); go('/customers'); } catch (e) { setError(e.message); }
  };

  return (
    <div className="space-y-4">
      <a href="#/customers" className="text-sm font-medium text-muted hover:text-accent">← Customers</a>
      <div className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{c.name} {c.nameGu && <span className="font-normal text-muted">· {c.nameGu}</span>}</h1>
            <div className="text-sm text-muted">{[c.phone, c.address].filter(Boolean).join(' · ') || 'No phone or address'}</div>
            {c.notes && <div className="mt-1 text-sm text-muted">{c.notes}</div>}
          </div>
          <span className="chip">{c.category}</span>
        </div>
        <Balance s={c} names={names} />
        <div className="flex flex-wrap gap-2">
          {(vessels || c.owed > 0) && <a className="btn btn-primary" href={`#/returns/new?customer=${id}`}>Record return</a>}
          <a className={`btn ${vessels || c.owed > 0 ? '' : 'btn-primary'}`} href={`#/orders/new?customer=${id}`}>+ New order</a>
          {c.phone && <a className="btn" href={telHref(c.phone)}>Call</a>}
          {c.phone && <a className="btn" href={waHref(c.phone, reminder)} target="_blank" rel="noreferrer">WhatsApp</a>}
          <button className="btn" onClick={() => setEditing(true)}>Edit</button>
          {user.role === 'admin' && <button className="btn btn-danger" onClick={remove}>Delete</button>}
        </div>
        {error && <p role="alert" className="text-bad">{error}</p>}
        <div className="text-xs text-faint">
          added by {c.createdBy?.name || 'system'}{c.updatedBy && ` · edited by ${c.updatedBy.name}`}
        </div>
      </div>

      <h2 className="eyebrow pt-2">Ledger</h2>
      {!c.statement.length && <p className="card text-muted">No entries yet.</p>}
      <div className="space-y-2">
        <div className="hidden grid-cols-[5rem_8rem_1fr_6rem_6rem_7rem_9rem] gap-3 px-4 text-xs text-faint uppercase lg:grid">
          <span>Date</span><span>Entry</span><span>Vessels</span><span className="text-right">Billed</span><span className="text-right">Paid</span><span className="text-right">Balance</span><span>By</span>
        </div>
        {c.statement.map((r) => {
          const href = { order: `#/orders/${r.id}`, collection: `#/returns/${r.id}` }[r.kind];
          const Row = href ? 'a' : 'div';
          return (
            <Row key={r.id} href={href}
              className="card grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl py-3 hover:border-line-strong lg:grid-cols-[5rem_8rem_1fr_6rem_6rem_7rem_9rem] lg:items-center">
              <span>{fmtDay(r.date)}</span>
              <span className="text-right text-muted lg:text-left">{KIND[r.kind]}</span>
              <span className="col-span-2 lg:col-span-1">{vesselText(r.vessels, names, true) || '—'}{r.note && <span className="text-muted"> · {r.note}</span>}</span>
              <span className="lg:text-right">{r.billed ? <><span className="text-faint lg:hidden">billed </span>{rupees(r.billed)}</> : ''}</span>
              <span className="text-right text-ok">{r.paid ? <><span className="text-faint lg:hidden">paid </span>{rupees(r.paid)} {r.method}</> : ''}</span>
              <span className={`lg:text-right ${r.balance > 0 ? 'text-bad' : 'text-ok'}`}>
                <span className="text-faint lg:hidden">balance </span>{r.balance < 0 ? `${rupees(-r.balance)} cr` : rupees(r.balance)}
              </span>
              <span className="truncate text-right text-xs text-faint lg:text-left">{r.by?.name || 'system'}{r.editedBy && ` · ed. ${r.editedBy.name}`}</span>
            </Row>
          );
        })}
      </div>
    </div>
  );
}
