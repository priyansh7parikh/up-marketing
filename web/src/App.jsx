import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { AppCtx, Field, Icon, Status, go, initials, useApp, useLoad, useRoute } from './ui.jsx';
import { CustomerDetail, Customers, SettleForm } from './Customers.jsx';
import { OrderForm, Orders } from './Orders.jsx';
import Today from './Today.jsx';
import { PendingQty, Ughrani } from './Pending.jsx';
import { PheraForm, Pheras } from './Pheras.jsx';
import { ReturnForm, Returns } from './Returns.jsx';
import Admin, { Password } from './Admin.jsx';
import Public from './Public.jsx';

function Logo() {
  return (
    <a href="#/" aria-label="UP MARKETING, go to Today" className="flex items-center gap-3">
      <span aria-hidden="true" className="flex h-9 w-9 -rotate-45 items-center justify-center rounded-[50%_50%_50%_0] bg-white"><span className="rotate-45 font-display text-xs font-extrabold text-accent">UP</span></span>
      <span className="font-display text-lg font-bold tracking-tight">UP MARKETING</span>
    </a>
  );
}

function Login({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { onLogin(await api('POST', '/auth/login', form)); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <main className="side-grad flex min-h-full items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <Logo />
        <p className="text-sm text-muted">Sign in to track orders, returns and payments.</p>
        <Field label="Username">
          <input className="input" autoComplete="username" autoCapitalize="none" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {error && <p role="alert" className="text-bad">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <a href="#/info" className="block text-center text-sm text-muted underline">Customers: prices and contact</a>
      </form>
    </main>
  );
}

const TABS = [
  { id: 'today', href: '#/', label: 'Today', icon: 'home' },
  { id: 'orders', href: '#/orders', label: 'Orders', icon: 'clipboard' },
  { id: 'returns', href: '#/returns', label: 'Returns', icon: 'rotate' },
  { id: 'pheras', href: '#/pheras', label: 'Pheras', icon: 'truck' },
  { id: 'pending', href: '#/pending', label: 'Pending items', icon: 'alert', more: true },
  { id: 'ughrani', href: '#/ughrani', label: 'Ughrani', long: 'Ughrani (dues)', icon: 'rupee', more: true },
  { id: 'customers', href: '#/customers', label: 'Customers', icon: 'users', more: true },
  { id: 'admin', href: '#/admin', label: 'Admin', icon: 'sliders', admin: true, more: true },
];

function Shell({ user, onLogout, active, showFab, children }) {
  const tabs = TABS.filter((t) => !t.admin || user.role === 'admin');
  // Refetched when the section changes (not on every form opened): it reads every customer's whole ledger.
  const customers = useLoad(() => api('GET', '/customers'), [active]);
  const overdue = (customers.data || []).filter((c) => c.qty?.daysLate > 0).length;
  const dues = (customers.data || []).filter((c) => c.owed > 0).length;
  const counts = { pending: [overdue, 'late'], ughrani: [dues, 'to collect from'] };
  const badge = (t) => counts[t.id]?.[0] > 0 && (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1 text-xs font-bold text-white" aria-label={`${counts[t.id][0]} ${counts[t.id][1]}`}>{counts[t.id][0]}</span>
  );

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* Laptop: sidebar */}
      {/* Stays on screen while the page scrolls, so Sign out is always visible */}
      <aside className="side-grad hidden w-64 shrink-0 flex-col overflow-y-auto p-5 text-side-fg lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start">
        <div className="mb-8 text-white"><Logo /></div>
        <div className="mb-2 px-3 text-xs font-semibold tracking-widest text-side-fg/70 uppercase">Workspace</div>
        <nav className="flex flex-col gap-1">
          {tabs.map((t) => (
            <a key={t.id} href={t.href} aria-current={active === t.id ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${active === t.id ? 'bg-white font-bold text-accent shadow-sm' : 'font-medium hover:bg-white/10 hover:text-white'}`}>
              <Icon name={t.icon} />{t.long || t.label}{badge(t)}
            </a>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 border-t border-white/10 pt-4">
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">{initials(user.name)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-white">{user.name}</span>
            <span className="block text-xs capitalize">{user.role}</span>
          </span>
          <span className="flex flex-col items-end text-xs">
            <button className="underline hover:text-white" onClick={onLogout}>Sign out</button>
            <a className="underline hover:text-white" href="#/password">Password</a>
          </span>
        </div>
      </aside>

      {/* Phone: top bar */}
      <header className="side-grad flex items-center justify-between px-4 py-3 text-white lg:hidden">
        <Logo />
        <button className="text-xs text-side-fg underline" onClick={onLogout}>Sign out</button>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-10 lg:pb-10">{children}</main>

      {/* Phone: the most common action is always one tap away */}
      {showFab && <a href="#/orders/new" className="btn btn-primary fixed right-4 bottom-20 z-10 rounded-full px-5 shadow-lg lg:hidden"><Icon name="plus" className="h-4 w-4" /> New order</a>}

      {/* Phone: bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {[...tabs.filter((t) => !t.more), { id: 'more', href: '#/more', label: 'More', icon: 'sliders' }].map((t) => (
          <a key={t.id} href={t.href} aria-current={active === t.id || (t.id === 'more' && tabs.some((x) => x.more && x.id === active)) ? 'page' : undefined}
            className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active === t.id || (t.id === 'more' && tabs.some((x) => x.more && x.id === active)) ? 'border-t-2 border-accent text-accent' : 'text-muted'}`}>
            <Icon name={t.icon} />{t.label}
            {t.id === 'more' && overdue + dues > 0 && <span className="absolute top-1.5 left-1/2 ml-2 h-2 w-2 rounded-full bg-bad" />}
          </a>
        ))}
      </nav>
    </div>
  );
}

// Phone only: the sections that don't fit in the bottom bar.
function More() {
  const { user } = useApp();
  return (
    <div className="space-y-3">
      <h1 className="h1">More</h1>
      {TABS.filter((t) => t.more && (!t.admin || user.role === 'admin')).map((t) => (
        <a key={t.id} href={t.href} className="card flex items-center gap-3 font-semibold hover:border-accent"><Icon name={t.icon} />{t.label}<Icon name="chevron" className="ml-auto h-4 w-4" /></a>
      ))}
      <a href="#/password" className="card flex items-center gap-3 font-semibold hover:border-accent"><Icon name="sliders" />Change my password<Icon name="chevron" className="ml-auto h-4 w-4" /></a>
      <p className="pt-2 text-sm text-muted">Signed in as {user.name} ({user.role}).</p>
    </div>
  );
}

function Page({ parts, query }) {
  const [section, a] = parts;
  if (section === 'orders') {
    if (a) return <OrderForm key={a + (query.addTo || '')} id={a === 'new' ? null : a} presetCustomer={query.customer} addTo={query.addTo} />;
    return <Orders />;
  }
  if (section === 'returns') {
    if (a) return <ReturnForm key={a} id={a === 'new' ? null : a} presetCustomer={query.customer} />;
    return <Returns />;
  }
  if (section === 'pheras') {
    if (a) return <PheraForm key={a} id={a === 'new' ? null : a} />;
    return <Pheras />;
  }
  if (section === 'pending') return <PendingQty />;
  if (section === 'ughrani') return <Ughrani />;
  if (section === 'more') return <More />;
  if (section === 'admin' || section === 'settings') return <Admin />;
  if (section === 'password') return <Password />;
  if (section === 'customers') {
    if (a && parts[2] === 'settle') return <SettleForm key={a} id={a} />;
    if (a) return <CustomerDetail key={a} id={a} />;
    return <Customers key={`${query.pending}${query.q}`} pendingOnly={Boolean(query.pending)} initialQ={query.q} />;
  }
  return <Today />;
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = logged out
  const [meta, setMeta] = useState(null);
  const route = useRoute();

  useEffect(() => {
    api('GET', '/auth/me').then(setUser, () => setUser(null));
    const out = () => setUser(null);
    window.addEventListener('upm:logout', out);
    return () => window.removeEventListener('upm:logout', out);
  }, []);

  const loadMeta = useCallback(async () => {
    const [products, settings] = await Promise.all([api('GET', '/products'), api('GET', '/settings')]);
    setMeta({ products, settings });
  }, []);
  useEffect(() => { if (user) loadMeta().catch(() => {}); else setMeta(null); }, [user, loadMeta]);

  const ctx = useMemo(() => meta && {
    user, ...meta, reloadMeta: loadMeta,
    names: Object.fromEntries(meta.products.map((p) => [p.key, p.name])),
    selling: Object.fromEntries([['regular', 'sellRegular'], ['party', 'sellParty'], ['phera', 'sellPhera']].map(([k, f]) => [k, meta.products.filter((p) => p[f] !== false).map((p) => p.key)])),
    prices: {
      regular: Object.fromEntries(meta.products.map((p) => [p.key, p.price])),
      party: Object.fromEntries(meta.products.map((p) => [p.key, p.partyPrice || 0])),
    },
  }, [user, meta, loadMeta]);

  if (route.parts[0] === 'info') return <Public />; // open to everyone, signed in or not
  if (user === undefined) return <div className="p-4"><Status loading /></div>;
  if (!user) return <Login onLogin={setUser} />;
  if (!ctx) return <div className="p-4"><Status loading /></div>;

  const logout = () => api('POST', '/auth/logout').finally(() => { setUser(null); go('/'); });
  const section = route.parts[0] || 'today';
  const active = section === 'settings' ? 'admin' : section;
  return (
    <AppCtx.Provider value={ctx}>
      <Shell user={user} onLogout={logout} active={active} showFab={!route.parts[1] && !['admin', 'settings', 'password', 'more'].includes(section)}>
        <Page {...route} />
      </Shell>
    </AppCtx.Provider>
  );
}
