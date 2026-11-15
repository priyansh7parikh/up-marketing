import { useState } from 'react';
import { api } from './api.js';
import { BUSINESS, Icon, Legend, PRODUCTS, SHORT, Status, addDays, fmtDay, rupees, telHref, today, upiHref, useApp, useLoad, vesselText, waHref } from './ui.jsx';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const count = (v) => PRODUCTS.reduce((n, p) => n + (v?.[p] || 0), 0);
const addUp = (list, pick) => Object.fromEntries(PRODUCTS.map((p) => [p, list.reduce((n, x) => n + (pick(x)?.[p] || 0), 0)]));
const money = (list, pick) => list.reduce((n, x) => n + Math.round((pick(x) || 0) * 100), 0) / 100;
// Monday of the current week (India time), as YYYY-MM-DD.
const weekStart = () => addDays(today(), -((new Date(`${today()}T00:00:00Z`).getUTCDay() + 6) % 7));

function Metric({ label, value, hint, href, tone = 'text-accent' }) {
  return (
    <a href={href} className="card block min-w-0 p-3 hover:border-accent sm:p-5">
      <div className="text-sm text-muted">{label}</div>
      <div className={`font-display text-2xl font-extrabold sm:text-3xl ${tone}`}>{value}</div>
      <div className="text-xs text-faint">{hint}</div>
    </a>
  );
}

// One customer with something not cleared from an earlier day: what they hold, what they owe, and how to chase it.
function PendingCard({ c, upiVpa }) {
  const itemsLate = c.qty.daysLate;
  const moneyLate = c.money.daysLate;
  const late = itemsLate > 0 || moneyLate > 0;
  const days = (n) => `${n} day${n === 1 ? '' : 's'}`;
  const tag = itemsLate > 0 ? `late ${days(itemsLate)}` : moneyLate > 0 ? `payment late ${days(moneyLate)}` : 'due today';
  const pay = c.owed > 0 && upiVpa ? `\nPay by UPI: ${upiHref({ vpa: upiVpa, name: BUSINESS, amount: c.owed, note: c.name })}` : '';
  const message = `Hello ${c.name}, this is ${BUSINESS}. Pending since ${fmtDay(c.oldestDate)}: ${[vesselText(c.held), c.owed > 0 && rupees(c.owed)].filter(Boolean).join(' and ')}. Thank you.${pay}`;

  return (
    <article className={`card flex flex-col gap-4 border-l-4 lg:flex-row lg:items-center ${late ? 'border-l-bad' : 'border-l-warn'}`}>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <a href={`#/customers/${c._id}`} className="text-base font-bold hover:text-accent">{c.name}</a>
          <span className={`chip ${late ? 'chip-bad' : 'chip-warn'}`}>{tag}</span>
        </div>
        <div className="text-sm text-muted">Taken {fmtDay(c.oldestDate)} · {c.phone}{c.address ? ` · ${c.address}` : ''}</div>
        <div className="flex flex-wrap gap-1.5">
          {PRODUCTS.filter((p) => c.held[p]).map((p) => <span key={p} className="chip chip-accent">{c.held[p]} × {SHORT[p]}</span>)}
          {c.owed > 0 ? <span className="chip chip-bad">{rupees(c.owed)} pending</span> : <span className="chip chip-ok">paid</span>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 lg:w-80 lg:shrink-0">
        <a className="btn px-2" href={telHref(c.phone)}>Call</a>
        <a className="btn px-2" href={waHref(c.phone, message)} target="_blank" rel="noreferrer">WhatsApp</a>
        <a className="btn btn-primary px-2" href={`#/returns/new?customer=${c._id}`}>{PRODUCTS.some((p) => c.held[p]) ? 'Returned' : 'Collect'}</a>
      </div>
    </article>
  );
}

function Block({ title, sub, children }) {
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted">{sub}</p>
      </div>
      {children}
    </section>
  );
}

const Row = ({ label, hint, value }) => (
  <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
    <span className="min-w-0"><span className="block font-semibold">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    <span className="shrink-0 text-right text-sm font-semibold">{value}</span>
  </div>
);

export default function Today() {
  const { user, products, settings } = useApp();
  const admin = user.role === 'admin';
  const [view, setView] = useState('today'); // the week view is for admins
  const from = admin ? weekStart() : today();
  const customers = useLoad(() => api('GET', '/customers'));
  const orders = useLoad(() => api('GET', `/orders?from=${from}&to=${today()}`), [from]);
  const collections = useLoad(() => api('GET', `/collections?from=${from}&to=${today()}`), [from]);
  const pheras = useLoad(() => api('GET', `/pheras?from=${from}&to=${today()}`), [from]);
  const loads = [customers, orders, collections, pheras];
  if (loads.some((l) => !l.data)) return <Status loading={loads.some((l) => l.loading)} error={loads.find((l) => l.error)?.error} />;

  const inView = (x) => view === 'week' || x.date === today();
  const [o, col, ph] = [orders.data.filter(inView), collections.data.filter(inView), pheras.data.filter(inView)];
  const list = customers.data;
  const holding = list.filter((c) => count(c.held) > 0);
  const lateOnes = list.filter((c) => c.qty.daysLate > 0);
  const owing = list.filter((c) => c.owed > 0);
  const pending = list.filter((c) => c.pending).sort((a, b) => (a.oldestDate || '9').localeCompare(b.oldestDate || '9'));
  const unpriced = products.filter((p) => p.active !== false && (!p.price || !p.partyPrice));
  const period = view === 'week' ? 'this week' : 'today';

  const teams = Object.values(ph.reduce((acc, p) => {
    const id = p.team?._id || 'none';
    (acc[id] ||= { id, name: p.team?.name || 'Unknown team', rounds: [] }).rounds.push(p);
    return acc;
  }, {})).sort((a, b) => a.name.localeCompare(b.name));
  const byDelivery = [['ours', 'Our delivery'], ['self', 'Self pickup']].map(([type, label]) => ({ label, list: o.filter((x) => x.deliveryType === type) }));
  const cash = money(o, (x) => (x.method === 'cash' ? x.paidAmount : 0)) + money(col, (x) => (x.method === 'cash' ? x.amount : 0));
  const upi = money(o, (x) => (x.method === 'upi' ? x.paidAmount : 0)) + money(col, (x) => (x.method === 'upi' ? x.amount : 0));
  const returned = addUp([...o.map((x) => x.emptiesBack), ...col.map((x) => x.returned)], (v) => v);

  const dateLine = new Date(`${today()}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="h1">{view === 'week' ? 'This week' : 'Today'}</h1>
          <p className="mt-1 text-muted">{view === 'week' ? `${fmtDay(from)} to ${fmtDay(today())}` : dateLine} · {user.name}</p>
        </div>
        {admin && (
          <div role="radiogroup" aria-label="Report period" className="flex rounded-full border border-line bg-surface p-1">
            {[['today', 'Today'], ['week', 'This week']].map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)}
                className={`min-h-10 rounded-full px-5 text-sm font-bold ${view === v ? 'bg-accent text-on-accent' : 'text-muted hover:text-accent'}`}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {unpriced.length > 0 && (
        <a href={admin ? '#/admin' : undefined} role="alert" className="block rounded-2xl border border-bad/30 bg-bad-soft p-4 text-bad">
          <span className="block font-bold">Some prices are not set: {unpriced.map((p) => `${p.name} (${[!p.price && 'regular', !p.partyPrice && 'party'].filter(Boolean).join(' and ')})`).join(', ')}</span>
          <span className="block text-sm">Orders bill ₹0 for these until a price is set. {admin ? 'Tap to open Admin.' : 'Ask an admin to set them.'}</span>
        </a>
      )}

      <div className="grid grid-cols-3 gap-3 lg:gap-4">
        <Metric label="Items out" value={holding.reduce((n, c) => n + count(c.held), 0)} hint={`With ${plural(holding.length, 'customer')}`} href="#/pending" />
        <Metric label="Late" value={lateOnes.length} tone={lateOnes.length ? 'text-bad' : 'text-accent'}
          hint={lateOnes.length ? `${plural(lateOnes.length, 'customer')}, oldest ${plural(Math.max(...lateOnes.map((c) => c.qty.daysLate)), 'day')}` : 'Nobody is late'} href="#/pending" />
        <Metric label="To collect" value={rupees(money(owing, (c) => c.owed))} hint={`From ${plural(owing.length, 'customer')}`} href="#/ughrani" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <a href="#/pending" className="btn btn-primary min-h-12"><Icon name="alert" className="h-4 w-4" /> Pending items</a>
        <a href="#/ughrani" className="btn btn-primary min-h-12"><Icon name="rupee" className="h-4 w-4" /> Ughrani</a>
      </div>

      {view === 'week' && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
          {[['Delivered', `${count(addUp(o, (x) => x.qty))} items`, vesselText(addUp(o, (x) => x.qty))], ['Returned', `${count(returned)} items`, vesselText(returned)],
            ['Billed', rupees(money(o, (x) => x.total)), plural(o.length, 'order')], ['Collected', rupees(cash + upi), `Cash ${rupees(cash)} · UPI ${rupees(upi)}`]].map(([label, value, hint]) => (
            <div key={label} className="min-w-0 bg-surface p-4">
              <div className="text-xs font-semibold text-muted">{label} this week</div>
              <div className="font-display text-xl font-extrabold">{value}</div>
              <div className="truncate text-xs text-faint">{hint || '—'}</div>
            </div>
          ))}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold">Pending from earlier days</h2>
            <Legend />
          </div>
          {pending.length > 0 && <span className="chip chip-bad">{pending.length} need action</span>}
        </div>
        {!pending.length && <p className="card text-center text-muted">Nothing pending from earlier days.</p>}
        {pending.map((c) => <PendingCard key={c._id} c={c} upiVpa={settings.upiVpa} />)}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Block title={`Phera sales ${period}`} sub="Prepaid route sales, by team">
          {!teams.length && <p className="border-t border-line pt-3 text-sm text-muted">No pheras recorded {period}.</p>}
          {teams.map((t) => {
            const sold = addUp(t.rounds, (p) => p.sold);
            return <Row key={t.id} label={t.name} hint={`${plural(t.rounds.length, 'round')} · ${vesselText(sold) || 'nothing sold yet'}`} value={`${count(sold)} items`} />;
          })}
          <a href="#/pheras" className="block text-sm font-semibold text-accent underline">Open pheras</a>
        </Block>

        <Block title={`Orders ${period}`} sub="Sales to named customers">
          {byDelivery.map(({ label, list: l }) => {
            const sold = addUp(l, (x) => x.qty);
            return <Row key={label} label={label} hint={`${plural(l.length, 'order')} · ${vesselText(sold) || 'nothing'}`} value={`${count(sold)} items`} />;
          })}
          <a href="#/orders" className="block text-sm font-semibold text-accent underline">Open orders</a>
        </Block>

        {admin && (
          <Block title={`Collected ${period}`} sub="Money received, on orders and after">
            <Row label="Cash" value={rupees(cash)} />
            <Row label="UPI" value={rupees(upi)} />
            <div className="border-t border-line pt-3">
              <div className="font-display text-3xl font-extrabold text-accent">{rupees(cash + upi)}</div>
              <div className="text-xs text-faint">Total collected</div>
            </div>
          </Block>
        )}
      </div>
    </div>
  );
}
