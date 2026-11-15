import { useState } from 'react';
import { api } from './api.js';
import { Avatar, BUSINESS, Icon, Legend, PRODUCTS, PageHead, SHORT, SearchBox, Status, fmtDay, rupees, telHref, today, upiHref, useApp, useLoad, vesselText, waHref } from './ui.jsx';

// "late 2 days" / "due today" / "due 20 Nov" for one side (quantity or money) of a customer's balance.
function AgeChip({ a }) {
  if (a.daysLate > 0) return <span className="chip chip-bad">late {a.daysLate} day{a.daysLate === 1 ? '' : 's'}</span>;
  if (a.due === today()) return <span className="chip chip-warn">due today</span>;
  return a.due ? <span className="chip">due {fmtDay(a.due)}</span> : null;
}

function Actions({ c, message, action }) {
  return (
    <span className="flex flex-wrap gap-2">
      <a className="btn min-h-10 px-3" href={telHref(c.phone)}>Call</a>
      <a className="btn min-h-10 px-3" href={waHref(c.phone, message)} target="_blank" rel="noreferrer">WhatsApp</a>
      <a className="btn btn-primary min-h-10 px-3" href={`#/returns/new?customer=${c._id}`}>{action}</a>
    </span>
  );
}

const match = (q) => {
  const n = q.trim().toLowerCase();
  return (c) => !n || [c.name, c.nameGu, c.phone].some((v) => v?.toLowerCase().includes(n));
};
const oldestFirst = (side) => (a, b) => (a[side].since || '9').localeCompare(b[side].since || '9');

function Who({ c }) {
  return (
    <a href={`#/customers/${c._id}`} className="flex min-w-0 items-center gap-3 hover:text-accent">
      <Avatar name={c.name} />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{c.name}</span>
        <span className="block truncate text-xs text-muted">{c.phone}</span>
      </span>
    </a>
  );
}

// Who is holding our jars and bottles, and since when.
export function PendingQty() {
  const { data, ...status } = useLoad(() => api('GET', '/customers'));
  const [q, setQ] = useState('');
  if (!data) return <Status {...status} />;
  const rows = data.filter((c) => Object.keys(c.held).length).filter(match(q)).sort(oldestFirst('qty'));
  const totals = Object.fromEntries(PRODUCTS.map((p) => [p, rows.reduce((n, c) => n + (c.held[p] || 0), 0)]));
  const cols = 'lg:grid-cols-[1.3fr_repeat(4,4.5rem)_9rem_17rem]';

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Pending report" title="Pending items" sub="Jars and bottles still with customers, oldest first." />
      <div className="card overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="font-display text-lg">{rows.length} customer{rows.length === 1 ? '' : 's'} holding items</h2>
            <Legend className="mt-1" />
          </div>
          <SearchBox value={q} onChange={setQ} />
        </div>
        <div className="grid grid-cols-4 gap-px border-t border-line bg-line">
          {PRODUCTS.map((p) => (
            <div key={p} className="bg-surface p-4">
              <div className="text-xs font-semibold text-muted">{SHORT[p]} out</div>
              <div className="font-display text-2xl font-semibold">{totals[p]}</div>
            </div>
          ))}
        </div>
        {!rows.length && <p className="border-t border-line px-5 py-8 text-center text-muted">Nothing is pending. Everything is back.</p>}
        {rows.length > 0 && (
          <div className={`hidden gap-4 border-t border-line bg-bg/60 px-5 py-3 text-xs font-semibold tracking-wider text-muted uppercase lg:grid ${cols}`}>
            <span>Customer</span>{PRODUCTS.map((p) => <span key={p} className="text-right">{SHORT[p]}</span>)}<span>Since</span><span />
          </div>
        )}
        {rows.map((c) => (
          <div key={c._id} className={`grid gap-x-4 gap-y-3 border-t border-line px-5 py-4 lg:items-center ${cols}`}>
            <Who c={c} />
            {PRODUCTS.map((p) => <span key={p} className={`hidden text-right text-base lg:block ${c.held[p] ? 'font-semibold' : 'text-faint'}`}>{c.held[p] || '–'}</span>)}
            <span className="font-semibold lg:hidden">{vesselText(c.held)}</span>
            <span className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-muted">since {fmtDay(c.qty.since)}</span><AgeChip a={c.qty} />
            </span>
            <Actions c={c} action="Returned" message={`Hello ${c.name}, this is ${BUSINESS}. Please return: ${vesselText(c.held)} (taken ${fmtDay(c.qty.since)}). Thank you.`} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Ughrani (ઉઘરાણી): the dues ledger. Who owes money, how much, and since when.
export function Ughrani() {
  const { settings } = useApp();
  const { data, ...status } = useLoad(() => api('GET', '/customers'));
  const [q, setQ] = useState('');
  if (!data) return <Status {...status} />;
  const rows = data.filter((c) => c.owed > 0).filter(match(q)).sort(oldestFirst('money'));
  const total = rows.reduce((n, c) => n + Math.round(c.owed * 100), 0) / 100;
  const late = rows.filter((c) => c.money.daysLate > 0);
  const lateTotal = late.reduce((n, c) => n + Math.round(c.owed * 100), 0) / 100;
  const cols = 'lg:grid-cols-[1.3fr_7rem_10rem_17rem]';

  const message = (c) => {
    const pay = settings.upiVpa ? `\nPay by UPI: ${upiHref({ vpa: settings.upiVpa, name: BUSINESS, amount: c.owed, note: c.name })}\nUPI ID: ${settings.upiVpa}` : '';
    return `Hello ${c.name}, this is ${BUSINESS}. ${rupees(c.owed)} is pending since ${fmtDay(c.money.since)}. Please pay at the earliest.${pay}`;
  };

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Dues ledger" title={<>Ughrani <span lang="gu" className="text-muted">ઉઘરાણી</span></>} sub="Money still to collect, oldest first." />
      <div className="card overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <h2 className="font-display text-lg">{rows.length} customer{rows.length === 1 ? '' : 's'} to collect from</h2>
          <SearchBox value={q} onChange={setQ} />
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-line bg-line">
          <div className="bg-surface p-4">
            <div className="text-xs font-semibold text-muted">Total to collect</div>
            <div className="font-display text-2xl font-semibold">{rupees(total)}</div>
          </div>
          <div className="bg-surface p-4">
            <div className="text-xs font-semibold text-muted">Of which late ({late.length})</div>
            <div className={`font-display text-2xl font-semibold ${lateTotal > 0 ? 'text-bad' : ''}`}>{rupees(lateTotal)}</div>
          </div>
        </div>
        {!rows.length && <p className="border-t border-line px-5 py-8 text-center text-muted">No dues. Everyone has paid.</p>}
        {rows.length > 0 && (
          <div className={`hidden gap-4 border-t border-line bg-bg/60 px-5 py-3 text-xs font-semibold tracking-wider text-muted uppercase lg:grid ${cols}`}>
            <span>Customer</span><span className="text-right">Due</span><span>Since</span><span />
          </div>
        )}
        {rows.map((c) => (
          <div key={c._id} className={`grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 border-t border-line px-5 py-4 lg:items-center ${cols}`}>
            <Who c={c} />
            <span className="text-right font-display text-xl font-semibold text-bad">{rupees(c.owed)}</span>
            <span className="col-span-2 flex flex-wrap items-center gap-1.5 text-sm lg:col-span-1">
              <span className="text-muted">since {fmtDay(c.money.since)}</span><AgeChip a={c.money} />
            </span>
            <span className="col-span-2 lg:col-span-1"><Actions c={c} action="Collect" message={message(c)} /></span>
          </div>
        ))}
      </div>
      {!settings.upiVpa && rows.length > 0 && <p className="text-sm text-muted">Add your UPI ID in Admin to include a pay link in the WhatsApp message.</p>}
    </div>
  );
}
