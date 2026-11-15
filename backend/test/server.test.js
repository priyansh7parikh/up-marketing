// Needs a MongoDB. Uses MONGO_TEST_URL (default local); skips if none is reachable. Drops its own test database.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { createApp } = require('../app');
const { requireRole, hashPassword } = require('../lib/auth');
const { asUser, AuditLog } = require('../lib/audit');
const { User, Order, Customer } = require('../models');

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

  // Test-only routes standing in for phase 3.
  const api = express.Router();
  api.get('/whoami', (req, res) => res.json(req.user));
  api.delete('/admin-thing', requireRole('admin'), (req, res) => res.json({ ok: true }));
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
});
