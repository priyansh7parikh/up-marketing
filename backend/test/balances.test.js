const test = require('node:test');
const assert = require('node:assert/strict');
const { day, toLines, summarize, pendingReport } = require('../lib/balances');

const sum = (docs, today) => summarize(toLines(docs), today);

test('spec: holding 3, 5 delivered with 3 empties back → holding 5', () => {
  const r = sum({
    orders: [
      { date: '2026-11-14', qty: { small_jar: 3 } },
      { date: '2026-11-15', qty: { small_jar: 5 }, emptiesBack: { small_jar: 3 } },
    ],
  }, '2026-11-16');
  assert.deepEqual(r.held, { small_jar: 5 });
  assert.equal(r.oldestDate, '2026-11-15'); // FIFO: the 14th's 3 were cleared first
  assert.equal(r.daysOld, 1);
});

test('spec: holding 3, 5 delivered with nothing back → holding 8', () => {
  const r = sum({
    orders: [
      { date: '2026-11-14', qty: { small_jar: 3 } },
      { date: '2026-11-15', qty: { small_jar: 5 } },
    ],
  }, '2026-11-16');
  assert.deepEqual(r.held, { small_jar: 8 });
  assert.equal(r.oldestDate, '2026-11-14');
});

test('partial return via collection keeps the oldest lot and marks overdue', () => {
  const r = sum({
    orders: [{ date: '2026-11-14', qty: { big_jar: 5 } }],
    collections: [{ date: '2026-11-15', returned: { big_jar: 3 } }],
  }, '2026-11-16');
  assert.deepEqual(r.held, { big_jar: 2 });
  assert.equal(r.daysOld, 2);
  assert.equal(r.pending, true);
  assert.equal(r.overdue, true);
});

test('vessel types are counted separately', () => {
  const r = sum({ orders: [{ date: '2026-11-15', qty: { big_jar: 2, small_jar: 2, small_bottle: 1 } }] }, '2026-11-16');
  assert.deepEqual(r.held, { small_jar: 2, big_jar: 2, small_bottle: 1 });
});

test("today's delivery is not pending yet", () => {
  const r = sum({ orders: [{ date: '2026-11-16', qty: { small_jar: 2 }, total: 100 }] }, '2026-11-16');
  assert.equal(r.pending, false);
  assert.equal(r.overdue, false);
});

test('money: unpaid bill minus later partial payment', () => {
  const r = sum({
    orders: [{ date: '2026-11-14', total: 240, paidAmount: 0 }],
    collections: [{ date: '2026-11-15', amount: 100 }],
  }, '2026-11-16');
  assert.equal(r.owed, 140);
  assert.equal(r.oldestDate, '2026-11-14');
  assert.equal(r.pending, true);
});

test('money: paise rounding does not leave a phantom balance', () => {
  const r = sum({ orders: [{ date: '2026-11-14', total: 10.1, paidAmount: 0.1 }], collections: [{ date: '2026-11-15', amount: 10 }] }, '2026-11-16');
  assert.equal(r.owed, 0);
  assert.equal(r.pending, false);
});

test('settlement closes remaining money and lost vessels', () => {
  const r = sum({
    orders: [{ date: '2026-11-14', qty: { small_jar: 2 }, total: 140 }],
    settlements: [{ date: '2026-11-16', amount: 140, lost: { small_jar: 2 } }],
  }, '2026-11-17');
  assert.deepEqual(r.held, {});
  assert.equal(r.owed, 0);
  assert.equal(r.pending, false);
  assert.equal(r.oldestDate, null);
});

test('default return date is next day: taken 15th → due 16th, late from 17th', () => {
  const docs = { orders: [{ date: '2026-11-15', qty: { small_jar: 2 } }] };
  assert.deepEqual([sum(docs, '2026-11-15').pending, sum(docs, '2026-11-15').overdue], [false, false]); // same day
  assert.deepEqual([sum(docs, '2026-11-16').pending, sum(docs, '2026-11-16').overdue], [true, false]); // due today
  assert.deepEqual([sum(docs, '2026-11-17').pending, sum(docs, '2026-11-17').overdue], [true, true]); // late
  assert.equal(sum(docs, '2026-11-16').due, '2026-11-16'); // 16th report: "due today"
  assert.equal(sum(docs, '2026-11-18').daysLate, 2);
  assert.equal(pendingReport({ orders: [{ customer: 'adam', ...docs.orders[0] }] }, '2026-11-16').length, 1); // on the 16th report
});

test('party order with a later due date is pending but not overdue', () => {
  const r = sum({ orders: [{ date: '2026-11-14', dueDate: '2026-11-20', qty: { big_jar: 10 } }] }, '2026-11-16');
  assert.equal(r.pending, true);
  assert.equal(r.overdue, false);
});

test('returning more than held clamps to zero', () => {
  const r = sum({
    orders: [{ date: '2026-11-14', qty: { small_jar: 2 } }],
    collections: [{ date: '2026-11-15', returned: { small_jar: 5 } }],
  }, '2026-11-16');
  assert.deepEqual(r.held, {});
  assert.equal(r.pending, false);
});

test('extra cash becomes credit and pays the next bill', () => {
  const docs = {
    orders: [{ date: '2026-11-14', total: 100 }],
    collections: [{ date: '2026-11-15', amount: 300 }],
  };
  let r = sum(docs, '2026-11-16');
  assert.equal(r.owed, 0);
  assert.equal(r.credit, 200);
  assert.equal(r.pending, false);

  docs.orders.push({ date: '2026-11-16', total: 250 });
  r = sum(docs, '2026-11-17');
  assert.equal(r.credit, 0);
  assert.equal(r.owed, 50);
  assert.equal(r.oldestDate, '2026-11-16');
});

test('report: one row per pending customer, oldest first, cleared customers excluded', () => {
  const rows = pendingReport({
    orders: [
      { customer: 'adam', date: '2026-11-15', qty: { big_jar: 2, small_jar: 2 }, total: 200, paidAmount: 200 },
      { customer: 'john', date: '2026-11-14', qty: { big_jar: 2 }, total: 240 },
      { customer: { _id: 'mira' }, date: '2026-11-14', qty: { small_jar: 1 }, total: 50, paidAmount: 50 },
    ],
    collections: [{ customer: 'mira', date: '2026-11-15', returned: { small_jar: 1 } }],
  }, '2026-11-16');
  assert.deepEqual(rows.map((r) => r.customer), ['john', 'adam']);
  assert.equal(rows[0].owed, 240);
  assert.deepEqual(rows[1].held, { small_jar: 2, big_jar: 2 });
  assert.equal(rows[1].owed, 0);
});

test('day() uses India time for Date objects', () => {
  assert.equal(day(new Date('2026-11-15T20:00:00Z')), '2026-11-16'); // 01:30 IST next day
  assert.equal(day('2026-11-15T23:59:00Z'), '2026-11-15');
});

test('quantity and money are aged separately', () => {
  const r = sum({
    orders: [
      { date: '2026-11-10', qty: { big_jar: 2 }, total: 80, paidAmount: 80 }, // paid, jars still out
      { date: '2026-11-14', qty: { small_jar: 1 }, emptiesBack: { small_jar: 1 }, total: 25 }, // jar back, money due
    ],
  }, '2026-11-16');
  assert.deepEqual([r.qty.since, r.qty.daysLate, r.qty.pending], ['2026-11-10', 5, true]);
  assert.deepEqual([r.money.since, r.money.daysLate, r.money.pending], ['2026-11-14', 1, true]);

  const clear = sum({ orders: [{ date: '2026-11-10', qty: { big_jar: 1 }, emptiesBack: { big_jar: 1 }, total: 40, paidAmount: 40 }] }, '2026-11-16');
  assert.deepEqual([clear.qty.since, clear.qty.pending, clear.money.since, clear.money.pending], [null, false, null, false]);
});
