import { Fragment, useState } from 'react';
import { api } from './api.js';
import { Field, Status, useApp, useLoad } from './ui.jsx';

// Delivery teams for pheras. Teams are switched off, not deleted, so old pheras keep their team name.
export function Teams() {
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

// One Save button per tab: runs `fn`, reloads prices/settings, shows what happened.
function useSave(fn) {
  const { reloadMeta } = useApp();
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try { const ok = await fn(); await reloadMeta(); setMsg({ ok: ok || 'Saved.' }); } catch (err) { setMsg({ error: err.message }); } finally { setBusy(false); }
  };
  const bar = (
    <>
      {msg?.error && <p role="alert" className="text-bad">{msg.error}</p>}
      {msg?.ok && <p role="status" className="text-ok">{msg.ok}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
    </>
  );
  return [save, bar];
}

export function Prices() {
  const { products } = useApp();
  const [prices, setPrices] = useState(Object.fromEntries(products.map((p) => [p.key, { price: p.price, partyPrice: p.partyPrice || 0 }])));
  const [save, bar] = useSave(async () => {
    const want = (p) => ({ price: Number(prices[p.key].price), partyPrice: Number(prices[p.key].partyPrice) });
    if (products.some((p) => Object.values(want(p)).some((n) => !Number.isFinite(n) || n < 0))) throw new Error('Prices must be numbers, 0 or more.');
    const changed = products.filter((p) => want(p).price !== p.price || want(p).partyPrice !== (p.partyPrice || 0));
    const saved = await Promise.all(changed.map((p) => api('PUT', `/products/${p.key}`, want(p))));
    const rebilled = saved.reduce((n, p) => n + (p.rebilled || 0), 0);
    return rebilled ? `Saved. ${rebilled} earlier order line${rebilled === 1 ? ' was' : 's were'} billed at the new price.` : '';
  });
  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset className="card space-y-3">
        <legend className="label px-1">Prices (₹ each)</legend>
        <div className="grid grid-cols-[1fr_6.5rem_6.5rem] items-center gap-x-3 gap-y-2 sm:grid-cols-[1fr_9rem_9rem]">
          <span />
          <span className="label mb-0">Regular</span>
          <span className="label mb-0">Party order</span>
          {products.map((p) => (
            <Fragment key={p.key}>
              <span className="font-semibold">{p.name}</span>
              {[['price', 'regular'], ['partyPrice', 'party order']].map(([field, word]) => (
                <input key={field} className="input" inputMode="decimal" required aria-label={`${p.name} ${word} price`}
                  value={prices[p.key][field]} onChange={(e) => setPrices({ ...prices, [p.key]: { ...prices[p.key], [field]: e.target.value } })} />
              ))}
            </Fragment>
          ))}
        </div>
        <p className="text-xs text-muted">Each order bills from the Regular or the Party order list, whichever type the order is. A new price applies to new orders only. Orders made while an item had no price are billed when you first set it.</p>
      </fieldset>
      {bar}
    </form>
  );
}

const WHERE = [['sellRegular', 'Regular orders'], ['sellParty', 'Party orders'], ['sellPhera', 'Pheras']];

export function Items() {
  const { products } = useApp();
  const [on, setOn] = useState(Object.fromEntries(products.map((p) => [p.key, Object.fromEntries(WHERE.map(([k]) => [k, p[k] !== false]))])));
  const [save, bar] = useSave(async () => {
    const changed = products.filter((p) => WHERE.some(([k]) => on[p.key][k] !== (p[k] !== false)));
    await Promise.all(changed.map((p) => api('PUT', `/products/${p.key}`, on[p.key])));
  });
  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset className="card space-y-3">
        <legend className="label px-1">Items on sale</legend>
        <p className="text-sm text-muted">Switch an item off where you don't give it out. It is greyed out there; customers can still return the ones they hold.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th scope="col" className="py-2 text-left font-semibold">Item</th>
                {WHERE.map(([k, label]) => <th key={k} scope="col" className="px-1 py-2 text-center font-semibold">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.key} className="border-t border-line">
                  <th scope="row" className="py-3 text-left font-semibold">{p.name}</th>
                  {WHERE.map(([k, label]) => (
                    <td key={k} className="px-1 py-3 text-center">
                      <button type="button" role="switch" aria-checked={on[p.key][k]} aria-label={`${p.name} on ${label.toLowerCase()}`}
                        onClick={() => setOn({ ...on, [p.key]: { ...on[p.key], [k]: !on[p.key][k] } })}
                        className={`chip cursor-pointer ${on[p.key][k] ? 'chip-ok' : 'chip-bad'}`}>{on[p.key][k] ? 'On' : 'Off'}</button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>
      {bar}
    </form>
  );
}

export function Business() {
  const { settings } = useApp();
  const [biz, setBiz] = useState({ upiVpa: '', phone: '', address: '', about: '', ...settings });
  const [save, bar] = useSave(() => api('PUT', '/settings', Object.fromEntries(['upiVpa', 'phone', 'address', 'about'].map((k) => [k, (biz[k] || '').trim()]))).then(() => ''));
  const setB = (k) => (e) => setBiz({ ...biz, [k]: e.target.value });
  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset className="card grid gap-4 sm:grid-cols-2">
        <legend className="label px-1">Payment</legend>
        <Field label="Your UPI ID (customers pay to this)" className="sm:col-span-2"><input className="input" autoCapitalize="none" placeholder="name@bank" value={biz.upiVpa} onChange={setB('upiVpa')} /></Field>
        <p className="text-xs text-muted sm:col-span-2">Used for the payment QR and the WhatsApp pay link on UPI orders.</p>
      </fieldset>
      <fieldset className="card grid gap-4 sm:grid-cols-2">
        <legend className="label px-1">Customer page (anyone with the link can see this)</legend>
        <Field label="Phone for orders"><input className="input" inputMode="tel" value={biz.phone} onChange={setB('phone')} /></Field>
        <Field label="Address"><input className="input" value={biz.address} onChange={setB('address')} /></Field>
        <Field label="About us" className="sm:col-span-2"><textarea className="input min-h-24" value={biz.about} onChange={setB('about')} /></Field>
        <p className="text-xs text-muted sm:col-span-2">Shows with your items and regular prices at <a className="underline" href="#/info" target="_blank" rel="noreferrer">{window.location.origin}/#/info</a>. Party prices, your UPI ID and all records stay private.</p>
      </fieldset>
      {bar}
    </form>
  );
}
