// All logged-in API routes. Writes go through doc.save()/doc.deleteOne() so the audit log sees them.
const express = require('express');
const mongoose = require('mongoose');
const { requireRole } = require('../lib/auth');
const { asUser } = require('../lib/audit');
const { PRODUCTS, day, summarizeAll, statement } = require('../lib/balances');
const { Customer, Product, Order, Collection, Settlement, Settings, User, Team, Phera } = require('../models');

const api = express.Router();
const admin = requireRole('admin');
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next); // Express 4 doesn't catch async errors
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));
const today = () => day(new Date());
const notFound = (res) => res.status(404).json({ error: 'Not found' });
const who = 'name';

// ---- products ----
const DEFAULT_PRODUCTS = [
  { key: 'small_jar', name: 'Small jar', nameGu: 'નાનો જગ' },
  { key: 'big_jar', name: 'Big jar', nameGu: 'મોટો જગ' },
  { key: 'small_bottle', name: 'Small bottle', nameGu: 'નાની બોટલ' },
  { key: 'big_bottle', name: 'Big bottle', nameGu: 'મોટી બોટલ' },
];
async function seedProducts() {
  const have = new Set((await Product.find({}, 'key').lean()).map((p) => p.key));
  await asUser(null, () => Promise.all(DEFAULT_PRODUCTS.filter((p) => !have.has(p.key)).map((p) => Product.create({ ...p, price: 0 }))));
}

api.get('/products', h(async (req, res) => {
  const list = await Product.find().lean();
  res.json(PRODUCTS.map((k) => list.find((p) => p.key === k)).filter(Boolean));
}));

api.put('/products/:key', admin, h(async (req, res) => {
  const p = await Product.findOne({ key: String(req.params.key) });
  if (!p) return notFound(res);
  const before = { price: p.price, partyPrice: p.partyPrice };
  p.set(pick(req.body, ['name', 'nameGu', 'price', 'partyPrice']));
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
  const empty = { held: {}, owed: 0, credit: 0, pending: false, overdue: false };
  res.json(customers.map((c) => ({ ...c, ...(sums.get(String(c._id)) || empty) })));
}));

api.get('/customers/:id', h(async (req, res) => {
  const c = await Customer.findById(req.params.id).populate('createdBy updatedBy', who).lean();
  if (!c) return notFound(res);
  const docs = await ledgerDocs({ customer: c._id });
  const sums = summarizeAll(docs, today()).get(String(c._id));
  res.json({ ...c, ...sums, statement: statement(docs).reverse() }); // newest first
}));

api.post('/customers', h(async (req, res) => {
  res.status(201).json(await Customer.create(pick(req.body, CUSTOMER_FIELDS)));
}));

api.put('/customers/:id', h(async (req, res) => {
  const c = await Customer.findById(req.params.id);
  if (!c) return notFound(res);
  c.set(pick(req.body, CUSTOMER_FIELDS));
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
const ORDER_FIELDS = ['date', 'customer', 'kind', 'qty', 'emptiesBack', 'deliveryType', 'deliveryCharge', 'paidAmount', 'method', 'dueDate'];

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

async function saveOrder(order, body) {
  order.set(pick(body, ORDER_FIELDS));
  if (order.dueDate === '') order.dueDate = undefined;
  if (order.isModified('customer') && !(await Customer.exists({ _id: order.customer }))) {
    throw Object.assign(new Error('Unknown customer'), { status: 400 });
  }
  await priceOrder(order);
  return order.save();
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
const COLLECTION_FIELDS = ['date', 'customer', 'returned', 'amount', 'method', 'collectedBy'];
const withPeople = (q) => q.populate('customer', 'name nameGu phone').populate('createdBy updatedBy collectedBy', who);

async function saveCollection(c, body, user) {
  c.set(pick(body, COLLECTION_FIELDS));
  if (!c.collectedBy) c.collectedBy = user.id;
  if (c.isModified('customer') && !(await Customer.exists({ _id: c.customer }))) throw Object.assign(new Error('Unknown customer'), { status: 400 });
  if (c.isModified('collectedBy') && !(await User.exists({ _id: c.collectedBy, active: true }))) throw Object.assign(new Error('Unknown staff member'), { status: 400 });
  const anything = PRODUCTS.some((p) => c.returned?.[p]) || c.amount > 0;
  if (!anything) throw Object.assign(new Error('Enter vessels returned or money received'), { status: 400 });
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
  p.set(pick(body, PHERA_FIELDS));
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

module.exports = { api, seedProducts };
