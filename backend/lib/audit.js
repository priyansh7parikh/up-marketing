// Who-did-what for every audited model. The logged-in user rides along in AsyncLocalStorage
// (set by auth.requireAuth), so routes never pass it around and can't forget to log.
const { AsyncLocalStorage } = require('node:async_hooks');
const mongoose = require('mongoose');

const als = new AsyncLocalStorage();
const { ObjectId, Mixed } = mongoose.Schema.Types;

const AuditLog = mongoose.model('AuditLog', new mongoose.Schema({
  at: { type: Date, default: Date.now, index: true },
  by: { type: ObjectId, ref: 'User' },
  byName: String,
  role: String,
  model: String,
  docId: { type: ObjectId, index: true },
  action: { type: String, enum: ['create', 'update', 'delete'] },
  changes: Mixed, // update: { path: { from, to } }
  snapshot: Mixed, // create/delete: the whole document
}));

const SKIP = new Set(['_id', '__v', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']);
const isLeaf = (v) => !v || typeof v !== 'object' || Array.isArray(v) || v instanceof Date || v._bsontype;
function flat(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (isLeaf(v)) out[prefix + k] = v;
    else flat(v, `${prefix + k}.`, out);
  }
  return out;
}
function diff(before, after) {
  const a = flat(before);
  const b = flat(after);
  const changes = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!SKIP.has(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k])) changes[k] = { from: a[k], to: b[k] };
  }
  return changes;
}

function currentUser() {
  const user = als.getStore()?.user;
  if (!user) throw new Error('audit: no user in context; write inside an authenticated request or asUser()');
  return user;
}

function auditPlugin(schema) {
  schema.add({ createdBy: { type: ObjectId, ref: 'User' }, updatedBy: { type: ObjectId, ref: 'User' } });
  schema.set('timestamps', true);
  schema.set('optimisticConcurrency', true); // every save bumps __v and only lands if nobody saved in between

  // Query-style writes skip document hooks, so they'd skip the audit. Force load → change → save().
  const blocked = function () { throw new Error(`${this.model.modelName}: use doc.save()/doc.deleteOne() so changes are audited`); };
  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndDelete', 'deleteMany'], { query: true, document: false }, blocked);
  // shortcut: Model.deleteOne() isn't blocked because doc.deleteOne() goes through the same query hook in Mongoose 8; routes must delete via the loaded doc.

  schema.post('init', function () { this.$locals.before = this.toObject({ depopulate: true }); });

  schema.pre('save', function () {
    const user = currentUser();
    this.$locals.wasNew = this.isNew;
    if (this.isNew && !this.$locals.restored) this.createdBy = user.id; // a restored entry keeps who first entered it
    else this.updatedBy = user.id;
  });

  schema.post('save', async function () {
    const user = currentUser();
    const after = this.toObject({ depopulate: true });
    const isNew = this.$locals.wasNew;
    const changes = isNew ? undefined : diff(this.$locals.before, after);
    this.$locals.before = after;
    if (!isNew && !Object.keys(changes).length) return;
    await AuditLog.create({
      by: user.id, byName: user.name, role: user.role,
      model: this.constructor.modelName, docId: this._id,
      action: isNew ? 'create' : 'update', changes, snapshot: isNew ? after : undefined,
    });
  });

  schema.post('deleteOne', { document: true, query: false }, async function () {
    const user = currentUser();
    await AuditLog.create({
      by: user.id, byName: user.name, role: user.role,
      model: this.constructor.modelName, docId: this._id,
      action: 'delete', snapshot: this.toObject({ depopulate: true }),
    });
  });
}

// For scripts/seeding/tests: run fn as a given user (default: system).
const asUser = (user, fn) => als.run({ user: user || { id: null, name: 'system', role: 'admin' } }, fn);

module.exports = { als, asUser, auditPlugin, AuditLog, diff };
