import { useState } from 'react';
import { api } from './api.js';
import { OrderTable, byId, matchOrder } from './Orders.jsx';
import { Icon, PRODUCTS, PageHead, SearchBox, Status, addDays, rupees, today, useApp, useLoad } from './ui.jsx';

function Tile({ tone, tag, label, value, hint, href }) {
  const tones = { out: 'bg-[#e8f0fb] text-[#2a5db0]', due: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', ok: 'bg-ok-soft text-ok' };
  const Box = href ? 'a' : 'div';
  return (
    <Box href={href} className={`card block space-y-3 ${href ? 'hover:border-accent' : ''} ${tone === 'bad' && value !== 0 && value !== '₹0' ? 'border-bad/30' : ''}`}>
      <div className="flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-[9px] ${tones[tone]}`}><Icon name={{ out: 'clipboard', due: 'calendar', bad: 'alert', ok: 'rupee' }[tone]} /></span>
        <span className={`chip ${tone === 'due' ? 'chip-warn' : tone === 'bad' ? 'chip-bad' : ''}`}>{tag}</span>
      </div>
      <div className="text-sm text-muted">{label}</div>
      <div className="font-display text-3xl font-semibold">{value}</div>
      <div className="text-xs text-faint">{hint}</div>
    </Box>
  );
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function Overview() {
  const { user, products } = useApp();
  const unpriced = products.filter((p) => !p.price || !p.partyPrice);
  const [q, setQ] = useState('');
  const customers = useLoad(() => api('GET', '/customers'));
  const orders = useLoad(() => api('GET', `/orders?from=${addDays(today(), -7)}&to=${today()}`));
  if (!customers.data || !orders.data) return <Status loading={customers.loading || orders.loading} error={customers.error || orders.error} />;

  const list = customers.data;
  const count = (c) => PRODUCTS.reduce((s, p) => s + (c.held[p] || 0), 0);
  const holding = list.filter((c) => count(c) > 0);
  const out = holding.reduce((s, c) => s + count(c), 0);
  const dueToday = list.filter((c) => !c.overdue && c.due === today()).length;
  const overdue = list.filter((c) => c.overdue).length;
  const owing = list.filter((c) => c.owed > 0);
  const owed = owing.reduce((s, c) => s + c.owed, 0);

  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Operations dashboard" title={`${greeting}, ${user.name}`} sub="Here’s what’s happening with your vessels and payments today."
        action={<a href="#/orders/new" className="btn btn-primary"><Icon name="plus" className="h-4 w-4" /> New order</a>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Tile tone="out" tag="LIVE" label="Vessels out" value={out} hint={`With ${plural(holding.length, 'customer')}`} />
        <Tile tone="due" tag="TODAY" label="Due today" value={dueToday} hint="Expected back today" />
        <Tile tone="bad" tag="LATE" label="Overdue" value={overdue} hint="Need your attention" href="#/customers?pending=1" />
        <Tile tone="ok" tag="TO COLLECT" label="Money pending" value={rupees(owed)} hint={`From ${plural(owing.length, 'customer')}`} href="#/customers?pending=1" />
      </div>

      {unpriced.length > 0 && (
        <a href={user.role === 'admin' ? '#/settings' : undefined} role="alert" className="block rounded-2xl border border-bad/30 bg-bad-soft p-5 text-bad">
          <span className="block font-display text-lg">Some prices are not set: {unpriced.map((p) => `${p.name} (${[!p.price && 'regular', !p.partyPrice && 'party'].filter(Boolean).join(' and ')})`).join(', ')}</span>
          <span className="block text-sm">Orders bill ₹0 for these until a price is set. {user.role === 'admin' ? 'Tap to open Settings.' : 'Ask an admin to set them.'} Earlier orders are billed automatically once you do.</span>
        </a>
      )}

      {overdue > 0 && (
        <a href="#/customers?pending=1" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warn/25 bg-warn-soft p-5 hover:border-warn">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#f8e3be] text-warn"><Icon name="alert" /></span>
          <span className="flex-1 basis-56">
            <span className="block font-display text-lg text-fg">{plural(overdue, 'customer')} overdue</span>
            <span className="block text-sm text-warn">Follow up with a call or WhatsApp to keep your vessels moving.</span>
          </span>
          <span className="flex items-center gap-1 text-sm font-semibold text-warn">Review pending customers <Icon name="chevron" className="h-4 w-4" /></span>
        </a>
      )}

      <div className="card overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="font-display text-lg">Recent orders</h2>
            <p className="text-sm text-muted">Last 7 days. Tap an order to open it.</p>
          </div>
          <SearchBox value={q} onChange={setQ} />
        </div>
        <OrderTable orders={orders.data.filter(matchOrder(q)).slice(0, 15)} summaries={byId(list)} empty="No orders in the last 7 days. Create the first one." />
      </div>
    </div>
  );
}
