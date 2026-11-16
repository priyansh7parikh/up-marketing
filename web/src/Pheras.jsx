import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Field, Icon, PRODUCTS, PageHead, Status, Stepper, fmtDay, go, today, useApp, useLoad, vesselText, TooMany } from './ui.jsx';

const zero = () => Object.fromEntries(PRODUCTS.map((p) => [p, 0]));
const nowTime = () => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date());
const addUp = (list, pick) => Object.fromEntries(PRODUCTS.map((p) => [p, list.reduce((n, x) => n + (pick(x)?.[p] || 0), 0)]));
const minutes = (p) => {
  if (!p.endTime) return 0;
  const [h1, m1] = p.startTime.split(':').map(Number);
  const [h2, m2] = p.endTime.split(':').map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
};
const duration = (min) => (min ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : '');

export function Pheras() {
  const { names } = useApp();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const { data, ...status } = useLoad(() => api('GET', `/pheras?from=${from}&to=${to}`), [from, to]);
  const range = from === to ? (from === today() ? 'today' : `on ${fmtDay(from)}`) : `${fmtDay(from)} to ${fmtDay(to)}`;

  // One card per team: what it sold in the period.
  const teams = Object.values((data || []).reduce((acc, p) => {
    const id = p.team?._id || 'none';
    (acc[id] ||= { id, name: p.team?.name || 'Unknown team', rounds: [] }).rounds.push(p);
    return acc;
  }, {})).sort((a, b) => a.name.localeCompare(b.name));
  const all = addUp(data || [], (p) => p.sold);

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Daily rounds" title="Pheras" sub="What each team took out, brought back and sold."
        action={<a href="#/pheras/new" className="btn btn-primary"><Icon name="plus" className="h-4 w-4" /> Start phera</a>} />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="From"><input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input" type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <Status {...status} />
      <TooMany list={data} />

      {data && (
        <div className="card overflow-hidden p-0">
          <div className="p-5">
            <h2 className="font-display text-lg">Sold {range}</h2>
            <p className="text-sm text-muted">All teams together. Sold = filled out − filled back.</p>
          </div>
          <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
            {PRODUCTS.map((p) => (
              <div key={p} className="bg-surface p-4">
                <div className="text-xs font-semibold text-muted">{names[p]} sold</div>
                <div className="font-display text-2xl font-semibold">{all[p]}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && !data.length && <p className="card text-center text-muted">No pheras recorded {range}.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {teams.map((t) => {
          const sold = addUp(t.rounds, (p) => p.sold);
          // Rounds in time order, numbered per day: a team does 2–4 rounds a day on different routes.
          const rounds = [...t.rounds].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
            .map((p, i, all) => ({ ...p, n: all.slice(0, i).filter((x) => x.date === p.date).length + 1 }));
          const time = t.rounds.reduce((n, p) => n + minutes(p), 0);
          return (
            <section key={t.id} className="card space-y-3 p-0">
              <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-5">
                <div>
                  <h2 className="font-display text-lg">{t.name}</h2>
                  <p className="text-sm text-muted">{t.rounds.length} round{t.rounds.length === 1 ? '' : 's'}{time ? ` · ${duration(time)} on route` : ''}</p>
                </div>
                <span className="chip chip-accent">sold {vesselText(sold, names) || 'nothing yet'}</span>
              </div>
              <div>
                {rounds.map((p) => (
                  <a key={p._id} href={`#/pheras/${p._id}`} className="block space-y-1 border-t border-line px-5 py-3 hover:bg-bg/60">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><span className="font-semibold">{from !== to && `${fmtDay(p.date)} · `}Round {p.n}</span> <span className="text-sm text-muted">{p.startTime} – {p.endTime || '…'}</span></span>
                      {p.endTime ? <span className="text-xs text-muted">{duration(minutes(p))}</span> : <span className="chip chip-warn">out now · tap to close</span>}
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted">
                          <th scope="col" className="py-1 text-left font-semibold">Item</th>
                          {['Out', 'Back', 'Empties', 'Sold'].map((h) => <th key={h} scope="col" className="py-1 text-right font-semibold">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {PRODUCTS.filter((k) => p.filledOut?.[k] || p.filledBack?.[k] || p.emptiesBack?.[k]).map((k) => (
                          <tr key={k} className="border-t border-line">
                            <th scope="row" className="py-1.5 text-left font-semibold">{names[k]}</th>
                            <td className="text-right">{p.filledOut?.[k] || 0}</td>
                            <td className="text-right">{p.filledBack?.[k] || 0}</td>
                            <td className="text-right">{p.emptiesBack?.[k] || 0}</td>
                            <td className="text-right font-bold text-accent">{p.endTime ? p.sold?.[k] || 0 : '–'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="text-xs text-faint">by {p.createdBy?.name || 'system'}{p.updatedBy && ` · edited by ${p.updatedBy.name}`}</div>
                  </a>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function PheraForm({ id }) {
  const app = useApp();
  const teams = useLoad(() => api('GET', '/teams'));
  const existing = useLoad(() => (id ? api('GET', `/pheras/${id}`) : Promise.resolve(null)), [id]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existing.loading || form) return;
    const p = existing.data;
    setForm(p ? {
      date: p.date, team: p.team?._id || '', startTime: p.startTime, endTime: p.endTime || '',
      filledOut: { ...zero(), ...p.filledOut }, filledBack: { ...zero(), ...p.filledBack }, emptiesBack: { ...zero(), ...p.emptiesBack },
    } : { date: today(), team: '', startTime: nowTime(), endTime: '', filledOut: zero(), filledBack: zero(), emptiesBack: zero() });
  }, [existing.loading, existing.data, form]);

  if (existing.error || teams.error) return <Status error={existing.error || teams.error} />;
  if (!form || !teams.data) return <Status loading />;

  const open = existing.data && !existing.data.endTime; // the team is still out: this visit is to close the round
  const options = teams.data.filter((t) => t.active || t._id === form.team);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setQty = (group, p) => (n) => setForm({ ...form, [group]: { ...form[group], [p]: n } });
  const sold = Object.fromEntries(PRODUCTS.map((p) => [p, form.filledOut[p] - form.filledBack[p]]));
  const tooMany = PRODUCTS.filter((p) => sold[p] < 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!PRODUCTS.some((p) => form.filledOut[p])) return setError('Enter what the team took out.');
    if (tooMany.length) return setError(`More ${tooMany.map((p) => app.names[p]).join(', ')} came back filled than went out.`);
    setBusy(true);
    setError('');
    try {
      if (id) await api('PUT', `/pheras/${id}`, { ...form, __v: existing.data.__v }); else await api('POST', '/pheras', form);
      go('/pheras');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm('Delete this phera?')) return;
    try { await api('DELETE', `/pheras/${id}`); go('/pheras'); } catch (e) { setError(e.message); }
  };

  if (!options.length) {
    return (
      <div className="card max-w-xl space-y-2">
        <h1 className="h1">No teams yet</h1>
        <p className="text-muted">{app.user.role === 'admin' ? <>Add your teams under <a className="underline" href="#/admin">Admin</a> first.</> : 'Ask an admin to add the teams first.'}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-4">
      <PageHead eyebrow="Daily round" title={!id ? 'Start a phera' : open ? 'Close this phera' : 'Edit phera'}
        sub={open ? 'The team is back: enter the end time and what came back.' : 'Record what the team takes out. Add what came back when they return.'} />
      {existing.data && <div className="text-xs text-faint">added by {existing.data.createdBy?.name || 'system'}{existing.data.updatedBy && ` · edited by ${existing.data.updatedBy.name}`}</div>}

      <div className="card grid gap-4 sm:grid-cols-2">
        <Field label="Team">
          <select className="input" required value={form.team} onChange={set('team')}>
            <option value="">Choose…</option>
            {options.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input className="input" type="date" required max={today()} value={form.date} onChange={set('date')} /></Field>
        <Field label="Start time"><input className="input" type="time" required value={form.startTime} onChange={set('startTime')} /></Field>
        <Field label="End time (when back)">
          <span className="flex gap-2">
            <input className="input" type="time" min={form.startTime} value={form.endTime} onChange={set('endTime')} />
            <button type="button" className="btn shrink-0" onClick={() => setForm({ ...form, endTime: nowTime() })}>Now</button>
          </span>
        </Field>
      </div>

      <fieldset className="card space-y-2">
        <legend className="label px-1">Filled, going out</legend>
        <div className="grid gap-2 sm:grid-cols-2">{PRODUCTS.map((p) => <Stepper key={p} label={app.selling.phera.includes(p) ? app.names[p] : `${app.names[p]} · not selling`} max={app.selling.phera.includes(p) ? Infinity : existing.data?.filledOut?.[p] || 0} value={form.filledOut[p]} onChange={setQty('filledOut', p)} />)}</div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="card space-y-2">
          <legend className="label px-1">Filled, came back (not sold)</legend>
          {PRODUCTS.map((p) => <Stepper key={p} label={app.names[p]} value={form.filledBack[p]} onChange={setQty('filledBack', p)} />)}
        </fieldset>
        <fieldset className="card space-y-2">
          <legend className="label px-1">Empties, came back</legend>
          {PRODUCTS.map((p) => <Stepper key={p} label={app.names[p]} value={form.emptiesBack[p]} onChange={setQty('emptiesBack', p)} />)}
        </fieldset>
      </div>

      <div className="card" aria-live="polite">
        <span className="label mb-1">Sold (filled out − filled back)</span>
        <div className={`font-display text-2xl font-semibold ${tooMany.length ? 'text-bad' : 'text-accent'}`}>
          {tooMany.length ? `Check ${tooMany.map((p) => app.names[p]).join(', ')}: more came back than went out` : vesselText(sold, app.names) || '0'}
        </div>
      </div>

      {error && <p role="alert" className="text-bad">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : open && form.endTime ? 'Close phera' : 'Save phera'}</button>
        <button type="button" className="btn" onClick={() => window.history.back()}>Cancel</button>
        {id && app.user.role === 'admin' && <button type="button" className="btn btn-danger ml-auto" onClick={remove}>Delete</button>}
      </div>
    </form>
  );
}
