const mongoose = require('mongoose');
const { auditPlugin } = require('../lib/audit');
const { PRODUCTS } = require('../lib/balances');

// Strip `$`-operators from query filters, so request data like {"$gt": ""} can't turn into a NoSQL injection.
mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);

const { ObjectId } = mongoose.Schema.Types;
// Business days are plain 'YYYY-MM-DD' strings (India time), so a date never shifts with the server's timezone.
const Day = { type: String, match: /^\d{4}-\d{2}-\d{2}$/ };
const count = { type: Number, min: 0, default: 0, validate: Number.isInteger };
const money = { type: Number, min: 0, default: 0 };
const Vessels = new mongoose.Schema(Object.fromEntries(PRODUCTS.map((p) => [p, count])), { _id: false });
const method = { type: String, enum: ['cash', 'upi'], default: 'cash' };

// A customer IS their 10-digit mobile number. "98765 43210", "09876543210" and "+91 98765 43210" are the same person.
function normalizePhone(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  return d;
}

const MOBILE = /^[6-9]\d{9}$/; // Indian mobiles start 6-9; this also rejects 10-digit landlines

const audited = (schema) => { schema.plugin(auditPlugin); return schema; };

const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'employee'], required: true },
  active: { type: Boolean, default: true },
}, { timestamps: true }));

const Customer = mongoose.model('Customer', audited(new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  nameGu: { type: String, trim: true }, // Gujarati spelling, used for scan matching
  phone: { type: String, required: [true, 'Phone number is required'], unique: true, set: normalizePhone, match: [MOBILE, 'Phone must be a 10-digit mobile number'] },
  address: String, // the most recent address used on an order; never suggested back to staff
  category: { type: String, enum: ['regular', 'party'], default: 'regular' },
  notes: String,
})));

const Product = mongoose.model('Product', audited(new mongoose.Schema({
  key: { type: String, enum: PRODUCTS, required: true, unique: true },
  name: { type: String, required: true },
  nameGu: String,
  price: { ...money, required: true }, // regular customers
  partyPrice: money, // party orders
})));

const Order = mongoose.model('Order', audited(new mongoose.Schema({
  date: { ...Day, required: true, index: true },
  customer: { type: ObjectId, ref: 'Customer', required: true, index: true },
  kind: { type: String, enum: ['regular', 'party'], default: 'regular' }, // which price list it bills from
  address: { type: String, trim: true }, // where this order went; a customer's address can differ every time
  qty: { type: Vessels, default: () => ({}) },
  emptiesBack: { type: Vessels, default: () => ({}) },
  deliveryType: { type: String, enum: ['self', 'ours'], default: 'ours' },
  deliveryCharge: money,
  prices: { type: new mongoose.Schema(Object.fromEntries(PRODUCTS.map((p) => [p, money])), { _id: false }) }, // unit prices when created
  total: money, // server-computed: qty × prices + deliveryCharge
  paidAmount: money,
  method,
  dueDate: Day, // empty → next day
  scan: { type: ObjectId, ref: 'Scan' },
})));

const Collection = mongoose.model('Collection', audited(new mongoose.Schema({
  date: { ...Day, required: true, index: true },
  customer: { type: ObjectId, ref: 'Customer', required: true, index: true },
  returned: { type: Vessels, default: () => ({}) },
  amount: money,
  method,
  collectedBy: { type: ObjectId, ref: 'User' },
  scan: { type: ObjectId, ref: 'Scan' },
})));

const Settlement = mongoose.model('Settlement', audited(new mongoose.Schema({
  date: { ...Day, required: true },
  customer: { type: ObjectId, ref: 'Customer', required: true, index: true },
  amount: money, // discount / write-off
  lost: { type: Vessels, default: () => ({}) },
  reason: { type: String, required: true, trim: true },
})));

const Team = mongoose.model('Team', audited(new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  active: { type: Boolean, default: true },
})));

// One delivery round by one team. Route customers are prepaid (tokens), so a phera has no customers or cash.
const Time = { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ };
const pheraSchema = new mongoose.Schema({
  date: { ...Day, required: true, index: true },
  team: { type: ObjectId, ref: 'Team', required: true, index: true },
  startTime: { ...Time, required: true },
  endTime: Time, // empty while the team is still out
  filledOut: { type: Vessels, default: () => ({}) },
  filledBack: { type: Vessels, default: () => ({}) },
  emptiesBack: { type: Vessels, default: () => ({}) },
});
pheraSchema.pre('validate', function () {
  if (this.endTime && this.endTime < this.startTime) this.invalidate('endTime', 'End time is before the start time');
  for (const p of PRODUCTS) {
    if ((this.filledBack?.[p] || 0) > (this.filledOut?.[p] || 0)) this.invalidate(`filledBack.${p}`, `More ${p.replace('_', ' ')}s came back filled than went out`);
  }
});
const Phera = mongoose.model('Phera', audited(pheraSchema));

const Settings = mongoose.model('Settings', audited(new mongoose.Schema({
  upiVpa: String,
  phone: String,
  address: String,
  about: String,
})));

module.exports = { normalizePhone, MOBILE, User, Customer, Product, Order, Collection, Settlement, Settings, Team, Phera };
