// Ledger math: vessels held, money owed, and how old the oldest uncleared item is.
// Pure functions over plain objects (Mongo docs or literals) so they test without a DB.
// Money is handled as one more "product" counted in paise, so one FIFO covers everything.

const PRODUCTS = ['small_jar', 'big_jar', 'small_bottle', 'big_bottle'];
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }); // en-CA → YYYY-MM-DD

const day = (d) => (typeof d === 'string' ? d.slice(0, 10) : ymd.format(d));
const addDays = (dayStr, n) => {
  const t = new Date(`${dayStr}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const paise = (rs) => Math.round((rs || 0) * 100);

// Orders, collections and settlements → flat ledger lines {date, due?, product, kind: out|in, qty}.
function toLines({ orders = [], collections = [], settlements = [] }) {
  const lines = [];
  const add = (date, product, kind, qty, due) => qty > 0 && lines.push({ date, product, kind, qty, due });

  for (const o of orders) {
    const date = day(o.date);
    const due = o.dueDate ? day(o.dueDate) : addDays(date, 1);
    for (const p of PRODUCTS) {
      add(date, p, 'out', o.qty?.[p], due);
      add(date, p, 'in', o.emptiesBack?.[p]);
    }
    add(date, 'money', 'out', paise(o.total), addDays(date, 1));
    add(date, 'money', 'in', paise(o.paidAmount));
  }
  for (const c of collections) {
    const date = day(c.date);
    for (const p of PRODUCTS) add(date, p, 'in', c.returned?.[p]);
    add(date, 'money', 'in', paise(c.amount));
  }
  for (const s of settlements) {
    const date = day(s.date);
    for (const p of PRODUCTS) add(date, p, 'in', s.lost?.[p]);
    add(date, 'money', 'in', paise(s.amount));
  }
  return lines;
}

// Oldest open lot in a set → since when it has been out, when it was due, and how late it is.
function age(open, today) {
  const min = (key) => open.reduce((m, l) => (!m || l[key] < m ? l[key] : m), null);
  const [since, due] = [min('date'), min('due')];
  return {
    since, due,
    daysOld: since ? daysBetween(since, today) : 0,
    daysLate: due && due < today ? daysBetween(due, today) : 0,
    pending: Boolean(since && since < today),
  };
}

// One customer's lines → what they still hold/owe and since when (as of `today`, YYYY-MM-DD).
function summarize(lines, today) {
  // Same day: deliveries before returns, so empties handed back at the door clear older lots first.
  const sorted = [...lines].sort((a, b) =>
    a.date === b.date ? (a.kind === 'out' ? 0 : 1) - (b.kind === 'out' ? 0 : 1) : a.date < b.date ? -1 : 1);

  const lots = {};
  let credit = 0; // paise paid beyond what was owed; used up by the next bills
  for (const l of sorted) {
    const q = (lots[l.product] ??= []);
    if (l.kind === 'out') {
      let qty = l.qty;
      if (l.product === 'money') { const use = Math.min(credit, qty); credit -= use; qty -= use; }
      if (qty) q.push({ date: l.date, due: l.due, qty });
      continue;
    }
    let left = l.qty;
    while (left > 0 && q.length) {
      const take = Math.min(left, q[0].qty);
      q[0].qty -= take;
      left -= take;
      if (!q[0].qty) q.shift();
    }
    // Extra cash is the customer's credit. Extra vessels are not ours (customers can buy their own jars), so they're ignored.
    if (l.product === 'money') credit += left;
  }

  const remaining = Object.values(lots).flat();
  const total = (p) => (lots[p] || []).reduce((s, l) => s + l.qty, 0);
  const held = Object.fromEntries(PRODUCTS.map((p) => [p, total(p)]).filter(([, n]) => n > 0));
  const oldestDate = remaining.reduce((min, l) => (!min || l.date < min ? l.date : min), null);
  const due = remaining.reduce((min, l) => (!min || l.due < min ? l.due : min), null);

  return {
    held,
    owed: total('money') / 100,
    credit: credit / 100,
    oldestDate,
    daysOld: oldestDate ? daysBetween(oldestDate, today) : 0,
    due, // earliest due date still open: === today → "due today", < today → late
    daysLate: due && due < today ? daysBetween(due, today) : 0,
    // Items and money aged on their own: someone can be late on jars but fully paid, or the other way round.
    qty: age(PRODUCTS.flatMap((p) => lots[p] || []), today),
    money: age(lots.money || [], today),
    pending: remaining.some((l) => l.date < today), // not cleared from a previous day
    overdue: remaining.some((l) => l.due < today), // past its return/payment due date
  };
}

// All docs → Map(customerId → summary).
function summarizeAll({ orders = [], collections = [], settlements = [] }, today) {
  const byCustomer = new Map();
  const group = (key, doc) => {
    const id = String(doc.customer?._id ?? doc.customer);
    if (!byCustomer.has(id)) byCustomer.set(id, { orders: [], collections: [], settlements: [] });
    byCustomer.get(id)[key].push(doc);
  };
  orders.forEach((d) => group('orders', d));
  collections.forEach((d) => group('collections', d));
  settlements.forEach((d) => group('settlements', d));
  return new Map([...byCustomer].map(([id, docs]) => [id, summarize(toLines(docs), today)]));
}

// Rows for the daily/weekly report: one per customer with anything pending, oldest first.
function pendingReport(docs, today) {
  return [...summarizeAll(docs, today)]
    .map(([customer, s]) => ({ customer, ...s }))
    .filter((r) => r.pending)
    .sort((a, b) => (a.oldestDate < b.oldestDate ? -1 : a.oldestDate > b.oldestDate ? 1 : 0));
}

// One customer's history as a statement: every entry with its vessel/money effect and running balances.
function statement({ orders = [], collections = [], settlements = [] }) {
  const vessels = (add = {}, sub = {}) => Object.fromEntries(
    PRODUCTS.map((p) => [p, (add[p] || 0) - (sub[p] || 0)]).filter(([, n]) => n),
  );
  const rows = [
    ...orders.map((o) => ({ kind: 'order', doc: o, vessels: vessels(o.qty, o.emptiesBack), billed: o.total || 0, paid: o.paidAmount || 0 })),
    ...collections.map((c) => ({ kind: 'collection', doc: c, vessels: vessels({}, c.returned), billed: 0, paid: c.amount || 0 })),
    ...settlements.map((s) => ({ kind: 'settlement', doc: s, vessels: vessels({}, s.lost), billed: 0, paid: s.amount || 0 })),
  ].sort((a, b) => day(a.doc.date).localeCompare(day(b.doc.date)) || String(a.doc.createdAt).localeCompare(String(b.doc.createdAt)));

  const held = Object.fromEntries(PRODUCTS.map((p) => [p, 0]));
  let net = 0; // paise; negative = credit
  return rows.map(({ kind, doc, vessels: v, billed, paid }) => {
    for (const [p, n] of Object.entries(v)) held[p] = Math.max(0, held[p] + n); // extra returns aren't ours
    net += paise(billed) - paise(paid);
    return {
      kind, id: doc._id, date: day(doc.date), vessels: v, billed, paid, method: doc.method, note: doc.reason || doc.address,
      by: doc.createdBy, editedBy: doc.updatedBy,
      held: Object.fromEntries(Object.entries(held).filter(([, n]) => n)), balance: net / 100,
    };
  });
}

module.exports = { PRODUCTS, day, addDays, toLines, summarize, summarizeAll, pendingReport, statement };
