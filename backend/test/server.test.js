// Needs a MongoDB. Uses MONGO_TEST_URL (default local); skips if none is reachable. Drops its own test database.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { createApp } = require('../app');
const { requireRole, hashPassword } = require('../lib/auth');
const { asUser, AuditLog } = require('../lib/audit');
const { User, Order, Customer } = require('../models');
const { api: routes, seedProducts, fixCustomerPhones } = require('../routes');

const url = process.env.MONGO_TEST_URL || 'mongodb://127.0.0.1:27017/upmarketing_test';

test('server', async (t) => {
  try {
    await mongoose.connect(url, { serverSelectionTimeoutMS: 1500 });
  } catch {
    t.skip(`no MongoDB at ${url}`);
    return;
  }
  await mongoose.connection.dropDatabase();
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));

  const admin = await User.create({ username: 'priyansh', name: 'Priyansh', role: 'admin', passwordHash: await hashPassword('admin-pass-1') });
  const emp = await User.create({ username: 'ravi', name: 'Ravi', role: 'employee', passwordHash: await hashPassword('ravi-pass-1') });

  await User.create({ username: 'meena', name: 'Meena', role: 'employee', passwordHash: await hashPassword('meena-pass-1') });
  await seedProducts();

  // Test-only probes + the real routes.
  const api = express.Router();
  api.get('/whoami', (req, res) => res.json(req.user));
  api.delete('/admin-thing', requireRole('admin'), (req, res) => res.json({ ok: true }));
  api.use(routes);
  const app = createApp({ mongoUrl: url, sessionSecret: 'test-secret-'.padEnd(40, 'x'), api });

  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, cookie) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie && { cookie }) }, body: body && JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] };
  };

  t.after(async () => { server.closeAllConnections(); server.close(); await app.locals.sessionStore.close(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  await t.test('api requires login', async () => {
    assert.equal((await call('GET', '/api/whoami')).status, 401);
  });

  await t.test('wrong password is rejected', async () => {
    assert.equal((await call('POST', '/api/auth/login', { username: 'ravi', password: 'nope' })).status, 401);
  });

  await t.test('NoSQL injection in login is rejected', async () => {
    assert.equal((await call('POST', '/api/auth/login', { username: { $gt: '' }, password: { $gt: '' } })).status, 400);
    const { User: U } = require('../models');
    await assert.rejects(() => U.findOne({ username: { $ne: 'x' } }), /Cast to string/); // operators are never run as queries
  });

  await t.test('security headers are set', async () => {
    const r = await fetch(`${base}/api/auth/me`);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-powered-by'), null);
  });

  await t.test('CSRF: non-JSON writes are refused', async () => {
    const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=ravi&password=x' });
    assert.equal(r.status, 415);
  });

  await t.test('weak secrets and passwords are refused', async () => {
    assert.throws(() => createApp({ mongoUrl: url, sessionSecret: 'short' }), /32 characters/);
    assert.throws(() => hashPassword('1234567'), /8 characters/);
  });

  await t.test('login is locked after repeated failures', async () => {
    for (let i = 0; i < 10; i++) await call('POST', '/api/auth/login', { username: 'lockme', password: 'wrong' });
    assert.equal((await call('POST', '/api/auth/login', { username: 'lockme', password: 'wrong' })).status, 429);
  });

  let adminCookie;
  let empCookie;
  await t.test('login works and sets the user', async () => {
    const a = await call('POST', '/api/auth/login', { username: 'Priyansh', password: 'admin-pass-1' });
    assert.equal(a.status, 200);
    assert.equal(a.json.role, 'admin');
    adminCookie = a.cookie;
    empCookie = (await call('POST', '/api/auth/login', { username: 'ravi', password: 'ravi-pass-1' })).cookie;
    assert.equal((await call('GET', '/api/whoami', null, empCookie)).json.name, 'Ravi');
  });

  await t.test('employee gets 403 on admin-only routes, admin passes', async () => {
    assert.equal((await call('DELETE', '/api/admin-thing', null, empCookie)).status, 403);
    assert.equal((await call('DELETE', '/api/admin-thing', null, adminCookie)).status, 200);
  });

  await t.test('disabling an employee logs them out', async () => {
    emp.active = false;
    await emp.save();
    assert.equal((await call('GET', '/api/whoami', null, empCookie)).status, 401);
  });

  await t.test('audit: create, edit and delete are logged with who and what changed', async () => {
    const ravi = { id: String(emp._id), name: 'Ravi', role: 'employee' };
    const boss = { id: String(admin._id), name: 'Priyansh', role: 'admin' };
    const cust = await asUser(ravi, () => Customer.create({ name: 'Adam', phone: '9876543210' }));
    const order = await asUser(ravi, () => Order.create({ date: '2026-11-15', customer: cust._id, qty: { small_jar: 2 } }));
    assert.equal(String(order.createdBy), ravi.id);

    await asUser(boss, async () => {
      const o = await Order.findById(order._id);
      o.qty.small_jar = 3;
      await o.save();
      assert.equal(String(o.updatedBy), boss.id);
      await o.deleteOne();
    });

    const logs = await AuditLog.find({ docId: order._id }).sort('at').lean();
    assert.deepEqual(logs.map((l) => [l.action, l.byName]), [['create', 'Ravi'], ['update', 'Priyansh'], ['delete', 'Priyansh']]);
    assert.deepEqual(logs[1].changes, { 'qty.small_jar': { from: 2, to: 3 } });
  });

  await t.test('writes that would skip the audit are refused', async () => {
    await assert.rejects(() => Order.create({ date: '2026-11-15', customer: new mongoose.Types.ObjectId() }), /no user in context/);
    await assert.rejects(() => Order.updateMany({}, { total: 1 }), /audited/);
  });

  await t.test('bad data is rejected', async () => {
    await assert.rejects(() => asUser(null, () => Order.create({ date: '15/11/2026', customer: new mongoose.Types.ObjectId() })), /date/);
    await assert.rejects(() => asUser(null, () => Order.create({ date: '2026-11-15', customer: new mongoose.Types.ObjectId(), qty: { small_jar: -1 } })), /small_jar/);
  });

  await t.test('customers + orders: prices, balances, ledger, roles', async () => {
    const boss = (await call('POST', '/api/auth/login', { username: 'priyansh', password: 'admin-pass-1' })).cookie;
    const meena = (await call('POST', '/api/auth/login', { username: 'meena', password: 'meena-pass-1' })).cookie;

    assert.equal((await call('PUT', '/api/products/big_jar', { price: 40 }, meena)).status, 403);
    assert.equal((await call('PUT', '/api/products/big_jar', { price: 40 }, boss)).json.price, 40);
    await call('PUT', '/api/products/small_jar', { price: 25 }, boss);

    const john = (await call('POST', '/api/customers', { name: 'John', phone: '9876500000', createdBy: admin._id }, meena)).json;
    assert.equal(john.createdBy, String((await User.findOne({ username: 'meena' }))._id)); // client can't fake createdBy

    const o = await call('POST', '/api/orders', { date: '2026-01-10', customer: john._id, qty: { big_jar: 2, small_jar: 1 }, deliveryCharge: 10, total: 1 }, meena);
    assert.equal(o.status, 201);
    assert.equal(o.json.total, 2 * 40 + 25 + 10); // server computes total; client value ignored

    await call('PUT', '/api/products/big_jar', { price: 50 }, boss); // later price change doesn't touch old orders
    const edited = await call('PUT', `/api/orders/${o.json._id}`, { qty: { big_jar: 3, small_jar: 1 } }, meena);
    assert.equal(edited.json.total, 3 * 40 + 25 + 10);

    const list = (await call('GET', '/api/customers', null, meena)).json;
    const row = list.find((c) => c.name === 'John');
    assert.deepEqual(row.held, { small_jar: 1, big_jar: 3 });
    assert.equal(row.owed, 155);
    assert.equal(row.overdue, true);

    const detail = (await call('GET', `/api/customers/${john._id}`, null, meena)).json;
    assert.equal(detail.statement.length, 1);
    assert.equal(detail.statement[0].by.name, 'Meena');
    assert.equal(detail.statement[0].balance, 155);

    const ol = await call('GET', '/api/orders?from=2026-01-10&to=2026-01-10', null, meena); assert.equal(ol.json.length, 1, JSON.stringify(ol));
    assert.equal((await call('GET', '/api/orders?from=bad', null, meena)).status, 400);
    assert.equal((await call('POST', '/api/orders', { date: '2026-01-10', customer: '000000000000000000000000' }, meena)).status, 400);

    assert.equal((await call('DELETE', `/api/orders/${o.json._id}`, null, meena)).status, 403);
    assert.equal((await call('DELETE', `/api/customers/${john._id}`, null, boss)).status, 409); // has entries
    assert.equal((await call('DELETE', `/api/orders/${o.json._id}`, null, boss)).status, 200);
    assert.equal((await AuditLog.countDocuments({ docId: o.json._id })), 3); // create, update, delete
  });

  await t.test('returns: vessels and money come off the balance; roles', async () => {
    const boss = (await call('POST', '/api/auth/login', { username: 'priyansh', password: 'admin-pass-1' })).cookie;
    const meena = (await call('POST', '/api/auth/login', { username: 'meena', password: 'meena-pass-1' })).cookie;
    const adam = (await call('POST', '/api/customers', { name: 'Adam', phone: '9000000001' }, meena)).json;
    await call('POST', '/api/orders', { date: '2026-01-10', customer: adam._id, qty: { big_jar: 5 } }, meena); // 5 × 50 = 250

    assert.equal((await call('POST', '/api/collections', { date: '2026-01-11', customer: adam._id }, meena)).status, 400); // nothing entered
    const c = await call('POST', '/api/collections', { date: '2026-01-11', customer: adam._id, returned: { big_jar: 3 }, amount: 100, method: 'upi' }, meena);
    assert.equal(c.status, 201);
    assert.equal(c.json.collectedBy, c.json.createdBy); // defaults to whoever entered it

    const row = (await call('GET', '/api/customers', null, meena)).json.find((x) => x._id === adam._id);
    assert.deepEqual(row.held, { big_jar: 2 });
    assert.equal(row.owed, 150);

    const detail = (await call('GET', `/api/customers/${adam._id}`, null, meena)).json;
    assert.deepEqual(detail.statement.map((r) => r.kind), ['collection', 'order']);
    assert.equal(detail.statement[0].balance, 150);

    const list = (await call('GET', '/api/collections?from=2026-01-11&to=2026-01-11', null, meena)).json;
    assert.equal(list.length, 1);
    assert.equal(list[0].collectedBy.name, 'Meena');
    assert.ok((await call('GET', '/api/staff', null, meena)).json.every((u) => !u.passwordHash && !u.username));

    assert.equal((await call('DELETE', `/api/collections/${c.json._id}`, null, meena)).status, 403);
    assert.equal((await call('DELETE', `/api/collections/${c.json._id}`, null, boss)).status, 200);
  });

  await t.test('orders saved before a price existed are billed when the price is first set', async () => {
    const boss = (await call('POST', '/api/auth/login', { username: 'priyansh', password: 'admin-pass-1' })).cookie;
    const nirav = (await call('POST', '/api/customers', { name: 'Nirav', phone: '9000000002' }, boss)).json;
    const o = (await call('POST', '/api/orders', { date: '2026-01-10', customer: nirav._id, qty: { small_bottle: 2 }, deliveryCharge: 5 }, boss)).json;
    assert.equal(o.total, 5); // small bottle has no price yet

    assert.equal((await call('PUT', '/api/products/small_bottle', { price: 10 }, boss)).json.rebilled, 1);
    assert.equal((await call('GET', `/api/orders/${o._id}`, null, boss)).json.total, 25);

    assert.equal((await call('PUT', '/api/products/small_bottle', { price: 15 }, boss)).json.rebilled, 0); // a price change leaves old orders alone
    assert.equal((await call('GET', `/api/orders/${o._id}`, null, boss)).json.total, 25);
    const log = await AuditLog.findOne({ docId: o._id, action: 'update' }).lean();
    assert.deepEqual(log.changes['prices.small_bottle'], { from: 0, to: 10 });
  });

  await t.test('party orders bill from the party price list', async () => {
    const boss = (await call('POST', '/api/auth/login', { username: 'priyansh', password: 'admin-pass-1' })).cookie;
    const hall = (await call('POST', '/api/customers', { name: 'Wedding Hall', phone: '9000000003', category: 'party' }, boss)).json;
    const body = { date: '2026-01-10', customer: hall._id, qty: { big_jar: 10 } };
    const regular = (await call('POST', '/api/orders', body, boss)).json;
    assert.equal(regular.total, 500); // regular big jar is 50

    const party = (await call('POST', '/api/orders', { ...body, kind: 'party' }, boss)).json;
    assert.equal(party.total, 0); // no party price yet
    assert.equal((await call('PUT', '/api/products/big_jar', { partyPrice: 35 }, boss)).json.rebilled, 1);
    assert.equal((await call('GET', `/api/orders/${party._id}`, null, boss)).json.total, 350);
    assert.equal((await call('GET', `/api/orders/${regular._id}`, null, boss)).json.total, 500); // untouched

    assert.equal((await call('PUT', `/api/orders/${regular._id}`, { kind: 'party' }, boss)).json.total, 350); // switching type re-bills
    assert.equal((await call('POST', '/api/orders', { ...body, kind: 'vip' }, boss)).status, 400);
  });

  await t.test('a switched-off item cannot be given out, but old orders with it still save', async () => {
    const boss = (await call('POST', '/api/auth/login', { username: 'priyansh', password: 'admin-pass-1' })).cookie;
    const shop = (await call('POST', '/api/customers', { name: 'Corner Shop', phone: '9000000004' }, boss)).json;
    const old = (await call('POST', '/api/orders', { date: '2026-01-11', customer: shop._id, qty: { big_bottle: 2 } }, boss)).json;
    assert.equal((await call('PUT', '/api/products/big_bottle', { active: false }, boss)).json.active, false);

    const fresh = await call('POST', '/api/orders', { date: '2026-01-12', customer: shop._id, qty: { big_bottle: 1 } }, boss);
    assert.equal(fresh.status, 400);
    assert.match(fresh.json.error, /switched off/);
    assert.equal((await call('PUT', `/api/orders/${old._id}`, { qty: { big_bottle: 2 }, deliveryCharge: 10 }, boss)).status, 200); // unchanged count is fine
    assert.equal((await call('PUT', `/api/orders/${old._id}`, { qty: { big_bottle: 3 } }, boss)).status, 400);
    await call('PUT', '/api/products/big_bottle', { active: true }, boss);
  });

  await t.test('pheras: teams, start and close a round, sold = out − back', async () => {
    const boss = (await call('POST', '/api/auth/login', { username: 'priyansh', password: 'admin-pass-1' })).cookie;
    const meena = (await call('POST', '/api/auth/login', { username: 'meena', password: 'meena-pass-1' })).cookie;

    assert.equal((await call('POST', '/api/teams', { name: 'Team A' }, meena)).status, 403);
    const team = (await call('POST', '/api/teams', { name: 'Team A' }, boss)).json;

    // Employee starts a round, then closes it.
    const start = await call('POST', '/api/pheras', { date: '2026-01-10', team: team._id, startTime: '08:30', filledOut: { big_jar: 40, small_jar: 20 } }, meena);
    assert.equal(start.status, 201);
    assert.deepEqual(start.json.sold, { small_jar: 20, big_jar: 40, small_bottle: 0, big_bottle: 0 }); // nothing back yet
    const close = await call('PUT', `/api/pheras/${start.json._id}`, { endTime: '12:15', filledBack: { big_jar: 6, small_jar: 5 }, emptiesBack: { big_jar: 30 } }, meena);
    assert.equal(close.json.sold.big_jar, 34);
    assert.equal(close.json.sold.small_jar, 15);

    const list = (await call('GET', '/api/pheras?from=2026-01-10&to=2026-01-10', null, meena)).json;
    assert.equal(list.length, 1);
    assert.equal(list[0].team.name, 'Team A');
    assert.equal(list[0].createdBy.name, 'Meena');

    const bad = (body) => call('PUT', `/api/pheras/${start.json._id}`, body, meena).then((r) => r.status);
    assert.equal(await bad({ filledBack: { big_jar: 41 } }), 400); // more back than went out
    assert.equal(await bad({ endTime: '07:00' }), 400); // ends before it starts
    assert.equal(await bad({ startTime: '25:00' }), 400);
    assert.equal((await call('POST', '/api/pheras', { date: '2026-01-10', team: '000000000000000000000000', startTime: '09:00' }, meena)).status, 400);

    assert.equal((await call('DELETE', `/api/pheras/${start.json._id}`, null, meena)).status, 403);
    assert.equal((await call('DELETE', `/api/pheras/${start.json._id}`, null, boss)).status, 200);
  });

  await t.test('customer identity: the phone number is the account', async () => {
    const boss = (await call('POST', '/api/auth/login', { username: 'priyansh', password: 'admin-pass-1' })).cookie;
    const meena = (await call('POST', '/api/auth/login', { username: 'meena', password: 'meena-pass-1' })).cookie;

    assert.equal((await call('POST', '/api/customers', { name: 'No Phone' }, meena)).status, 400);
    assert.equal((await call('POST', '/api/customers', { name: 'Landline', phone: '079-2345678' }, meena)).status, 400);

    const first = await call('POST', '/api/customers', { name: 'Nirav', phone: '+91 98250 11111' }, meena);
    assert.equal(first.status, 201);
    assert.equal(first.json.phone, '9825011111'); // stored as 10 digits

    // Same number written differently, with a different spelling of the name → the same account, name unchanged.
    const again = await call('POST', '/api/customers', { name: 'Niravbhai Patel', phone: '098250-11111' }, meena);
    assert.equal(again.status, 200);
    assert.equal(again.json._id, first.json._id);
    assert.equal(again.json.name, 'Nirav');

    // Same name, different number → a different customer.
    const other = await call('POST', '/api/customers', { name: 'Nirav', phone: '9825022222' }, meena);
    assert.equal(other.status, 201);
    assert.notEqual(other.json._id, first.json._id);

    // Renaming is fine for staff; changing the number is admin only and can't collide.
    assert.equal((await call('PUT', `/api/customers/${first.json._id}`, { name: 'Nirav P', phone: '9825011111' }, meena)).status, 200);
    assert.equal((await call('PUT', `/api/customers/${first.json._id}`, { phone: '9825033333' }, meena)).status, 403);
    assert.equal((await call('PUT', `/api/customers/${first.json._id}`, { phone: '9825022222' }, boss)).status, 409);
    assert.equal((await call('PUT', `/api/customers/${first.json._id}`, { phone: '9825033333' }, boss)).json.phone, '9825033333');

    // Each order keeps its own address; the customer shows the latest.
    await call('POST', '/api/orders', { date: '2026-01-10', customer: other.json._id, qty: { big_jar: 1 }, address: 'Hall X' }, meena);
    await call('POST', '/api/orders', { date: '2026-01-11', customer: other.json._id, qty: { big_jar: 1 }, address: 'Farm Y' }, meena);
    const detail = (await call('GET', `/api/customers/${other.json._id}`, null, meena)).json;
    assert.equal(detail.address, 'Farm Y');
    assert.deepEqual(detail.statement.map((r) => r.note), ['Farm Y', 'Hall X']);
  });

  await t.test('one-time repair merges customers that share a number', async () => {
    const col = mongoose.connection.collection('customers');
    await col.dropIndex('phone_1');
    const [keepId, dropId] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    await col.insertMany([
      { _id: dropId, name: 'PP', phone: '9409223430', createdAt: new Date('2026-01-01') },
      { _id: keepId, name: 'Udit', phone: '9409223430', createdAt: new Date('2026-01-02') },
    ]);
    await asUser(null, () => Order.create({ date: '2026-01-10', customer: keepId, qty: { small_jar: 1 } }));
    await asUser(null, () => Order.create({ date: '2026-01-11', customer: keepId, qty: { small_jar: 1 } }));
    await asUser(null, () => Order.create({ date: '2026-01-12', customer: dropId, qty: { small_jar: 1 } }));

    await fixCustomerPhones();
    const left = await Customer.find({ phone: '9409223430' }).lean();
    assert.deepEqual(left.map((c) => c.name), ['Udit']);
    assert.equal(await Order.countDocuments({ customer: keepId }), 3); // nothing lost
    await assert.rejects(() => col.insertOne({ name: 'Dup', phone: '9409223430' }), /E11000/); // index is back
  });

  await t.test('admin: staff users, password change, settle, edit history', async () => {
    const boss = (await call('POST', '/api/auth/login', { username: 'priyansh', password: 'admin-pass-1' })).cookie;
    const meena = (await call('POST', '/api/auth/login', { username: 'meena', password: 'meena-pass-1' })).cookie;

    // Staff users: admin only, no password hashes leave the server.
    assert.equal((await call('GET', '/api/users', null, meena)).status, 403);
    assert.equal((await call('POST', '/api/users', { username: 'kiran', name: 'Kiran', role: 'employee', password: 'short' }, boss)).status, 400);
    assert.equal((await call('POST', '/api/users', { username: 'ki ran!', name: 'Kiran', role: 'employee', password: 'kiran-pass-1' }, boss)).status, 400);
    const kiran = await call('POST', '/api/users', { username: 'Kiran', name: 'Kiran', role: 'employee', password: 'kiran-pass-1' }, boss);
    assert.equal(kiran.status, 201);
    assert.equal(kiran.json.passwordHash, undefined);
    assert.equal((await call('POST', '/api/users', { username: 'kiran', name: 'Dup', role: 'employee', password: 'kiran-pass-2' }, boss)).status, 409);
    assert.ok((await call('GET', '/api/users', null, boss)).json.every((u) => !u.passwordHash));

    // Kiran changes her own password; the old one stops working.
    const kc = (await call('POST', '/api/auth/login', { username: 'kiran', password: 'kiran-pass-1' })).cookie;
    assert.equal((await call('POST', '/api/auth/password', { current: 'wrong', next: 'kiran-new-pass' }, kc)).status, 400);
    assert.equal((await call('POST', '/api/auth/password', { current: 'kiran-pass-1', next: 'kiran-new-pass' }, kc)).status, 200);
    assert.equal((await call('POST', '/api/auth/login', { username: 'kiran', password: 'kiran-pass-1' })).status, 401);

    // Admin resets it and disables her; she is logged out at once.
    assert.equal((await call('PUT', `/api/users/${kiran.json._id}`, { password: 'reset-pass-99', active: false }, boss)).json.active, false);
    assert.equal((await call('GET', '/api/customers', null, kc)).status, 401);

    // The only admin cannot lock themselves out.
    assert.equal((await call('PUT', `/api/users/${admin._id}`, { active: false }, boss)).status, 400);
    assert.equal((await call('PUT', `/api/users/${admin._id}`, { role: 'employee' }, boss)).status, 400);

    // Settle: write off money and mark items lost, as a ledger line.
    const c = (await call('POST', '/api/customers', { name: 'Old Due', phone: '9000000077' }, meena)).json;
    const o = (await call('POST', '/api/orders', { date: '2026-01-10', customer: c._id, qty: { big_jar: 2 } }, meena)).json; // 2 × 50
    await call('PUT', `/api/orders/${o._id}`, { deliveryCharge: 20 }, meena); // an employee edit, for the history
    assert.equal((await call('POST', '/api/settlements', { customer: c._id, amount: 120, reason: 'x' }, meena)).status, 403);
    assert.equal((await call('POST', '/api/settlements', { customer: c._id, reason: 'nothing entered' }, boss)).status, 400);
    assert.equal((await call('POST', '/api/settlements', { customer: c._id, amount: 120, lost: { big_jar: 2 } }, boss)).status, 400); // reason required
    assert.equal((await call('POST', '/api/settlements', { customer: c._id, amount: 120, lost: { big_jar: 2 }, reason: 'Shop closed' }, boss)).status, 201);
    const after = (await call('GET', `/api/customers/${c._id}`, null, boss)).json;
    assert.equal(after.owed, 0);
    assert.deepEqual(after.held, {});
    assert.equal(after.statement[0].kind, 'settlement');
    assert.equal(after.statement[0].note, 'Shop closed');

    // Edit history: admin only; names what changed, who did it; employee filter; no secrets.
    assert.equal((await call('GET', '/api/audit', null, meena)).status, 403);
    const log = (await call('GET', '/api/audit', null, boss)).json;
    const edit = log.find((l) => l.what === 'Order' && l.action === 'update' && l.about.includes('Old Due'));
    assert.equal(edit.byName, 'Meena');
    assert.deepEqual(edit.changes.deliveryCharge, { from: 0, to: 20 });
    assert.ok(log.some((l) => l.what === 'Staff user' && l.changes?.password?.to === 'reset'));
    assert.ok(!JSON.stringify(log).includes('$2b$')); // no bcrypt hashes anywhere
    const onlyStaff = (await call('GET', '/api/audit?role=employee', null, boss)).json;
    assert.ok(onlyStaff.length > 0 && onlyStaff.every((l) => l.role === 'employee'));
  });
});
