import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { AppCtx, Field, Icon, Status, go, initials, useApp, useLoad, useRoute } from './ui.jsx';
import { CustomerDetail, Customers } from './Customers.jsx';
import { OrderForm, Orders } from './Orders.jsx';
import Overview from './Overview.jsx';
import { PheraForm, Pheras } from './Pheras.jsx';
import { ReturnForm, Returns } from './Returns.jsx';
import Settings from './Settings.jsx';

function Logo() {
  return (
    <span className="flex items-center gap-3">
      <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime font-display text-sm font-extrabold text-side">UP</span>
      <span className="font-display text-lg font-bold tracking-tight">UP MARKETING</span>
    </span>
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
    <main className="flex min-h-full items-center justify-center bg-side p-4">
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
      </form>
    </main>
  );
}

const TABS = [
  { id: 'overview', href: '#/', label: 'Overview', icon: 'box' },
  { id: 'orders', href: '#/orders', label: 'Orders', long: 'All orders', icon: 'clipboard' },
  { id: 'returns', href: '#/returns', label: 'Returns', icon: 'rotate' },
  { id: 'pheras', href: '#/pheras', label: 'Pheras', icon: 'truck' },
  { id: 'pending', href: '#/customers?pending=1', label: 'Pending', long: 'Pending report', icon: 'alert', more: true },
  { id: 'customers', href: '#/customers', label: 'Customers', icon: 'users', more: true },
  { id: 'settings', href: '#/settings', label: 'Settings', icon: 'sliders', admin: true, more: true },
];

function Shell({ user, onLogout, active, routeKey, children }) {
  const tabs = TABS.filter((t) => !t.admin || user.role === 'admin');
  // Refetched on every navigation so the badge follows new orders and returns.
  const customers = useLoad(() => api('GET', '/customers'), [routeKey]);
  const overdue = (customers.data || []).filter((c) => c.overdue).length;
  const badge = (t) => t.id === 'pending' && overdue > 0 && (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1 text-xs font-bold text-white" aria-label={`${overdue} overdue`}>{overdue}</span>
  );

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* Laptop: sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-side p-5 text-side-fg lg:flex">
        <div className="mb-8 text-white"><Logo /></div>
        <div className="mb-2 px-3 text-xs font-semibold tracking-widest text-side-fg/60 uppercase">Workspace</div>
        <nav className="flex flex-col gap-1">
          {tabs.map((t) => (
            <a key={t.id} href={t.href} aria-current={active === t.id ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-sm ${active === t.id ? 'bg-lime font-semibold text-side' : 'hover:bg-white/5 hover:text-white'}`}>
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
          <button className="rounded-lg px-2 py-1 text-xs underline hover:text-white" onClick={onLogout}>Sign out</button>
        </div>
      </aside>

      {/* Phone: top bar */}
      <header className="flex items-center justify-between bg-side px-4 py-3 text-white lg:hidden">
        <Logo />
        <button className="text-xs text-side-fg underline" onClick={onLogout}>Sign out</button>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-10 lg:pb-10">{children}</main>

      {/* Phone: bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {[...tabs.filter((t) => !t.more), { id: 'more', href: '#/more', label: 'More', icon: 'sliders' }].map((t) => (
          <a key={t.id} href={t.href} aria-current={active === t.id || (t.id === 'more' && tabs.some((x) => x.more && x.id === active)) ? 'page' : undefined}
            className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active === t.id || (t.id === 'more' && tabs.some((x) => x.more && x.id === active)) ? 'border-t-2 border-accent text-accent' : 'text-muted'}`}>
            <Icon name={t.icon} />{t.label}
            {t.id === 'more' && overdue > 0 && <span className="absolute top-1.5 left-1/2 ml-2 h-2 w-2 rounded-full bg-bad" />}
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
      <p className="pt-2 text-sm text-muted">Signed in as {user.name} ({user.role}).</p>
    </div>
  );
}

function Page({ parts, query }) {
  const [section, a] = parts;
  if (section === 'orders') {
    if (a) return <OrderForm key={a} id={a === 'new' ? null : a} presetCustomer={query.customer} />;
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
  if (section === 'more') return <More />;
  if (section === 'settings') return <Settings />;
  if (section === 'customers') {
    if (a) return <CustomerDetail key={a} id={a} />;
    return <Customers key={query.pending || 'all'} pendingOnly={Boolean(query.pending)} />;
  }
  return <Overview />;
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
    prices: {
      regular: Object.fromEntries(meta.products.map((p) => [p.key, p.price])),
      party: Object.fromEntries(meta.products.map((p) => [p.key, p.partyPrice || 0])),
    },
  }, [user, meta, loadMeta]);

  if (user === undefined) return <div className="p-4"><Status loading /></div>;
  if (!user) return <Login onLogin={setUser} />;
  if (!ctx) return <div className="p-4"><Status loading /></div>;

  const logout = () => api('POST', '/auth/logout').finally(() => { setUser(null); go('/'); });
  const section = route.parts[0] || 'overview';
  const active = section === 'customers' && route.query.pending && !route.parts[1] ? 'pending' : section;
  return (
    <AppCtx.Provider value={ctx}>
      <Shell user={user} onLogout={logout} active={active} routeKey={window.location.hash}>
        <Page {...route} />
      </Shell>
    </AppCtx.Provider>
  );
}
