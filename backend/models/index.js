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
  phone: { type: String, trim: true, match: /^\+?\d{10,13}$/ },
  address: String,
  category: { type: String, enum: ['regular', 'party'], default: 'regular' },
  notes: String,
})));

const Product = mongoose.model('Product', audited(new mongoose.Schema({
  key: { type: String, enum: PRODUCTS, required: true, unique: true },
  name: { type: String, required: true },
  nameGu: String,
  price: { ...money, required: true },
})));

const Order = mongoose.model('Order', audited(new mongoose.Schema({
  date: { ...Day, required: true, index: true },
  customer: { type: ObjectId, ref: 'Customer', required: true, index: true },
  qty: { type: Vessels, default: () => ({}) },
  emptiesBack: { type: Vessels, default: () => ({}) },
  deliveryType: { type: String, enum: ['self', 'ours'], default: 'ours' },
  deliveryCharge: money,
  total: money, // prices are snapshotted into this at save time
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

const Settings = mongoose.model('Settings', audited(new mongoose.Schema({
  businessName: String,
  upiVpa: String,
  phone: String,
  address: String,
  about: String,
})));

module.exports = { User, Customer, Product, Order, Collection, Settlement, Settings };
