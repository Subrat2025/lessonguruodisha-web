// scripts/copy-database.mjs against an in-memory stand-in for the MongoDB Db API.
import test from 'node:test'
import assert from 'node:assert/strict'
import { copyDatabase } from '../../scripts/copy-database.mjs'

const cursor = (arr) => ({ toArray: async () => arr.map((x) => structuredClone(x)), async *[Symbol.asyncIterator]() { for (const x of arr) yield structuredClone(x) } })

function fakeDb() {
  const cols = new Map() // name -> { docs, indexes, options, type }
  const col = (name) => ({
    countDocuments: async () => cols.get(name)?.docs.length ?? 0,
    estimatedDocumentCount: async () => cols.get(name)?.docs.length ?? 0,
    drop: async () => { if (!cols.delete(name)) throw Object.assign(new Error('ns not found'), { codeName: 'NamespaceNotFound' }) },
    find: () => cursor(cols.get(name)?.docs ?? []),
    insertMany: async (docs) => {
      const c = cols.get(name) || ensure(name)
      for (const d of docs) {
        if (c.docs.some((x) => String(x._id) === String(d._id))) throw Object.assign(new Error('E11000 duplicate'), { code: 11000 })
        c.docs.push(structuredClone(d))
      }
      c.batches = (c.batches || 0) + 1
    },
    listIndexes: () => cursor(cols.get(name)?.indexes ?? []),
    createIndexes: async (specs) => { const c = cols.get(name); for (const s of specs) c.indexes.push({ v: 2, ...s }) },
  })
  const ensure = (name, options = {}, type = 'collection') => { const c = { docs: [], indexes: [{ v: 2, key: { _id: 1 }, name: '_id_' }], options, type }; cols.set(name, c); return c }
  return {
    cols,
    ensure,
    collection: col,
    listCollections: () => cursor([...cols].map(([name, c]) => ({ name, type: c.type, options: c.options }))),
    createCollection: async (name, options = {}) => {
      if (cols.has(name)) throw Object.assign(new Error('exists'), { codeName: 'NamespaceExists', code: 48 })
      ensure(name, options, options.viewOn ? 'view' : 'collection')
    },
  }
}

function seed() {
  const src = fakeDb()
  const users = src.ensure('users')
  for (let i = 0; i < 2503; i++) users.docs.push({ _id: 'u' + i, id: 'u' + i, mobile: String(9000000000 + i), name: 'Teacher ' + i, subscription: i % 3 ? null : { plan: 'yearly', expiryDate: new Date(2027, 0, 1) } })
  users.indexes.push({ v: 2, key: { mobile: 1 }, name: 'mobile_1', unique: true }, { v: 2, key: { createdAt: 1 }, name: 'ttl', expireAfterSeconds: 3600, partialFilterExpression: { temp: true } })
  const big = src.ensure('cloud_file_chunks', { validator: { $jsonSchema: { bsonType: 'object' } }, uuid: 'x' })
  for (let i = 0; i < 12; i++) big.docs.push({ _id: 'c' + i, data: 'x'.repeat(1024 * 1024) }) // 12 × 1 MB → split by size
  src.ensure('empty_one')
  src.ensure('system.profile').docs.push({ _id: 1 })
  src.ensure('active_users', { viewOn: 'users', pipeline: [{ $match: { subscription: { $ne: null } } }] }, 'view')
  return src
}

const quiet = { out: () => {} }

test('copies every collection, document and index; skips system collections; recreates views', async () => {
  const src = seed(), dst = fakeDb()
  const report = await copyDatabase(src, dst, quiet)
  assert.deepEqual(report.map((r) => r.name), ['cloud_file_chunks', 'empty_one', 'users'])
  for (const r of report) assert.equal(r.target, r.source)
  assert.equal(dst.cols.get('users').docs.length, 2503)
  assert.deepEqual(dst.cols.get('users').docs[17], src.cols.get('users').docs[17])
  assert.equal(dst.cols.get('users').batches, 3) // 1000-doc batches
  assert.ok(dst.cols.get('cloud_file_chunks').batches >= 2) // 8 MB byte cap splits the 12 MB collection
  const ix = dst.cols.get('users').indexes.find((i) => i.name === 'mobile_1')
  assert.equal(ix.unique, true)
  const ttl = dst.cols.get('users').indexes.find((i) => i.name === 'ttl')
  assert.equal(ttl.expireAfterSeconds, 3600); assert.deepEqual(ttl.partialFilterExpression, { temp: true })
  assert.equal(dst.cols.get('users').indexes.filter((i) => i.name === '_id_').length, 1)
  assert.ok(!dst.cols.has('system.profile'))
  assert.equal(dst.cols.get('active_users').type, 'view')
  assert.equal(dst.cols.get('active_users').options.viewOn, 'users')
  assert.ok(dst.cols.get('cloud_file_chunks').options.validator)
  assert.equal(dst.cols.get('cloud_file_chunks').options.uuid, undefined)
})

test('refuses to write into a target that already has data unless --replace', async () => {
  const src = seed(), dst = fakeDb()
  dst.ensure('users').docs.push({ _id: 'old' })
  await assert.rejects(copyDatabase(src, dst, quiet), /--replace/)
  assert.equal(dst.cols.get('users').docs.length, 1) // untouched
})

test('--replace makes a second run produce an exact fresh copy (final sync before switching)', async () => {
  const src = seed(), dst = fakeDb()
  await copyDatabase(src, dst, quiet)
  src.cols.get('users').docs.push({ _id: 'late', id: 'late', mobile: '1' }) // a teacher registered meanwhile
  src.cols.get('users').docs.shift() // and one deleted their account
  const report = await copyDatabase(src, dst, { ...quiet, replace: true })
  assert.equal(report.find((r) => r.name === 'users').target, 2503)
  assert.ok(dst.cols.get('users').docs.some((d) => d._id === 'late'))
  assert.ok(!dst.cols.get('users').docs.some((d) => d._id === 'u0'))
  assert.equal(dst.cols.get('active_users').type, 'view')
})

test('--dry-run writes nothing', async () => {
  const src = seed()
  const lines = []
  const report = await copyDatabase(src, null, { dryRun: true, out: (l) => lines.push(l) })
  assert.equal(report.find((r) => r.name === 'users').source, 2503)
  assert.ok(lines.some((l) => l.includes('active_users') && l.includes('view')))
})

test('the source is never modified', async () => {
  const src = seed(), before = JSON.stringify([...src.cols])
  await copyDatabase(src, fakeDb(), quiet)
  assert.equal(JSON.stringify([...src.cols]), before)
})
