#!/usr/bin/env node
// Copy the whole Lesson Guru database from one MongoDB to another (Emergent → MongoDB Atlas).
// Copies every collection with its documents, indexes and views, then checks that the document
// counts match. The source is only read, never changed.
//
//   SOURCE_MONGO_URL=...  SOURCE_DB=...  TARGET_MONGO_URL=...  TARGET_DB=...  node scripts/copy-database.mjs [--replace] [--dry-run]
//
//   --dry-run  only list the collections and their sizes; nothing is written
//   --replace  empty each target collection before copying (use for the final copy before switching)
//
// SOURCE_DB / TARGET_DB default to DB_NAME. Without --replace the script stops if the target
// already has data, so a copy can't be mixed into an existing database by accident.

import { MongoClient, BSON } from 'mongodb'

const BATCH_DOCS = 1000
const BATCH_BYTES = 8 * 1024 * 1024 // stay well under MongoDB's 48 MB message limit
const INDEX_OPTION_KEYS = ['unique', 'sparse', 'expireAfterSeconds', 'partialFilterExpression', 'collation',
  'weights', 'default_language', 'language_override', 'textIndexVersion', '2dsphereIndexVersion', 'bits', 'min', 'max',
  'wildcardProjection', 'hidden']

const log = (...a) => console.log(...a)
const mb = (n) => (n / 1048576).toFixed(1) + ' MB'

/** Copies all collections of `src` (a Db) into `dst` (a Db). Returns [{ name, source, target }]. */
export async function copyDatabase(src, dst, { replace = false, dryRun = false, out = log } = {}) {
  const infos = (await src.listCollections({}, { nameOnly: false }).toArray())
    .filter((c) => !c.name.startsWith('system.'))
    .sort((a, b) => a.name.localeCompare(b.name))
  const collections = infos.filter((c) => c.type !== 'view')
  const views = infos.filter((c) => c.type === 'view')

  if (!dryRun && !replace) {
    const existing = (await dst.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'))
    for (const name of existing) {
      if (await dst.collection(name).estimatedDocumentCount() > 0) {
        throw new Error(`Target already has data in "${name}". Run again with --replace to overwrite the target, or use an empty database.`)
      }
    }
  }

  const report = []
  for (const info of collections) {
    const name = info.name
    const from = src.collection(name)
    const total = await from.countDocuments({})
    if (dryRun) { out(`  ${name.padEnd(40)} ${String(total).padStart(9)} docs`); report.push({ name, source: total, target: null }); continue }

    if (replace) await dst.collection(name).drop().catch(() => {})
    const opts = { ...(info.options || {}) }
    delete opts.uuid
    await dst.createCollection(name, opts).catch((e) => { if (e.codeName !== 'NamespaceExists' && e.code !== 48) throw e })
    const to = dst.collection(name)

    let copied = 0, batch = [], bytes = 0
    const flush = async () => {
      if (!batch.length) return
      await to.insertMany(batch, { ordered: false, bypassDocumentValidation: true })
      copied += batch.length; batch = []; bytes = 0
      if (process.stdout.isTTY) process.stdout.write(`\r  ${name}: ${copied}/${total}`)
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
    const target = await to.countDocuments({})
    report.push({ name, source: total, target, indexes: indexes.length })
    out(`${process.stdout.isTTY ? '\r' : ''}  ${name.padEnd(40)} ${String(target).padStart(9)} / ${String(total).padStart(9)} docs  ${indexes.length} indexes${target === total ? '' : '  <-- MISMATCH'}`)
  }

  for (const v of views) {
    if (dryRun) { out(`  ${v.name.padEnd(40)}      view`); continue }
    if (replace) await dst.collection(v.name).drop().catch(() => {})
    await dst.createCollection(v.name, { viewOn: v.options.viewOn, pipeline: v.options.pipeline || [] })
    out(`  ${v.name.padEnd(40)}      view`)
  }
  return report
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const dryRun = args.has('--dry-run'), replace = args.has('--replace')
  const srcUrl = process.env.SOURCE_MONGO_URL, dstUrl = process.env.TARGET_MONGO_URL
  const srcName = process.env.SOURCE_DB || process.env.DB_NAME, dstName = process.env.TARGET_DB || process.env.DB_NAME
  if (!srcUrl || !srcName || (!dryRun && (!dstUrl || !dstName))) {
    console.error('Set SOURCE_MONGO_URL, SOURCE_DB, TARGET_MONGO_URL and TARGET_DB (or DB_NAME for both). See the top of this file.')
    process.exit(2)
  }
  if (!dryRun && srcUrl === dstUrl && srcName === dstName) { console.error('Source and target are the same database.'); process.exit(2) }

  const src = new MongoClient(srcUrl, { readPreference: 'secondaryPreferred', serverSelectionTimeoutMS: 20000 })
  const dst = dryRun ? null : new MongoClient(dstUrl, { retryWrites: true, serverSelectionTimeoutMS: 20000 })
  const started = Date.now()
  try {
    log('Connecting to the old database (up to 20 s)...')
    await src.connect().catch((e) => { throw new Error(`cannot reach the OLD database: ${e.message}`) })
    if (dst) {
      log('Connecting to the new database...')
      await dst.connect().catch((e) => { throw new Error(`cannot reach the NEW database: ${e.message}`) })
    }
    log('Connected.')
    const stats = await src.db(srcName).stats().catch(() => null)
    log(`Source: ${srcName}${stats ? ` (${stats.collections} collections, ${mb(stats.dataSize)} data)` : ''}`)
    if (!dryRun) log(`Target: ${dstName}${replace ? '  (existing collections will be replaced)' : ''}`)
    const report = await copyDatabase(src.db(srcName), dst ? dst.db(dstName) : null, { replace, dryRun })
    if (dryRun) { log(`\nDry run: ${report.length} collections, ${report.reduce((s, r) => s + r.source, 0)} documents. Nothing was written.`); return }
    const bad = report.filter((r) => r.target !== r.source)
    const docs = report.reduce((s, r) => s + r.target, 0)
    log(`\nCopied ${report.length} collections, ${docs} documents in ${Math.round((Date.now() - started) / 1000)} s.`)
    if (bad.length) {
      log(`WARNING: counts differ in ${bad.length} collection(s): ${bad.map((r) => r.name).join(', ')}.`)
      log('If the old site was still in use during the copy, that is expected. Run again with --replace right before switching.')
      process.exitCode = 1
    } else log('All document counts match.')
  } finally {
    await src.close().catch(() => {}); if (dst) await dst.close().catch(() => {})
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error('\nCopy failed:', e.message); process.exit(1) })
