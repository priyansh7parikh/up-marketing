import { Fragment, useState } from 'react';
import { api } from './api.js';
import { Field, Status, useApp, useLoad } from './ui.jsx';

// Delivery teams for pheras. Teams are switched off, not deleted, so old pheras keep their team name.
function Teams() {
  const { data, reload, ...status } = useLoad(() => api('GET', '/teams'));
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const run = async (fn) => { setError(''); try { await fn(); reload(); } catch (e) { setError(e.message); } };
  const add = (e) => { e.preventDefault(); run(async () => { await api('POST', '/teams', { name }); setName(''); }); };
  return (
    <section className="space-y-3">
      <fieldset className="card space-y-3">
        <legend className="label px-1">Delivery teams (for pheras)</legend>
        <Status {...status} />
        {data && !data.length && <p className="text-sm text-muted">No teams yet. Add your 3 to 5 teams here.</p>}
        {(data || []).map((t) => (
          <div key={t._id} className="flex items-center justify-between gap-3">
            <span className={`font-semibold ${t.active ? '' : 'text-faint line-through'}`}>{t.name}</span>
            <button type="button" className="btn" onClick={() => run(() => api('PUT', `/teams/${t._id}`, { active: !t.active }))}>{t.active ? 'Switch off' : 'Switch on'}</button>
          </div>
        ))}
        <form onSubmit={add} className="flex gap-2 border-t border-line pt-3">
          <input className="input" required aria-label="New team name" placeholder="New team name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary shrink-0">Add team</button>
        </form>
        {error && <p role="alert" className="text-bad">{error}</p>}
      </fieldset>
    </section>
  );
}

// Admin only (the server enforces it too): prices and the business/UPI details.
export default function Settings() {
  const { products, settings, reloadMeta, user } = useApp();
  const [prices, setPrices] = useState(Object.fromEntries(products.map((p) => [p.key, { price: p.price, partyPrice: p.partyPrice || 0, active: p.active !== false }])));
  const [biz, setBiz] = useState({ upiVpa: '', ...settings });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user.role !== 'admin') return <p className="card text-muted">Admins only.</p>;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const want = (p) => ({ price: Number(prices[p.key].price), partyPrice: Number(prices[p.key].partyPrice), active: prices[p.key].active });
      if (products.some((p) => [want(p).price, want(p).partyPrice].some((n) => !Number.isFinite(n) || n < 0))) throw new Error('Prices must be numbers, 0 or more.');
      const changed = products.filter((p) => want(p).price !== p.price || want(p).partyPrice !== (p.partyPrice || 0) || want(p).active !== (p.active !== false));
      const saved = await Promise.all(changed.map((p) => api('PUT', `/products/${p.key}`, want(p))));
      const rebilled = saved.reduce((n, p) => n + (p.rebilled || 0), 0);
      await api('PUT', '/settings', { upiVpa: biz.upiVpa.trim() });
      await reloadMeta();
      setMsg({ ok: rebilled ? `Saved. ${rebilled} earlier order line${rebilled === 1 ? ' was' : 's were'} billed at the new price.` : 'Saved.' });
    } catch (err) { setMsg({ error: err.message }); } finally { setBusy(false); }
  };
  const setB = (k) => (e) => setBiz({ ...biz, [k]: e.target.value });

  return (
    <div className="space-y-8">
    <form onSubmit={save} className="space-y-4">
      <fieldset className="card space-y-3">
        <legend className="label px-1">Prices (₹ each)</legend>
        <div className="grid grid-cols-[1fr_6.5rem_6.5rem] items-center gap-x-3 gap-y-2 sm:grid-cols-[1fr_9rem_9rem]">
          <span />
          <span className="label mb-0">Regular</span>
          <span className="label mb-0">Party order</span>
          {products.map((p) => (
            <Fragment key={p.key}>
              <span className="flex flex-col items-start gap-1">
                <span className={`font-semibold ${prices[p.key].active ? '' : 'text-faint line-through'}`}>{p.name}</span>
                <button type="button" role="switch" aria-checked={prices[p.key].active} aria-label={`Selling ${p.name}`}
                  onClick={() => setPrices({ ...prices, [p.key]: { ...prices[p.key], active: !prices[p.key].active } })}
                  className={`chip cursor-pointer ${prices[p.key].active ? 'chip-ok' : ''}`}>
                  <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${prices[p.key].active ? 'bg-ok' : 'bg-faint'}`} />
                  {prices[p.key].active ? 'Selling' : 'Off'}
                </button>
              </span>
              {[['price', 'regular'], ['partyPrice', 'party order']].map(([field, word]) => (
                <input key={field} className="input" inputMode="decimal" required aria-label={`${p.name} ${word} price`}
                  value={prices[p.key][field]} onChange={(e) => setPrices({ ...prices, [p.key]: { ...prices[p.key], [field]: e.target.value } })} />
              ))}
            </Fragment>
          ))}
        </div>
        <p className="text-xs text-muted">Each order bills from the Regular or the Party order list, whichever type the order is. Changing a price applies to new orders only. Orders made while an item had no price are billed when you first set it. Tap Selling / Off to stop giving out an item: it is greyed out under Given on new orders and pheras, but customers can still return the ones they hold.</p>
      </fieldset>
      <fieldset className="card grid gap-4 sm:grid-cols-2">
        <legend className="label px-1">Payment</legend>
        <Field label="Your UPI ID (customers pay to this)" className="sm:col-span-2"><input className="input" autoCapitalize="none" placeholder="name@bank" value={biz.upiVpa || ''} onChange={setB('upiVpa')} /></Field>
        <p className="text-xs text-muted sm:col-span-2">Used for the payment QR and the WhatsApp pay link on UPI orders.</p>
      </fieldset>
      {msg?.error && <p role="alert" className="text-bad">{msg.error}</p>}
      {msg?.ok && <p role="status" className="text-ok">{msg.ok}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
    </form>
    <Teams />
    </div>
  );
}
