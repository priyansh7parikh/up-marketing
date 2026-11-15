import { useEffect, useState } from 'react';
import { api } from './api.js';
import { UpiScreen } from './Orders.jsx';
import { Avatar, DueChip, Field, Icon, PRODUCTS, PageHead, SearchBox, Status, Stepper, addDays, fmtDay, go, rupees, today, useApp, useLoad, vesselText } from './ui.jsx';

const zero = () => Object.fromEntries(PRODUCTS.map((p) => [p, 0]));
const total = (list, pick) => list.reduce((n, c) => n + Math.round((pick(c) || 0) * 100), 0) / 100;

export function Returns() {
  const { names } = useApp();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [q, setQ] = useState('');
  const { data, ...status } = useLoad(() => api('GET', `/collections?from=${from}&to=${to}`), [from, to]);
  const needle = q.trim().toLowerCase();
  const shown = (data || []).filter((c) => !needle || [c.customer?.name, c.customer?.nameGu, c.customer?.phone, c.collectedBy?.name].some((v) => v?.toLowerCase().includes(needle)));
  const back = Object.fromEntries(PRODUCTS.map((p) => [p, shown.reduce((n, c) => n + (c.returned?.[p] || 0), 0)]));
  const range = from === to ? (from === today() ? 'today' : `on ${fmtDay(from)}`) : `${fmtDay(from)} to ${fmtDay(to)}`;

  const Cell = ({ label, value, tone = '' }) => (
    <div className="min-w-0 bg-surface p-4">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className={`font-display text-xl font-semibold ${tone}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Collection register" title="Returns" sub="Vessels that came back and money collected after delivery."
        action={<a href="#/returns/new" className="btn btn-primary"><Icon name="plus" className="h-4 w-4" /> Record return</a>} />
      <div className="card overflow-hidden p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 p-5">
          <div>
            <h2 className="font-display text-lg">Returned {range}</h2>
            <p className="text-sm text-muted">{data ? `${shown.length} entr${shown.length === 1 ? 'y' : 'ies'}` : ' '}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <SearchBox value={q} onChange={setQ} placeholder="Search customer or staff" />
            <Field label="From"><input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><input className="input" type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
        </div>
        {data && (
          <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
            {PRODUCTS.map((p) => <Cell key={p} label={`${names[p]} back`} value={back[p]} />)}
            <Cell label="Cash collected" value={rupees(total(shown, (c) => (c.method === 'cash' ? c.amount : 0)))} tone="text-ok" />
            <Cell label="UPI collected" value={rupees(total(shown, (c) => (c.method === 'upi' ? c.amount : 0)))} tone="text-ok" />
          </div>
        )}
        {!data && <div className="p-5"><Status {...status} /></div>}
        {data && !shown.length && <p className="border-t border-line px-5 py-8 text-center text-muted">Nothing recorded {range}.</p>}
        {shown.map((c) => (
          <a key={c._id} href={`#/returns/${c._id}`} className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line px-5 py-4 hover:bg-bg/60 lg:grid-cols-[1.4fr_1.4fr_8rem_10rem] lg:items-center">
            <span className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
              <Avatar name={c.customer?.name} />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{c.customer?.name || 'Unknown'}</span>
                <span className="block truncate text-xs text-muted">{c.customer?.phone || 'no phone'} · {fmtDay(c.date)}</span>
              </span>
            </span>
            <span className="col-span-2 font-medium lg:col-span-1">{vesselText(c.returned, names) || 'No vessels'}</span>
            <span>{c.amount > 0 ? <span className="chip chip-ok">{rupees(c.amount)} · {c.method}</span> : <span className="chip">no money</span>}</span>
            <span className="text-right text-xs text-muted lg:text-left">collected by {c.collectedBy?.name || '—'}{c.updatedBy && ` · edited by ${c.updatedBy.name}`}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export function ReturnForm({ id, presetCustomer }) {
  const app = useApp();
  const customers = useLoad(() => api('GET', '/customers'));
  const staff = useLoad(() => api('GET', '/staff'));
  const existing = useLoad(() => (id ? api('GET', `/collections/${id}`) : Promise.resolve(null)), [id]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [upi, setUpi] = useState(null);

  const held = (cid) => ({ ...zero(), ...customers.data?.find((c) => c._id === cid)?.held });

  useEffect(() => {
    if (existing.loading || !customers.data || form) return;
    const c = existing.data;
    setForm(c ? {
      date: c.date, customer: c.customer?._id || '', returned: { ...zero(), ...c.returned },
      pay: c.amount > 0 ? c.method : 'none', amount: c.amount || '', collectedBy: c.collectedBy?._id || app.user.id,
    } : {
      // The usual case is "everything came back", so start from what they hold.
      date: today(), customer: presetCustomer || '', returned: held(presetCustomer), pay: 'none', amount: '', collectedBy: app.user.id,
    });
  }, [existing.loading, existing.data, customers.data, form, presetCustomer]); // eslint-disable-line react-hooks/exhaustive-deps

  if (existing.error || customers.error) return <Status error={existing.error || customers.error} />;
  if (!form || !customers.data) return <Status loading />;

  const who = customers.data.find((c) => c._id === form.customer);
  const wasPaid = existing.data?.amount || 0;
  const amount = form.amount === '' ? (who?.owed || 0) : Number(form.amount);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const pickCustomer = (e) => setForm({ ...form, customer: e.target.value, ...(!id && { returned: held(e.target.value) }) });
  // People with something pending first: they are who you are most likely recording a return for.
  const options = [...customers.data].sort((a, b) => Number(b.pending || b.owed > 0) - Number(a.pending || a.owed > 0) || a.name.localeCompare(b.name));

  const submit = async (e) => {
    e.preventDefault();
    const paying = form.pay !== 'none' && amount > 0;
    if (!PRODUCTS.some((p) => form.returned[p]) && !paying) return setError('Enter vessels returned or money received.');
    setBusy(true);
    setError('');
    try {
      const showQr = form.pay === 'upi' && !wasPaid && amount > 0; // ask for the money first, mark received after
      const body = {
        date: form.date, customer: form.customer, returned: form.returned, collectedBy: form.collectedBy,
        method: form.pay === 'upi' ? 'upi' : 'cash', amount: paying && !showQr ? amount : 0,
      };
      if (showQr && !PRODUCTS.some((p) => form.returned[p])) {
        // Money only, by UPI: nothing to save until it is received.
        setUpi({ order: { customer: who, date: form.date }, amount, body });
        return;
      }
      const saved = id ? await api('PUT', `/collections/${id}`, body) : await api('POST', '/collections', body);
      if (showQr) setUpi({ order: { ...saved, customer: who }, amount });
      else go(`/customers/${form.customer}`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm('Delete this entry?')) return;
    try { await api('DELETE', `/collections/${id}`); go('/returns'); } catch (e) { setError(e.message); }
  };

  if (upi) {
    const done = () => go(`/customers/${upi.order.customer._id}`);
    const received = async () => {
      if (upi.order._id) await api('PUT', `/collections/${upi.order._id}`, { amount: upi.amount, method: 'upi' });
      else await api('POST', '/collections', { ...upi.body, amount: upi.amount });
      done();
    };
    return <UpiScreen {...upi} onLater={done} onReceived={received} />;
  }

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-4">
      <PageHead eyebrow="Collection" title={id ? 'Edit return' : 'Record a return'} sub="Vessels that came back and any money collected." />
      {existing.data && (
        <div className="text-xs text-faint">
          added by {existing.data.createdBy?.name || 'system'}{existing.data.updatedBy && ` · edited by ${existing.data.updatedBy.name}`}
        </div>
      )}

      <div className="card grid gap-4 sm:grid-cols-2">
        <Field label="Customer" className="sm:col-span-2">
          <select className="input" required value={form.customer} onChange={pickCustomer}>
            <option value="">Choose…</option>
            {options.map((c) => <option key={c._id} value={c._id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}{vesselText(c.held, app.names) ? ` · holding ${vesselText(c.held, app.names)}` : ''}{c.owed > 0 ? ` · owes ${rupees(c.owed)}` : ''}</option>)}
          </select>
        </Field>
        {who && (
          <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2" aria-live="polite">
            {vesselText(who.held, app.names) ? <span className="chip chip-accent">holding {vesselText(who.held, app.names)}</span> : <span className="chip chip-ok">holding nothing</span>}
            {who.owed > 0 && <span className="chip chip-bad">{rupees(who.owed)} pending</span>}
            {who.credit > 0 && <span className="chip chip-ok">{rupees(who.credit)} credit</span>}
            <DueChip s={who} />
          </div>
        )}
        <Field label="Date"><input className="input" type="date" required max={today()} min={addDays(today(), -365)} value={form.date} onChange={set('date')} /></Field>
        <Field label="Collected by">
          <select className="input" required value={form.collectedBy} onChange={set('collectedBy')}>
            {(staff.data || [{ _id: app.user.id, name: app.user.name }]).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
          </select>
        </Field>
      </div>

      <fieldset className="card space-y-2">
        <legend className="label px-1">Vessels returned</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PRODUCTS.map((p) => <Stepper key={p} label={app.names[p]} value={form.returned[p]} onChange={(n) => setForm({ ...form, returned: { ...form.returned, [p]: n } })} />)}
        </div>
      </fieldset>

      <div className="card space-y-4">
        <span className="label mb-0">Money received</span>
        <div role="radiogroup" aria-label="Money received" className="grid grid-cols-3 gap-2">
          {[['none', 'None'], ['cash', 'Cash'], ['upi', 'UPI']].map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={form.pay === v} className={`btn ${form.pay === v ? 'btn-primary' : ''}`} onClick={() => setForm({ ...form, pay: v })}>{label}</button>
          ))}
        </div>
        {form.pay !== 'none' && (
          <Field label="Amount (₹)">
            <input className="input" inputMode="decimal" value={form.amount} placeholder={String(who?.owed || 0)} onChange={set('amount')} />
          </Field>
        )}
        {form.pay === 'upi' && !wasPaid && amount > 0 && <p className="text-xs text-muted">After saving, the UPI QR for {rupees(amount)} will show.</p>}
      </div>

      {error && <p role="alert" className="text-bad">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save return'}</button>
        <button type="button" className="btn" onClick={() => window.history.back()}>Cancel</button>
        {id && app.user.role === 'admin' && <button type="button" className="btn btn-danger ml-auto" onClick={remove}>Delete</button>}
      </div>
    </form>
  );
}
