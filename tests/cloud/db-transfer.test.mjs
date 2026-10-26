// lib/db-transfer.js against an in-memory stand-in for the MongoDB Db API.
import test from 'node:test'
import assert from 'node:assert/strict'
import { copyAll, maskUrl, startTransfer } from '../../lib/db-transfer.js'

const cursor = (arr) => ({ toArray: async () => arr.map((x) => structuredClone(x)), async *[Symbol.asyncIterator]() { for (const x of arr) yield structuredClone(x) } })
function fakeDb(databaseName = 'edumaster_odisha') {
  const cols = new Map()
  const ensure = (name, options = {}, type = 'collection') => { const c = { docs: [], indexes: [{ v: 2, key: { _id: 1 }, name: '_id_' }], options, type }; cols.set(name, c); return c }
  const col = (name) => ({
    countDocuments: async () => cols.get(name)?.docs.length ?? 0,
    drop: async () => { if (!cols.delete(name)) throw new Error('ns not found') },
    find: () => cursor(cols.get(name)?.docs ?? []),
    insertMany: async (docs) => { const c = cols.get(name) || ensure(name); for (const d of docs) c.docs.push(structuredClone(d)) },
    listIndexes: () => cursor(cols.get(name)?.indexes ?? []),
    createIndexes: async (specs) => { const c = cols.get(name); for (const s of specs) c.indexes.push({ v: 2, ...s }) },
  })
  return {
    databaseName, cols, ensure, collection: col,
    listCollections: () => cursor([...cols].map(([name, c]) => ({ name, type: c.type, options: c.options }))),
    createCollection: async (name, options = {}) => { if (cols.has(name)) throw Object.assign(new Error('exists'), { code: 48 }); ensure(name, options, options.viewOn ? 'view' : 'collection') },
  }
}

test('copies every collection, index and view; source untouched; target replaced', async () => {
  const src = fakeDb()
  const users = src.ensure('users')
  for (let i = 0; i < 2503; i++) users.docs.push({ _id: 'u' + i, mobile: String(9e9 + i) })
  users.indexes.push({ v: 2, key: { mobile: 1 }, name: 'mobile_1', unique: true })
  const big = src.ensure('chunks', { uuid: 'x' })
  for (let i = 0; i < 12; i++) big.docs.push({ _id: 'c' + i, data: 'x'.repeat(1024 * 1024) })
  src.ensure('system.profile').docs.push({ _id: 1 })
  src.ensure('active', { viewOn: 'users', pipeline: [] }, 'view')
  const before = JSON.stringify([...src.cols])

  const dst = fakeDb()
  dst.ensure('users').docs.push({ _id: 'stale' }) // old test data in the target is replaced
  const seen = []
  const rows = await copyAll(src, dst, (r) => seen.push(r.map((x) => x.state).join()))
  assert.deepEqual(rows.map((r) => [r.name, r.source, r.target, r.state]), [['chunks', 12, 12, 'ok'], ['users', 2503, 2503, 'ok']])
  assert.equal(dst.cols.get('users').docs.some((d) => d._id === 'stale'), false)
  assert.ok(dst.cols.get('users').indexes.some((ix) => ix.name === 'mobile_1' && ix.unique))
  assert.equal(dst.cols.get('active').type, 'view')
  assert.equal(dst.cols.has('system.profile'), false)
  assert.equal(JSON.stringify([...src.cols]), before)
  assert.ok(seen.length > 3)
})

test('maskUrl hides the password', () => {
  assert.equal(maskUrl('mongodb+srv://app:S3cr3t@lessonguru.ab12.mongodb.net/?retryWrites=true'), 'mongodb+srv://app:••••@lessonguru.ab12.mongodb.net')
  assert.equal(maskUrl('nonsense'), '(invalid)')
})

test('refuses bad addresses and the live database itself', async () => {
  process.env.MONGO_URL = 'mongodb+srv://x:y@customer-apps.lxqsv8.mongodb.net/?appName=a'
  const src = fakeDb()
  await assert.rejects(startTransfer(src, { targetUrl: 'http://evil', targetDb: 'a' }), /starts with mongodb/)
  await assert.rejects(startTransfer(src, { targetUrl: 'mongodb+srv://other:pw@customer-apps.lxqsv8.mongodb.net/', targetDb: '' }), /own database/)
  await assert.rejects(startTransfer(src, { targetUrl: 'mongodb://a:b@new.example/', targetDb: 'bad name!' }), /letters, numbers/)
  await assert.rejects(startTransfer(src, { targetUrl: 'mongodb+srv://lessonguru_app:pw@m.telf.mongodb.net/', targetDb: 'lessonguru_app' }), /USER name.*edumaster_odisha/)
})

test('falls back to plain inserts when the user may not bypass validation', async () => {
  const src = fakeDb(); src.ensure('abpAudit').docs.push({ _id: 1 }, { _id: 2 })
  const dst = fakeDb(); const plain = dst.collection
  dst.collection = (n) => { const c = plain(n); const ins = c.insertMany; c.insertMany = async (docs, o = {}) => { if (o.bypassDocumentValidation) throw Object.assign(new Error('user is not allowed to do action [bypassDocumentValidation] on [x.abpAudit]'), { code: 13 }); return ins(docs, o) }; return c }
  const rows = await copyAll(src, dst)
  assert.deepEqual(rows.map((r) => [r.name, r.target, r.state]), [['abpAudit', 2, 'ok']])
})
