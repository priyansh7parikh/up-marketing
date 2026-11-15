import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from './api.js';
import { CustomerPicker } from './CustomerPicker.jsx';
import { Avatar, BUSINESS, DueChip, Field, Icon, PageHead, PRODUCTS, SearchBox, isMobile, normalizePhone, Status, Stepper, addDays, fmtDay, go, rupees, today, upiHref, useApp, useLoad, vesselText, waHref } from './ui.jsx';

// The customer's state right now (returns are counted per customer, oldest first, not per order).
function StatusPill({ s }) {
  const dot = (cls, text) => <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${cls}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{text}</span>;
  if (s?.overdue) return dot('text-bad', `Overdue ${s.daysLate}d`);
  if (s?.due === today()) return dot('text-warn', 'Due today');
  if (s && Object.keys(s.held || {}).length) return dot('text-accent', 'Out');
  if (s?.owed > 0) return dot('text-bad', 'Money pending');
  return dot('text-ok', 'Clear');
}

const COLS = 'lg:grid-cols-[1.4fr_1.2fr_8rem_8rem_9rem]';

// Orders as a register: a table on laptop, stacked rows on phone. `summaries` maps customer id → balance summary.
export function OrderTable({ orders, summaries, empty = 'No orders yet.' }) {
  const { names } = useApp();
  if (!orders.length) return <p className="px-5 py-8 text-center text-muted">{empty}</p>;
  return (
    <div>
      <div className={`hidden gap-4 border-y border-line bg-bg/60 px-5 py-3 text-xs font-semibold tracking-wider text-muted uppercase lg:grid ${COLS}`}>
        <span>Customer</span><span>Order</span><span>Payment</span><span>Return due</span><span>Customer now</span>
      </div>
      {orders.map((o) => {
        const due = o.total - o.paidAmount;
        return (
          <a key={o._id} href={`#/orders/${o._id}`} className={`grid grid-cols-2 gap-x-4 gap-y-2 border-b border-line px-5 py-4 last:border-b-0 hover:bg-bg/60 lg:items-center ${COLS}`}>
            <span className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
              <Avatar name={o.customer?.name} />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{o.customer?.name || 'Unknown'}</span>
                <span className="block truncate text-xs text-muted">{o.customer?.phone || 'no phone'} · by {o.createdBy?.name || 'system'}{o.updatedBy && `, edited by ${o.updatedBy.name}`}</span>
              </span>
            </span>
            <span className="col-span-2 lg:col-span-1">
              <span className="block font-medium">{vesselText(o.qty, names) || 'No items'} · {rupees(o.total)}</span>
              <span className="block text-xs text-muted">{o.kind === 'party' ? 'Party order · ' : ''}Ordered {fmtDay(o.date)}{vesselText(o.emptiesBack, names) && ` · empties back: ${vesselText(o.emptiesBack, names)}`}</span>
            </span>
            <span>{due > 0 ? <span className="chip chip-bad">{rupees(due)} due</span> : o.total > 0 ? <span className="chip chip-ok">Paid · {o.method}</span> : <span className="chip">₹0 · no price</span>}</span>
            <span className="text-right text-sm lg:text-left">{fmtDay(o.dueDate || addDays(o.date, 1))}</span>
            <span className="col-span-2 lg:col-span-1"><StatusPill s={summaries?.[o.customer?._id]} /></span>
          </a>
        );
      })}
    </div>
  );
}

export const matchOrder = (q) => {
  const n = q.trim().toLowerCase();
  return (o) => !n || [o.customer?.name, o.customer?.nameGu, o.customer?.phone].some((v) => v?.toLowerCase().includes(n));
};

// Totals for a set of orders: everything sold in the period, whether or not it has since been returned or paid.
function SalesSummary({ orders }) {
  const { names } = useApp();
  const sum = (pick) => Object.fromEntries(PRODUCTS.map((p) => [p, orders.reduce((n, o) => n + (pick(o)?.[p] || 0), 0)]));
  const money = (pick) => orders.reduce((n, o) => n + Math.round(pick(o) * 100), 0) / 100;
  const billed = money((o) => o.total);
  const cash = money((o) => (o.method === 'cash' ? o.paidAmount : 0));
  const upi = money((o) => (o.method === 'upi' ? o.paidAmount : 0));
  const unpaid = money((o) => Math.max(0, o.total - o.paidAmount));
  const Cell = ({ label, value, hint, tone = '' }) => (
    <div className="min-w-0 bg-surface p-4">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className={`font-display text-xl font-semibold ${tone}`}>{value}</div>
      {hint && <div className="text-xs text-faint">{hint}</div>}
    </div>
  );
  // Native <details>: keyboard and screen-reader friendly; the choice is remembered on this device.
  const remember = (e) => { try { localStorage.setItem('upm.salesSummary', e.currentTarget.open ? 'open' : 'closed'); } catch { /* private mode */ } };
  let startOpen = true;
  try { startOpen = localStorage.getItem('upm.salesSummary') !== 'closed'; } catch { /* private mode */ }
  return (
    <details className="group border-t border-line" open={startOpen} onToggle={remember}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-2 text-sm font-semibold hover:bg-bg/60 [&::-webkit-details-marker]:hidden">
        <span>Sales summary <span className="font-normal text-muted">· {rupees(billed)} billed, {rupees(cash + upi)} received</span></span>
        <span className="flex items-center gap-1 text-xs text-muted"><span className="group-open:hidden">Show</span><span className="hidden group-open:inline">Hide</span><Icon name="chevron" className="h-4 w-4 rotate-90 transition-transform group-open:-rotate-90" /></span>
      </summary>
      <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
        {PRODUCTS.map((p) => <Cell key={p} label={`${names[p]} sold`} value={sum((o) => o.qty)[p]} hint={`${sum((o) => o.emptiesBack)[p]} empties back at delivery`} />)}
      </div>
      <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
        <Cell label="Billed" value={rupees(billed)} hint={`${orders.length} order${orders.length === 1 ? '' : 's'}`} />
        <Cell label="Received in cash" value={rupees(cash)} tone="text-ok" />
        <Cell label="Received by UPI" value={rupees(upi)} tone="text-ok" />
        <Cell label="Not paid at delivery" value={rupees(unpaid)} tone={unpaid > 0 ? 'text-bad' : ''} hint="Later payments show in the customer ledger" />
      </div>
    </details>
  );
}

export const byId = (customers) => Object.fromEntries((customers || []).map((c) => [c._id, c]));

export function Orders() {
  const [from, setFrom] = useState(addDays(today(), -7));
  const [to, setTo] = useState(today());
  const { data, ...status } = useLoad(() => api('GET', `/orders?from=${from}&to=${to}`), [from, to]);
  const customers = useLoad(() => api('GET', '/customers'));
  const [q, setQ] = useState('');
  const shown = (data || []).filter(matchOrder(q));

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Order register" title="All orders" sub="Everything sold in the dates you pick, including orders that are fully returned and paid."
        action={<a href="#/orders/new" className="btn btn-primary"><Icon name="plus" className="h-4 w-4" /> New order</a>} />
      <div className="card overflow-hidden p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 p-5">
          <div>
            <h2 className="font-display text-lg">Order register</h2>
            <p className="text-sm text-muted">{data ? `${shown.length} record${shown.length === 1 ? '' : 's'}` : ' '}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <SearchBox value={q} onChange={setQ} />
            <Field label="From"><input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
        </div>
        {data && <SalesSummary orders={shown} />}
        {!data ? <div className="p-5"><Status {...status} /></div> : <OrderTable orders={shown} summaries={byId(customers.data)} empty="No orders match." />}
      </div>
    </div>
  );
}

// Full-screen QR for the exact amount. "Received" is a manual tap: without a payment gateway we can't confirm it ourselves.
export function UpiScreen({ order, amount, onReceived, onLater }) {
  const { settings } = useApp();
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const link = settings.upiVpa && upiHref({ vpa: settings.upiVpa, name: BUSINESS, amount, note: `${order.customer.name} ${order.date}` });
  useEffect(() => { if (link) QRCode.toDataURL(link, { width: 480, margin: 2 }).then(setQr, () => setError('Could not make the QR')); }, [link]);

  const received = async () => {
    setBusy(true);
    try { await onReceived(); } catch (e) { setError(e.message); setBusy(false); }
  };
  const text = `Hello ${order.customer.name}, please pay ${rupees(amount)} to ${BUSINESS}.\nUPI ID: ${settings.upiVpa}\nPay link: ${link}`;

  return (
    <div role="dialog" aria-modal="true" aria-label="UPI payment" className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-4 overflow-auto bg-bg p-4">
      <div className="text-sm text-muted">{order.customer.name}</div>
      <div className="text-4xl font-bold text-accent">{rupees(amount)}</div>
      {!settings.upiVpa
        ? <p className="card max-w-sm text-warn">No UPI ID is set yet. An admin can add it under Admin.</p>
        : qr && <img src={qr} alt={`UPI QR code for ${rupees(amount)}`} className="w-full max-w-xs rounded-2xl border border-line bg-white" />}
      {settings.upiVpa && <div className="text-xs text-muted">{settings.upiVpa}</div>}
      {error && <p role="alert" className="text-bad">{error}</p>}
      <div className="flex w-full max-w-xs flex-col gap-2">
        <button className="btn btn-primary" disabled={busy} onClick={received}>Received ✓</button>
        {settings.upiVpa && order.customer.phone && <a className="btn" href={waHref(order.customer.phone, text)} target="_blank" rel="noreferrer">Send on WhatsApp</a>}
        <button className="btn" onClick={onLater}>Later (keep pending)</button>
      </div>
    </div>
  );
}

const zero = () => Object.fromEntries(PRODUCTS.map((p) => [p, 0]));

export function OrderForm({ id, presetCustomer }) {
  const app = useApp();
  const customers = useLoad(() => api('GET', '/customers'));
  const existing = useLoad(() => (id ? api('GET', `/orders/${id}`) : Promise.resolve(null)), [id]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [upi, setUpi] = useState(null); // { order, amount } while the QR is showing

  useEffect(() => {
    if (existing.loading || !customers.data || form) return;
    const o = existing.data;
    const who = o?.customer || customers.data.find((c) => c._id === presetCustomer) || {};
    const person = { name: who.name || '', phone: who.phone || '', address: o?.address || '', renaming: false }; // address: this order's own, never the customer's last one
    setForm(o ? {
      date: o.date, kind: o.kind || 'regular', ...person, qty: { ...zero(), ...o.qty }, emptiesBack: { ...zero(), ...o.emptiesBack },
      deliveryType: o.deliveryType, deliveryCharge: o.deliveryCharge || 0, dueDate: o.dueDate || addDays(o.date, 1),
      pay: o.paidAmount > 0 ? o.method : 'none', amount: o.paidAmount || '',
    } : {
      date: today(), kind: who.category === 'party' ? 'party' : 'regular', ...person, qty: zero(), emptiesBack: zero(),
      deliveryType: 'ours', deliveryCharge: 0, dueDate: addDays(today(), 1), pay: 'none', amount: '',
    });
  }, [existing.loading, existing.data, customers.data, form, presetCustomer]);

  if (existing.error || customers.error) return <Status error={existing.error || customers.error} />;
  if (!form || !customers.data) return <Status loading />;

  // An old order keeps the prices it was made with, unless its type is being switched to the other list.
  const prices = existing.data?.prices && (existing.data.kind || 'regular') === form.kind ? existing.data.prices : app.prices[form.kind];
  const total = PRODUCTS.reduce((s, p) => s + form.qty[p] * (prices[p] || 0), 0) + Number(form.deliveryCharge || 0);
  const amount = form.amount === '' ? total : Number(form.amount);
  const wasPaid = existing.data?.paidAmount || 0;
  const unpriced = PRODUCTS.filter((p) => form.qty[p] > 0 && !prices[p]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // The phone number is the account. A known number selects that customer whatever name is typed;
  // a new number creates one. A name alone never selects or creates anybody.
  const phone = normalizePhone(form.phone);
  const match = isMobile(phone) ? customers.data.find((c) => c.phone === phone) : null;
  const isNew = isMobile(phone) && !match;
  const setPhone = (value) => {
    const hit = customers.data.find((c) => c.phone === normalizePhone(value));
    // A new order takes the customer's usual type. The address is never filled in: staff must ask each time.
    setForm({ ...form, phone: value, renaming: false, ...(hit && { name: hit.name }), ...(hit && !id && { kind: hit.category === 'party' ? 'party' : 'regular' }) });
  };
  // Editing: changing the number re-assigns the order to someone else. Say so before it happens.
  const original = existing.data?.customer;
  const moved = Boolean(original && isMobile(phone) && match?._id !== original._id);
  const customerId = async () => {
    if (!isMobile(phone)) throw new Error('Enter the customer’s 10-digit mobile number.');
    const c = await api('POST', '/customers', { name: form.name.trim(), phone, category: form.kind }); // finds or creates
    if (match && form.renaming && form.name.trim() && form.name.trim() !== match.name) await api('PUT', `/customers/${c._id}`, { name: form.name.trim() });
    return c._id;
  };
  // The return date follows the order date (next day) until someone picks a different one.
  const setDate = (e) => {
    const date = e.target.value;
    const followed = !form.dueDate || form.dueDate === addDays(form.date, 1);
    setForm({ ...form, date, ...(followed && date && { dueDate: addDays(date, 1) }) });
  };
  const setQty = (group, p) => (n) => setForm({ ...form, [group]: { ...form[group], [p]: n } });

  const submit = async (e) => {
    e.preventDefault();
    if (!PRODUCTS.some((p) => form.qty[p] || form.emptiesBack[p])) return setError('Add at least one item.');
    setBusy(true);
    setError('');
    try {
      const showQr = form.pay === 'upi' && !wasPaid && amount > 0; // ask for the money first, mark paid on "Received"
      const customer = await customerId();
      const body = {
        date: form.date, customer, kind: form.kind, address: form.address.trim(), qty: form.qty, emptiesBack: form.emptiesBack,
        deliveryType: form.deliveryType, deliveryCharge: Number(form.deliveryCharge || 0), dueDate: form.dueDate,
        method: form.pay === 'upi' ? 'upi' : 'cash',
        paidAmount: form.pay === 'none' || showQr ? 0 : amount,
      };
      const saved = id ? await api('PUT', `/orders/${id}`, body) : await api('POST', '/orders', body);
      if (showQr) setUpi({ order: { ...saved, customer: { _id: customer, name: match && !form.renaming ? match.name : form.name.trim(), phone } }, amount });
      else go(`/customers/${customer}`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm('Delete this order?')) return;
    try { await api('DELETE', `/orders/${id}`); go('/orders'); } catch (e) { setError(e.message); }
  };

  if (upi) {
    const done = () => go(`/customers/${upi.order.customer._id}`);
    return <UpiScreen {...upi} onLater={done} onReceived={async () => { await api('PUT', `/orders/${upi.order._id}`, { paidAmount: upi.amount, method: 'upi' }); done(); }} />;
  }

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-4">
      <PageHead eyebrow="Customer checkout" title={id ? 'Edit order' : 'Create a new order'} sub="Record the customer, items, payment and return date." />
      {existing.data && (
        <div className="text-xs text-faint">
          added by {existing.data.createdBy?.name || 'system'}{existing.data.updatedBy && ` · edited by ${existing.data.updatedBy.name}`}
        </div>
      )}

      <div className="card grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <CustomerPicker customers={customers.data} phone={form.phone} onPhone={setPhone} names={app.names} />
        </div>
        {moved && <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-warn sm:col-span-2">Saving will move this order from {original.name} to {match ? match.name : 'a new customer'}.</p>}
        {match && (
          <div className="space-y-2 rounded-xl bg-ok-soft p-3 sm:col-span-2" aria-live="polite">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">{match.name}</span>
              <span className="chip">existing customer</span>
              {vesselText(match.held, app.names) && <span className="chip chip-accent">holding {vesselText(match.held, app.names)}</span>}
              {match.owed > 0 && <span className="chip chip-bad">{rupees(match.owed)} pending</span>}
              <DueChip s={match} />
            </div>
            {form.renaming
              ? <Field label="New name for this customer"><input className="input" required value={form.name} onChange={set('name')} /></Field>
              : <button type="button" className="text-sm text-muted underline" onClick={() => setForm({ ...form, renaming: true })}>Name is wrong? Rename this customer</button>}
          </div>
        )}
        {isNew && (
          <div className="space-y-2 sm:col-span-2" aria-live="polite">
            <span className="chip chip-accent">new number: a new customer will be added</span>
            <Field label="Customer name"><input className="input" required value={form.name} onChange={set('name')} /></Field>
          </div>
        )}
        <Field label="Delivery address for this order"><input className="input" autoComplete="off" placeholder="Ask the customer" value={form.address} onChange={set('address')} /></Field>
        <Field label="Date"><input className="input" type="date" required max={today()} value={form.date} onChange={setDate} /></Field>
      </div>

      <div className="card space-y-2">
        <span className="label mb-0">Order type (sets the prices)</span>
        <div role="radiogroup" aria-label="Order type" className="grid grid-cols-2 gap-2">
          {[['regular', 'Regular'], ['party', 'Party order']].map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={form.kind === v} className={`btn ${form.kind === v ? 'btn-primary' : ''}`} onClick={() => setForm({ ...form, kind: v })}>{label}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="card space-y-2">
          <legend className="label px-1">Given (filled)</legend>
          {PRODUCTS.filter((p) => app.selling.includes(p) || existing.data?.qty?.[p]).map((p) => <Stepper key={p} label={`${app.names[p]} · ${rupees(prices[p])}`} value={form.qty[p]} onChange={setQty('qty', p)} />)}
        </fieldset>
        <fieldset className="card space-y-2">
          <legend className="label px-1">Empties taken back now</legend>
          {PRODUCTS.map((p) => <Stepper key={p} label={app.names[p]} value={form.emptiesBack[p]} onChange={setQty('emptiesBack', p)} />)}
        </fieldset>
      </div>

      <div className="card grid gap-4 sm:grid-cols-3">
        <Field label="Delivery">
          <select className="input" value={form.deliveryType} onChange={set('deliveryType')}>
            <option value="ours">Our delivery</option>
            <option value="self">Self pickup</option>
          </select>
        </Field>
        <Field label="Delivery charge (₹)"><input className="input" inputMode="decimal" value={form.deliveryCharge || ''} placeholder="0" onChange={set('deliveryCharge')} /></Field>
        <Field label="Return by"><input className="input" type="date" required min={form.date} value={form.dueDate} onChange={set('dueDate')} /></Field>
      </div>

      <div className="card space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="label mb-0">Total</span>
          <span className="font-display text-3xl font-semibold text-accent">{rupees(total)}</span>
        </div>
        <div role="radiogroup" aria-label="Payment" className="grid grid-cols-3 gap-2">
          {[['none', 'Not paid'], ['cash', 'Cash'], ['upi', 'UPI']].map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={form.pay === v} className={`btn ${form.pay === v ? 'btn-primary' : ''}`} onClick={() => setForm({ ...form, pay: v })}>{label}</button>
          ))}
        </div>
        {form.pay !== 'none' && (
          <Field label="Amount received (₹)">
            <input className="input" inputMode="decimal" value={form.amount} placeholder={String(total)} onChange={set('amount')} />
          </Field>
        )}
        {form.pay === 'upi' && !wasPaid && <p className="text-xs text-muted">After saving, the UPI QR for {rupees(amount)} will show.</p>}
        {unpriced.length > 0 && (
          <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">
            No {form.kind === 'party' ? 'party order' : 'regular'} price is set for {unpriced.map((p) => app.names[p]).join(', ')}, so this order bills ₹0 for {unpriced.length === 1 ? 'it' : 'them'}.{' '}
            {app.user.role === 'admin' ? <a className="underline" href="#/admin">Set prices in Admin</a> : 'Ask an admin to set prices.'} The order will be billed automatically once the price is set.
          </p>
        )}
      </div>

      {error && <p role="alert" className="text-bad">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save order'}</button>
        <button type="button" className="btn" onClick={() => window.history.back()}>Cancel</button>
        {id && app.user.role === 'admin' && <button type="button" className="btn btn-danger ml-auto" onClick={remove}>Delete</button>}
      </div>
    </form>
  );
}
