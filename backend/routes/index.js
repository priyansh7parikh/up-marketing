// All logged-in API routes. Writes go through doc.save()/doc.deleteOne() so the audit log sees them.
const express = require('express');
const mongoose = require('mongoose');
const { requireRole, hashPassword } = require('../lib/auth');
const { asUser, AuditLog } = require('../lib/audit');
const { PRODUCTS, day, summarizeAll, statement } = require('../lib/balances');
const { normalizePhone, MOBILE, Customer, Product, Order, Collection, Settlement, Settings, User, Team, Phera } = require('../models');

const api = express.Router();
const admin = requireRole('admin');
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next); // Express 4 doesn't catch async errors
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));
const today = () => day(new Date());
const notFound = (res) => res.status(404).json({ error: 'Not found' });
const who = 'name';

// ---- products ----
const DEFAULT_PRODUCTS = [
  { key: 'small_jar', name: '10L Jar', nameGu: '૧૦ લિ. જગ', was: 'Small jar' },
  { key: 'big_jar', name: '20L Jar', nameGu: '૨૦ લિ. જગ', was: 'Big jar' },
  { key: 'small_bottle', name: '10L Bottle', nameGu: '૧૦ લિ. બોટલ', was: 'Small bottle' },
  { key: 'big_bottle', name: '20L Bottle', nameGu: '૨૦ લિ. બોટલ', was: 'Big bottle' },
];
async function seedProducts() {
  const have = new Map((await Product.find()).map((p) => [p.key, p]));
  await asUser(null, async () => {
    for (const { was, ...p } of DEFAULT_PRODUCTS) {
      const old = have.get(p.key);
      if (!old) await Product.create({ ...p, price: 0 });
      // One-time rename from the first names; a name an admin has changed is left alone.
      else if (old.name === was) { old.set({ name: p.name, nameGu: p.nameGu }); await old.save(); }
    }
  });
}

// One-time repair for data from before phone numbers were the identity: customers sharing a number become one
// account (the one with the most entries keeps its name), then the unique index can be built.
async function fixCustomerPhones() {
  const groups = new Map();
  for (const c of await Customer.find().sort('createdAt')) {
    const key = normalizePhone(c.phone);
    if (key) groups.set(key, [...(groups.get(key) || []), c]);
  }
  const ledgers = [Order, Collection, Settlement];
  await asUser(null, async () => {
    for (const [phone, list] of groups) {
      if (list.length < 2) continue;
      const counts = await Promise.all(list.map(async (c) => (await Promise.all(ledgers.map((M) => M.countDocuments({ customer: c._id })))).reduce((a, b) => a + b, 0)));
      const keep = list[counts.indexOf(Math.max(...counts))];
      for (const other of list.filter((c) => c !== keep)) {
        for (const M of ledgers) for (const doc of await M.find({ customer: other._id })) { doc.customer = keep._id; await doc.save(); }
        await other.deleteOne();
        console.log(`Customers: merged "${other.name}" into "${keep.name}" (same number ${phone})`);
      }
    }
  });
  await Customer.syncIndexes();
}

api.get('/products', h(async (req, res) => {
  const list = await Product.find().lean();
  res.json(PRODUCTS.map((k) => list.find((p) => p.key === k)).filter(Boolean));
}));

api.put('/products/:key', admin, h(async (req, res) => {
  const p = await Product.findOne({ key: String(req.params.key) });
  if (!p) return notFound(res);
  const before = { price: p.price, partyPrice: p.partyPrice };
  p.set(pick(req.body, ['name', 'nameGu', 'price', 'partyPrice', 'sellRegular', 'sellParty', 'sellPhera']));
  await p.save();
  // First real price: bill the orders that were saved while this vessel had no price. A later price change never touches old orders.
  let rebilled = 0;
  for (const [field, kind] of [['price', mongoose.trusted({ $ne: 'party' })], ['partyPrice', 'party']]) {
    if (before[field] || !(p[field] > 0)) continue;
    const orders = await Order.find({ kind, [`prices.${p.key}`]: 0, [`qty.${p.key}`]: mongoose.trusted({ $gt: 0 }) });
    for (const o of orders) {
      o.prices[p.key] = p[field];
      await priceOrder(o);
      await o.save();
    }
    rebilled += orders.length;
  }
  res.json({ ...p.toObject(), rebilled });
}));

// ---- public page (no login): only what a customer may see. Party prices, UPI ID and all records stay private. ----
const publicInfo = h(async (req, res) => {
  const [s, list] = await Promise.all([Settings.findOne().lean(), Product.find().lean()]);
  res.json({
    phone: s?.phone || '', address: s?.address || '', about: s?.about || '',
    products: PRODUCTS.map((k) => list.find((p) => p.key === k)).filter((p) => p && p.sellRegular !== false).map((p) => ({ key: p.key, name: p.name, price: p.price })),
  });
});

// ---- settings (UPI id etc.; everyone reads, admin writes) ----
const SETTINGS_FIELDS = ['upiVpa', 'phone', 'address', 'about'];
api.get('/settings', h(async (req, res) => res.json((await Settings.findOne().lean()) || {})));
api.put('/settings', admin, h(async (req, res) => {
  const s = (await Settings.findOne()) || new Settings();
  s.set(pick(req.body, SETTINGS_FIELDS));
  res.json(await s.save());
}));

// ---- customers ----
const CUSTOMER_FIELDS = ['name', 'nameGu', 'phone', 'address', 'category', 'notes'];

async function ledgerDocs(filter = {}) {
  const q = (M) => M.find(filter).populate('createdBy updatedBy', who).lean();
  const [orders, collections, settlements] = await Promise.all([q(Order), q(Collection), q(Settlement)]);
  return { orders, collections, settlements };
}

api.get('/customers', h(async (req, res) => {
  const [customers, docs] = await Promise.all([Customer.find().sort('name').lean(), ledgerDocs()]);
  const sums = summarizeAll(docs, today());
  const none = { since: null, due: null, daysOld: 0, daysLate: 0, pending: false };
  const empty = { held: {}, owed: 0, credit: 0, pending: false, overdue: false, qty: none, money: none };
  res.json(customers.map((c) => ({ ...c, ...(sums.get(String(c._id)) || empty) })));
}));

api.get('/customers/:id', h(async (req, res) => {
  const c = await Customer.findById(req.params.id).populate('createdBy updatedBy', who).lean();
  if (!c) return notFound(res);
  const docs = await ledgerDocs({ customer: c._id });
  const sums = summarizeAll(docs, today()).get(String(c._id));
  res.json({ ...c, ...sums, statement: statement(docs).reverse() }); // newest first
}));

// Find-or-create by phone: the number is the identity, so a known number always returns the existing account
// (whatever name was typed) and orders collate under it.
api.post('/customers', h(async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const found = MOBILE.test(phone) && await Customer.findOne({ phone });
  if (found) return res.json(found);
  res.status(201).json(await Customer.create(pick(req.body, CUSTOMER_FIELDS)));
}));

api.put('/customers/:id', h(async (req, res) => {
  const c = await Customer.findById(req.params.id);
  if (!c) return notFound(res);
  const body = pick(req.body, CUSTOMER_FIELDS);
  // The number is the account, so only an admin may change it.
  if (body.phone !== undefined && normalizePhone(body.phone) !== c.phone && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only an admin can change a phone number' });
  }
  c.set(body);
  res.json(await c.save());
}));

api.delete('/customers/:id', admin, h(async (req, res) => {
  const c = await Customer.findById(req.params.id);
  if (!c) return notFound(res);
  const used = await Promise.all([Order, Collection, Settlement].map((M) => M.exists({ customer: c._id })));
  if (used.some(Boolean)) return res.status(409).json({ error: 'Customer has entries; settle instead of deleting' });
  await c.deleteOne();
  res.json({ ok: true });
}));

// ?from=&to=&customer= → a Mongo filter, or null when a date is malformed.
function dateFilter({ from, to, customer }) {
  const isDay = (v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!isDay(from) || !isDay(to)) return null;
  const filter = {};
  // sanitizeFilter strips $-operators unless the object is marked trusted; these are built by us from validated dates.
  if (from || to) filter.date = mongoose.trusted({ ...(from && { $gte: from }), ...(to && { $lte: to }) });
  if (customer) filter.customer = String(customer);
  return filter;
}

// ---- orders ----
const ORDER_FIELDS = ['cancelled', 'date', 'customer', 'kind', 'address', 'qty', 'emptiesBack', 'deliveryType', 'deliveryCharge', 'paidAmount', 'method', 'dueDate'];

async function priceOrder(order) {
  // Prices are fixed when the order is made; switching it between regular and party re-reads that price list.
  if (!order.prices || order.isModified('kind')) {
    const list = await Product.find().lean();
    const field = order.kind === 'party' ? 'partyPrice' : 'price';
    order.prices = Object.fromEntries(list.map((p) => [p.key, p[field] || 0]));
  }
  const goods = PRODUCTS.reduce((s, p) => s + Math.round((order.qty?.[p] || 0) * (order.prices[p] || 0) * 100), 0);
  order.total = (goods + Math.round((order.deliveryCharge || 0) * 100)) / 100;
}

// A switched-off item can't be given out in larger numbers than before; old entries with it still save.
const counts = (v) => Object.fromEntries(PRODUCTS.map((p) => [p, v?.[p] || 0]));
const SELL = { sellRegular: 'regular orders', sellParty: 'party orders', sellPhera: 'pheras' };
async function checkSelling(before, after, field) {
  const off = (await Product.find({ [field]: false }).lean()).filter((p) => (after?.[p.key] || 0) > before[p.key]);
  if (off.length) throw Object.assign(new Error(`${off.map((p) => p.name).join(', ')} is switched off for ${SELL[field]}. Switch it on under Admin to give it out.`), { status: 400 });
}

async function saveOrder(order, body) {
  const before = counts(order.qty);
  const kind = order.kind;
  order.set(pick(body, ORDER_FIELDS));
  await checkSelling(order.kind === kind ? before : counts(), order.qty, order.kind === 'party' ? 'sellParty' : 'sellRegular'); // switching type = a new price list
  if (order.dueDate === '') order.dueDate = undefined;
  if (order.isModified('customer') && !(await Customer.exists({ _id: order.customer }))) {
    throw Object.assign(new Error('Unknown customer'), { status: 400 });
  }
  await priceOrder(order);
  await order.save();
  // Keep the latest address on the customer too, for reference.
  if (order.address) {
    const c = await Customer.findById(order.customer);
    if (c && c.address !== order.address) { c.address = order.address; await c.save(); }
  }
  return order;
}

api.get('/orders', h(async (req, res) => {
  const filter = dateFilter(req.query);
  if (!filter) return res.status(400).json({ error: 'from/to must be YYYY-MM-DD' });
  const q = Order.find(filter).sort('-date -createdAt').limit(500)
    .populate('customer', 'name nameGu phone').populate('createdBy updatedBy', who);
  res.json(await q.lean());
}));

api.get('/orders/:id', h(async (req, res) => {
  const o = await Order.findById(req.params.id).populate('customer', 'name nameGu phone').populate('createdBy updatedBy', who).lean();
  return o ? res.json(o) : notFound(res);
}));

api.post('/orders', h(async (req, res) => res.status(201).json(await saveOrder(new Order(), req.body))));

api.put('/orders/:id', h(async (req, res) => {
  const o = await Order.findById(req.params.id);
  return o ? res.json(await saveOrder(o, req.body)) : notFound(res);
}));

api.delete('/orders/:id', admin, h(async (req, res) => {
  const o = await Order.findById(req.params.id);
  if (!o) return notFound(res);
  await o.deleteOne();
  res.json({ ok: true });
}));

// ---- returns / collections (vessels back and money received after delivery) ----
const COLLECTION_FIELDS = ['cancelled', 'date', 'customer', 'returned', 'amount', 'method', 'collectedBy'];
const withPeople = (q) => q.populate('customer', 'name nameGu phone').populate('createdBy updatedBy collectedBy', who);

async function saveCollection(c, body, user) {
  c.set(pick(body, COLLECTION_FIELDS));
  if (!c.collectedBy) c.collectedBy = user.id;
  if (c.isModified('customer') && !(await Customer.exists({ _id: c.customer }))) throw Object.assign(new Error('Unknown customer'), { status: 400 });
  if (c.isModified('collectedBy') && !(await User.exists({ _id: c.collectedBy, active: true }))) throw Object.assign(new Error('Unknown staff member'), { status: 400 });
  const anything = PRODUCTS.some((p) => c.returned?.[p]) || c.amount > 0;
  if (!anything) throw Object.assign(new Error('Enter the items returned or money received'), { status: 400 });
  return c.save();
}

api.get('/collections', h(async (req, res) => {
  const filter = dateFilter(req.query);
  if (!filter) return res.status(400).json({ error: 'from/to must be YYYY-MM-DD' });
  res.json(await withPeople(Collection.find(filter).sort('-date -createdAt').limit(500)).lean());
}));

api.get('/collections/:id', h(async (req, res) => {
  const c = await withPeople(Collection.findById(req.params.id)).lean();
  return c ? res.json(c) : notFound(res);
}));

api.post('/collections', h(async (req, res) => res.status(201).json(await saveCollection(new Collection(), req.body, req.user))));

api.put('/collections/:id', h(async (req, res) => {
  const c = await Collection.findById(req.params.id);
  return c ? res.json(await saveCollection(c, req.body, req.user)) : notFound(res);
}));

api.delete('/collections/:id', admin, h(async (req, res) => {
  const c = await Collection.findById(req.params.id);
  if (!c) return notFound(res);
  await c.deleteOne();
  res.json({ ok: true });
}));

// Names only, for "collected by" pickers. Everyone logged in may read it.
api.get('/staff', h(async (req, res) => res.json(await User.find({ active: true }, 'name role').sort('name').lean())));

// ---- teams (admin manages; everyone reads) ----
api.get('/teams', h(async (req, res) => res.json(await Team.find().sort('name').lean())));
api.post('/teams', admin, h(async (req, res) => res.status(201).json(await Team.create(pick(req.body, ['name'])))));
api.put('/teams/:id', admin, h(async (req, res) => {
  const t = await Team.findById(req.params.id);
  if (!t) return notFound(res);
  t.set(pick(req.body, ['name', 'active']));
  res.json(await t.save());
}));

// ---- pheras (delivery rounds) ----
const PHERA_FIELDS = ['date', 'team', 'startTime', 'endTime', 'filledOut', 'filledBack', 'emptiesBack'];
// sold = filled out − filled back. Computed, never stored, so it can't disagree with the counts.
const withSold = (p) => ({ ...p, sold: Object.fromEntries(PRODUCTS.map((k) => [k, (p.filledOut?.[k] || 0) - (p.filledBack?.[k] || 0)])) });
const pheraPeople = (q) => q.populate('team', 'name').populate('createdBy updatedBy', who);

async function savePhera(p, body) {
  const before = counts(p.filledOut);
  p.set(pick(body, PHERA_FIELDS));
  await checkSelling(before, p.filledOut, 'sellPhera');
  if (p.endTime === '') p.endTime = undefined;
  if (p.isModified('team') && !(await Team.exists({ _id: p.team }))) throw Object.assign(new Error('Unknown team'), { status: 400 });
  await p.save();
  return withSold(p.toObject());
}

api.get('/pheras', h(async (req, res) => {
  const filter = dateFilter({ from: req.query.from, to: req.query.to });
  if (!filter) return res.status(400).json({ error: 'from/to must be YYYY-MM-DD' });
  res.json((await pheraPeople(Phera.find(filter).sort('-date -startTime').limit(500)).lean()).map(withSold));
}));

api.get('/pheras/:id', h(async (req, res) => {
  const p = await pheraPeople(Phera.findById(req.params.id)).lean();
  return p ? res.json(withSold(p)) : notFound(res);
}));

api.post('/pheras', h(async (req, res) => res.status(201).json(await savePhera(new Phera(), req.body))));

api.put('/pheras/:id', h(async (req, res) => {
  const p = await Phera.findById(req.params.id);
  return p ? res.json(await savePhera(p, req.body)) : notFound(res);
}));

api.delete('/pheras/:id', admin, h(async (req, res) => {
  const p = await Phera.findById(req.params.id);
  if (!p) return notFound(res);
  await p.deleteOne();
  res.json({ ok: true });
}));

// ---- settle (admin): close what will never be collected, as its own ledger line, never by editing the order ----
api.post('/settlements', admin, h(async (req, res) => {
  const body = pick(req.body, ['customer', 'amount', 'lost', 'reason']);
  if (!(await Customer.exists({ _id: String(body.customer) }))) return res.status(400).json({ error: 'Unknown customer' });
  if (!(body.amount > 0) && !PRODUCTS.some((p) => body.lost?.[p] > 0)) return res.status(400).json({ error: 'Enter an amount to write off or items to mark as lost' });
  res.status(201).json(await Settlement.create({ ...body, date: today() }));
}));

api.delete('/settlements/:id', admin, h(async (req, res) => {
  const s = await Settlement.findById(req.params.id);
  if (!s) return notFound(res);
  await s.deleteOne();
  res.json({ ok: true });
}));

// ---- staff users (admin) ----
const publicUser = (u) => ({ _id: u._id, username: u.username, name: u.name, role: u.role, active: u.active });
// Passwords never go near the audit log, so user changes are logged by hand with just the facts.
const logUser = (req, action, u, changes) => AuditLog.create({
  by: req.user.id, byName: req.user.name, role: req.user.role, model: 'User', docId: u._id, action,
  ...(action === 'create' ? { snapshot: publicUser(u) } : { changes }),
});

api.get('/users', admin, h(async (req, res) => res.json((await User.find().sort('name')).map(publicUser))));

api.post('/users', admin, h(async (req, res) => {
  const { username, name, role, password } = req.body || {};
  const u = await User.create({ username, name, role, passwordHash: await hashPassword(password) });
  await logUser(req, 'create', u);
  res.status(201).json(publicUser(u));
}));

api.put('/users/:id', admin, h(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) return notFound(res);
  const before = publicUser(u);
  const body = pick(req.body, ['name', 'role', 'active']);
  const losesAdmin = u.role === 'admin' && u.active && (body.active === false || (body.role && body.role !== 'admin'));
  if (losesAdmin && String(u._id) === req.user.id) return res.status(400).json({ error: 'You cannot remove your own admin access' });
  if (losesAdmin && (await User.countDocuments({ role: 'admin', active: true })) <= 1) return res.status(400).json({ error: 'At least one admin must stay active' });
  u.set(body);
  if (req.body?.password) u.passwordHash = await hashPassword(req.body.password);
  await u.save();
  const changes = Object.fromEntries(Object.keys(body).filter((k) => before[k] !== u[k]).map((k) => [k, { from: before[k], to: u[k] }]));
  if (req.body?.password) changes.password = { from: '•••', to: 'reset' };
  if (Object.keys(changes).length) await logUser(req, 'update', u, changes);
  res.json(publicUser(u));
}));

// ---- edit history (admin) ----
api.get('/audit', admin, h(async (req, res) => {
  const filter = {};
  if (req.query.role === 'employee') filter.role = 'employee';
  const logs = await AuditLog.find(filter).sort('-at').limit(300).lean();

  // Say what each entry is about in words: "Order · Nirav · 2026-11-15".
  const ids = (model) => logs.filter((l) => l.model === model).map((l) => l.docId);
  const load = async (M, fields) => new Map((await M.find({ _id: mongoose.trusted({ $in: ids(M.modelName) }) }, fields).lean()).map((d) => [String(d._id), d]));
  const [orders, cols, sets, pheras, custs, teams, prods] = await Promise.all([
    load(Order, 'customer date'), load(Collection, 'customer date'), load(Settlement, 'customer date'),
    load(Phera, 'team date'), load(Customer, 'name'), load(Team, 'name'), load(Product, 'name'),
  ]);
  const live = { Order: orders, Collection: cols, Settlement: sets, Phera: pheras, Customer: custs, Team: teams, Product: prods };
  const doc = (l) => live[l.model]?.get(String(l.docId)) || l.snapshot || {};
  const custIds = [...new Set(logs.map((l) => String(doc(l).customer || '')).filter(Boolean))];
  const teamIds = [...new Set(logs.map((l) => String(doc(l).team || '')).filter(Boolean))];
  const names = new Map([
    ...(await Customer.find({ _id: mongoose.trusted({ $in: custIds }) }, 'name').lean()),
    ...(await Team.find({ _id: mongoose.trusted({ $in: teamIds }) }, 'name').lean()),
  ].map((d) => [String(d._id), d.name]));
  const WORD = { Order: 'Order', Collection: 'Return', Settlement: 'Settlement', Phera: 'Phera', Customer: 'Customer', Team: 'Team', Product: 'Price', Settings: 'Payment settings', User: 'Staff user' };

  res.json(logs.map((l) => {
    const d = doc(l);
    const about = [names.get(String(d.customer || d.team || '')), d.name, d.date].filter(Boolean).join(' · ');
    return { _id: l._id, at: l.at, byName: l.byName || 'system', role: l.role, action: l.action, what: WORD[l.model] || l.model, about, changes: l.changes || null };
  }));
}));

module.exports = { api, publicInfo, seedProducts, fixCustomerPhones };
