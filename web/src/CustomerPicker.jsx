import { useState } from 'react';
import { Field, isMobile, normalizePhone, rupees, vesselText } from './ui.jsx';

// Choosing a customer, the same way on every screen. The phone number is the account:
// only a number selects (or creates) a customer. The name search just finds someone's number.
export function CustomerPicker({ customers, phone, onPhone, names }) {
  const [finding, setFinding] = useState(false);
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const hits = needle.length < 2 ? [] : customers
    .filter((c) => [c.name, c.nameGu].some((v) => v?.toLowerCase().includes(needle)) || c.phone?.includes(needle))
    .slice(0, 8);
  const digits = normalizePhone(phone);
  const bad = digits.length >= 10 && !isMobile(digits);

  return (
    <div className="space-y-2">
      <Field label="Customer phone number">
        <input className="input text-lg tracking-wide" type="tel" inputMode="tel" autoComplete="off" required placeholder="10-digit mobile"
          aria-invalid={bad} value={phone} onChange={(e) => onPhone(e.target.value)} />
      </Field>
      {bad && <p role="alert" className="text-sm text-bad">Enter a 10-digit mobile number (starting 6, 7, 8 or 9).</p>}
      <button type="button" className="text-sm font-semibold text-accent underline" aria-expanded={finding} onClick={() => setFinding(!finding)}>
        {finding ? 'Hide name search' : 'Don’t know the number? Find by name'}
      </button>
      {finding && (
        <div className="space-y-2 rounded-xl border border-line bg-bg p-3">
          <input className="input" type="search" autoFocus aria-label="Find customer by name" placeholder="Type a name" value={q} onChange={(e) => setQ(e.target.value)} />
          {needle.length >= 2 && !hits.length && <p className="text-sm text-muted">No customer found with that name. Ask for their number.</p>}
          {hits.map((c) => (
            <button key={c._id} type="button" className="btn h-auto w-full justify-between py-2 text-left" onClick={() => { onPhone(c.phone); setFinding(false); setQ(''); }}>
              <span>
                <span className="block font-semibold">{c.name}</span>
                <span className="block text-xs font-normal text-muted">
                  {[vesselText(c.held, names) && `holding ${vesselText(c.held, names)}`, c.owed > 0 && `owes ${rupees(c.owed)}`].filter(Boolean).join(' · ') || 'all clear'}
                </span>
              </span>
              <span className="shrink-0 text-sm">{c.phone}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
