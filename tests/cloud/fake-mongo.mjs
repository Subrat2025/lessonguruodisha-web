// Minimal in-memory stand-in for the subset of the MongoDB driver used by lib/cloud-files.js.
// Values are structured-cloned on the way in and out (Buffers come back as Uint8Array, like
// the driver's Binary), so callers can't rely on shared references.
const clone = (v) => structuredClone(v)
const get = (doc, k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), doc)

function match(doc, filter = {}) {
  return Object.entries(filter).every(([k, cond]) => {
    const v = get(doc, k)
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
      if ('$regex' in cond) return typeof v === 'string' && new RegExp(cond.$regex, cond.$options || '').test(v)
      if ('$exists' in cond) return (v !== undefined) === cond.$exists
      if ('$in' in cond) return cond.$in.includes(v)
      const ops = { $gte: (a, b) => a >= b, $gt: (a, b) => a > b, $lte: (a, b) => a <= b, $lt: (a, b) => a < b }
      const keys = Object.keys(cond).filter(k => k in ops)
      if (keys.length) return v != null && keys.every(k => ops[k](+v, +cond[k]))
    }
    if (cond === null) return v == null
    return v instanceof Date && cond instanceof Date ? +v === +cond : v === cond
  })
}

class Cursor {
  constructor(rows) { this.rows = rows; this._sort = null; this._skip = 0; this._limit = 0 }
  sort(s) { this._sort = s; return this }
  skip(n) { this._skip = n; return this }
  limit(n) { this._limit = n; return this }
  async toArray() {
    let r = [...this.rows]
    if (this._sort) {
      const [[k, dir]] = Object.entries(this._sort)
      r.sort((a, b) => { const x = get(a, k), y = get(b, k); return (x > y ? 1 : x < y ? -1 : 0) * dir })
    }
    r = r.slice(this._skip, this._limit ? this._skip + this._limit : undefined)
    return r.map(clone)
  }
}

class Collection {
  constructor() { this.docs = []; this.unique = [] }
  async createIndex(spec, opts = {}) { if (opts.unique) this.unique.push(Object.keys(spec)) }
  _checkUnique(doc) {
    for (const keys of this.unique) {
      if (this.docs.some(d => keys.every(k => get(d, k) === get(doc, k)))) {
        const e = new Error('E11000 duplicate key'); e.code = 11000; throw e
      }
    }
  }
  async insertOne(doc) { this._checkUnique(doc); this.docs.push(clone(doc)); return { acknowledged: true } }
  async insertMany(docs) { for (const d of docs) await this.insertOne(d); return { insertedCount: docs.length } }
  async findOne(f) { const d = this.docs.find(x => match(x, f)); return d ? clone(d) : null }
  find(f) { return new Cursor(this.docs.filter(x => match(x, f))) }
  async countDocuments(f) { return this.docs.filter(x => match(x, f)).length }
  async updateOne(f, upd) {
    const d = this.docs.find(x => match(x, f))
    if (!d) return { matchedCount: 0, modifiedCount: 0 }
    Object.assign(d, clone(upd.$set || {}))
    for (const [k, n] of Object.entries(upd.$inc || {})) d[k] = (d[k] || 0) + n
    for (const k of Object.keys(upd.$unset || {})) delete d[k]
    if (upd.$set && upd.$unset && Object.keys(upd.$unset).some(k => k in upd.$set)) { const e = new Error('Updating the path would create a conflict'); e.code = 40; throw e }
    return { matchedCount: 1, modifiedCount: 1 }
  }
  async deleteOne(f) { const i = this.docs.findIndex(x => match(x, f)); if (i >= 0) this.docs.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 } }
  async deleteMany(f) { const n = this.docs.length; this.docs = this.docs.filter(x => !match(x, f)); return { deletedCount: n - this.docs.length } }
  aggregate(pipeline) {
    let rows = this.docs
    const out = []
    for (const st of pipeline) {
      if (st.$match) rows = rows.filter(x => match(x, st.$match))
      if (st.$group) {
        if (!rows.length) continue
        const g = { _id: null }
        for (const [k, spec] of Object.entries(st.$group)) {
          if (k === '_id') continue
          const s = spec.$sum
          g[k] = rows.reduce((a, r) => a + (s === 1 ? 1 : (get(r, s.slice(1)) || 0)), 0)
        }
        out.push(g)
        rows = out
      }
    }
    return { toArray: async () => rows.map(clone) }
  }
}

const cols = new Map()
const db = { collection: (n) => { if (!cols.has(n)) cols.set(n, new Collection()); return cols.get(n) } }
export async function getDb() { return db }
export const __db = db
