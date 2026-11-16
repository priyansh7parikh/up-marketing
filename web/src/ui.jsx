import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export const BUSINESS = 'UP MARKETING';
export const PRODUCTS = ['small_jar', 'big_jar', 'small_bottle', 'big_bottle'];
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
export const today = () => ymd.format(new Date());
export const addDays = (d, n) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
export const fmtDay = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
export const rupees = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

// Hash routing: '#/customers/123?x=1' → { parts: ['customers', '123'], query }.
export function useRoute() {
  const read = () => {
    const [path, qs] = window.location.hash.replace(/^#\/?/, '').split('?');
    return { parts: path.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(qs)) };
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
export const go = (path) => { window.location.hash = path; };

export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => {
    fn().then((data) => setState({ data }), (e) => setState({ error: e.message }));
  }, deps);
  useEffect(reload, [reload]);
  return { ...state, reload };
}

export function Status({ loading, error }) {
  if (error) return <p role="alert" className="card border-bad/50 text-bad">{error}</p>;
  if (loading) return <p className="text-muted">Loading…</p>;
  return null;
}

export function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

// Short codes used wherever space is tight. L = litres, J = jar, B = bottle.
export const SHORT = { small_jar: '10L J', big_jar: '20L J', small_bottle: '10L B', big_bottle: '20L B' };

// "2 × 20L J, 1 × 10L J" from { big_jar: 2, small_jar: 1 }. signed → "+2 × 20L J, −1 × 10L J".
export function vesselText(v, _names, signed = false) {
  return PRODUCTS.filter((p) => v?.[p]).map((p) => `${signed ? (v[p] > 0 ? '+' : '−') : ''}${Math.abs(v[p])} × ${SHORT[p]}`).join(', ');
}

export function Legend({ className = '' }) {
  const { names } = useApp();
  return <p className={`text-xs text-muted ${className}`}>{PRODUCTS.map((p) => `${SHORT[p]} = ${names[p]}`).join(' · ')}</p>;
}

// The due/late label for a customer summary.
export function DueChip({ s }) {
  if (!s?.pending && !s?.due) return null;
  if (s.overdue) return <span className="chip chip-bad">late {s.daysLate} day{s.daysLate === 1 ? '' : 's'}</span>;
  if (s.due === today()) return <span className="chip chip-warn">due today</span>;
  return s.due ? <span className="chip">due {fmtDay(s.due)}</span> : null;
}

// Same rule as the server: a customer is their 10-digit mobile number.
export function normalizePhone(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  return d;
}
export const isMobile = (v) => /^[6-9]\d{9}$/.test(normalizePhone(v));

const digits = (phone) => (phone || '').replace(/\D/g, '');
export const telHref = (phone) => `tel:${phone}`;
export const waHref = (phone, text) => {
  const d = digits(phone);
  return `https://wa.me/${d.length === 10 ? `91${d}` : d}?text=${encodeURIComponent(text)}`;
};
export const upiHref = ({ vpa, name, amount, note }) =>
  `upi://pay?${new URLSearchParams({ pa: vpa, pn: name || 'Payment', am: amount.toFixed(2), cu: 'INR', tn: note || '' })}`;

// − [n] + with large tap targets; n is a whole number ≥ 0.
// max: a switched-off item can't go above what the entry already had (0 on a new one).
export function Stepper({ label, value, onChange, max = Infinity }) {
  const set = (n) => onChange(Math.min(max, Math.max(0, Math.floor(Number(n) || 0))));
  return (
    <div className={`flex items-center justify-between gap-2 rounded-xl border border-line py-1.5 pr-1.5 pl-3 ${max === 0 ? 'opacity-50' : ''}`}>
      <span className="text-sm">{label}</span>
      <div className="flex items-center">
        <button type="button" className="btn w-11 px-0" aria-label={`Less ${label}`} disabled={!value} onClick={() => set(value - 1)}>−</button>
        <input
          className="input w-12 border-0 bg-transparent px-1 text-center font-semibold" inputMode="numeric" aria-label={label}
          value={value || ''} placeholder="0" disabled={max === 0} onChange={(e) => set(e.target.value)}
        />
        <button type="button" className="btn w-11 px-0" aria-label={`More ${label}`} disabled={value >= max} onClick={() => set(value + 1)}>+</button>
      </div>
    </div>
  );
}

export const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export function Avatar({ name }) {
  return <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ok-soft text-xs font-bold text-accent">{initials(name)}</span>;
}

export function PageHead({ eyebrow, title, sub, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="h1">{title}</h1>
        {sub && <p className="mt-1 text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

// Icon set taken from the Figma design (24px stroke icons).
const ICONS = {
  box: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" /><path d="M12 11v10" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5M8 9h8M8 13h8M8 17h5" /></>,
  rotate: <><path d="M4 4v6h6" /><path d="M5.6 15a8 8 0 1 0 .5-7.5L4 10" /></>,
  alert: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4M12 17h.01" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  sliders: <><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></>,
  home: <><path d="M3 11 12 3l9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
  truck: <><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  rupee: <path d="M7 5h10M7 9h10M7 5h3a4 4 0 0 1 0 8H7l7 7" />,
};
export function Icon({ name, className = 'h-[18px] w-[18px]' }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search customers or phone' }) {
  return (
    <label className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-line bg-bg px-3 text-faint focus-within:border-accent sm:w-72">
      <Icon name="search" className="h-4 w-4" />
      <input type="search" className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-faint" aria-label={placeholder} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// Cancel (or restore) an order or a return entered by mistake. Anyone can; it stays on record, counts for nothing, and is audited.
export function CancelToggle({ path, cancelled, what, onDone, onError }) {
  const toggle = async () => {
    if (!window.confirm(cancelled ? `Restore this ${what}? It counts again.` : `Cancel this ${what}? It stays on record but counts for nothing.`)) return;
    try { await api('PUT', path, { cancelled: !cancelled }); onDone(); } catch (e) { onError(e.message); }
  };
  return <button type="button" className={`btn ${cancelled ? '' : 'btn-danger'}`} onClick={toggle}>{cancelled ? `Restore ${what}` : `Cancel ${what}`}</button>;
}

export const CancelledNote = ({ what }) => (
  <p role="status" className="rounded-2xl border border-bad/30 bg-bad-soft p-4 font-semibold text-bad">This {what} is cancelled. It is kept for the record but counts for nothing.</p>
);
