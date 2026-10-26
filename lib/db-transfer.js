// One-time "copy the whole database to my new MongoDB" for moving hosts (admin only).
// The live server reads its own database and writes every collection, with its indexes and views,
// into a target MongoDB (e.g. a new Atlas cluster). The source is only READ, never changed.
// The target URL is kept in memory for the run only: never saved to the database or logged.
import { MongoClient, BSON } from 'mongodb'

const BATCH_DOCS = 1000
const BATCH_BYTES = 8 * 1024 * 1024
const INDEX_OPTION_KEYS = ['unique', 'sparse', 'expireAfterSeconds', 'partialFilterExpression', 'collation',
  'weights', 'default_language', 'language_override', 'textIndexVersion', '2dsphereIndexVersion', 'bits', 'min', 'max',
  'wildcardProjection', 'hidden']

// One job per server process
const g = globalThis
if (!g.__dbTransfer) g.__dbTransfer = { running: false, status: 'idle', startedAt: null, finishedAt: null, target: '', current: '', rows: [], error: '', by: '' }
export const transferState = () => ({ ...g.__dbTransfer, rows: g.__dbTransfer.rows.map((r) => ({ ...r })) })

/** "mongodb+srv://user:pass@host/x" -> "mongodb+srv://user:••••@host" (for display only) */
export function maskUrl(url) {
  const m = String(url).match(/^(mongodb(?:\+srv)?:\/\/)(?:([^:@/]*)(?::[^@/]*)?@)?([^/?]+)/)
  return m ? `${m[1]}${m[2] ? m[2] + ':••••@' : ''}${m[3]}` : '(invalid)'
}
const hostOf = (url) => (String(url).match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/) || [])[1] || ''

/** Copies all collections of `src` (a Db) into `dst` (a Db), emptying each target collection first. */
export async function copyAll(src, dst, onRow = () => {}) {
  const infos = (await src.listCollections({}, { nameOnly: false }).toArray())
    .filter((c) => !c.name.startsWith('system.'))
    .sort((a, b) => a.name.localeCompare(b.name))
  const collections = infos.filter((c) => c.type !== 'view')
  const views = infos.filter((c) => c.type === 'view')
  const rows = collections.map((c) => ({ name: c.name, source: null, copied: 0, target: null, state: 'waiting' }))
  onRow(rows)

  for (let i = 0; i < collections.length; i++) {
    const info = collections[i], row = rows[i], name = info.name
    row.state = 'copying'
    const from = src.collection(name)
    row.source = await from.countDocuments({})
    onRow(rows)

    await dst.collection(name).drop().catch(() => {}) // target only
    const opts = { ...(info.options || {}) }
    delete opts.uuid
    await dst.createCollection(name, opts).catch((e) => { if (e.codeName !== 'NamespaceExists' && e.code !== 48) throw e })
    const to = dst.collection(name)

    let batch = [], bytes = 0
    const flush = async () => {
      if (!batch.length) return
      // bypassDocumentValidation needs the dbAdmin/restore role; plain readWrite users get "not authorized"
      await to.insertMany(batch, { ordered: false, bypassDocumentValidation: true }).catch((e) => {
        if (e.code !== 13 && e.codeName !== 'Unauthorized' && !/not allowed to do action \[bypassDocumentValidation\]/.test(e.message)) throw e
        return to.insertMany(batch, { ordered: false })
      })
      row.copied += batch.length; batch = []; bytes = 0
      onRow(rows)
    }
    for await (const doc of from.find({}, { batchSize: BATCH_DOCS })) {
      const size = BSON.calculateObjectSize(doc)
      if (batch.length && (batch.length >= BATCH_DOCS || bytes + size > BATCH_BYTES)) await flush()
      batch.push(doc); bytes += size
    }
    await flush()

    const indexes = (await from.listIndexes().toArray()).filter((ix) => ix.name !== '_id_')
    if (indexes.length) {
      await to.createIndexes(indexes.map((ix) => {
        const spec = { key: ix.key, name: ix.name }
        for (const k of INDEX_OPTION_KEYS) if (ix[k] !== undefined) spec[k] = ix[k]
        return spec
      }))
    }
    row.target = await to.countDocuments({})
    row.state = row.target === row.source ? 'ok' : 'mismatch'
    onRow(rows)
  }
  for (const v of views) {
    await dst.collection(v.name).drop().catch(() => {})
    await dst.createCollection(v.name, { viewOn: v.options.viewOn, pipeline: v.options.pipeline || [] })
  }
  return rows
}

/**
 * Starts the copy in the background. Throws on bad input or if a copy is already running.
 * @param {import('mongodb').Db} srcDb  this server's own database
 */
export async function startTransfer(srcDb, { targetUrl, targetDb, by = '' }) {
  const s = g.__dbTransfer
  if (s.running) throw Object.assign(new Error('A copy is already running.'), { status: 409 })
  targetUrl = String(targetUrl || '').trim()
  targetDb = String(targetDb || '').trim() || srcDb.databaseName
  if (!/^mongodb(\+srv)?:\/\/[^\s]+$/.test(targetUrl)) throw Object.assign(new Error('Enter a MongoDB address that starts with mongodb+srv:// or mongodb://'), { status: 400 })
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(targetDb)) throw Object.assign(new Error('Database name: letters, numbers, _ and - only.'), { status: 400 })
  const user = (targetUrl.match(/^mongodb(?:\+srv)?:\/\/([^:@/]+)[:@]/) || [])[1]
  if (user && decodeURIComponent(user) === targetDb && targetDb !== srcDb.databaseName) {
    throw Object.assign(new Error(`"${targetDb}" is the database USER name (the browser may have filled it in). Use the database name "${srcDb.databaseName}".`), { status: 400 })
  }
  const srcHost = hostOf(process.env.MONGO_URL || '')
  if (srcHost && hostOf(targetUrl) === srcHost && targetDb === srcDb.databaseName) {
    throw Object.assign(new Error('That is this site\'s own database. Enter the NEW database address.'), { status: 400 })
  }

  // Connect first so a wrong address/password is reported straight away
  const client = new MongoClient(targetUrl, { serverSelectionTimeoutMS: 15000, retryWrites: true })
  try { await client.connect(); await client.db(targetDb).command({ ping: 1 }) } catch (e) {
    await client.close().catch(() => {})
    throw Object.assign(new Error('Cannot connect to the new database: ' + (e.message || e)), { status: 400 })
  }

  Object.assign(s, { running: true, status: 'running', startedAt: new Date().toISOString(), finishedAt: null, target: `${maskUrl(targetUrl)} / ${targetDb}`, current: '', rows: [], error: '', by })
  ;(async () => {
    try {
      await copyAll(srcDb, client.db(targetDb), (rows) => { s.rows = rows; s.current = (rows.find((r) => r.state === 'copying') || {}).name || '' })
      s.status = s.rows.every((r) => r.state === 'ok') ? 'done' : 'done_with_mismatch'
    } catch (e) {
      s.status = 'failed'; s.error = String(e && e.message || e).replace(targetUrl, maskUrl(targetUrl))
    } finally {
      s.running = false; s.current = ''; s.finishedAt = new Date().toISOString()
      await client.close().catch(() => {})
    }
  })()
  return transferState()
}
