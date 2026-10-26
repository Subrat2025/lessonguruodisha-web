// === LO MASTER === OCF-SE 2026-27 Learning-Outcome master (read-only source of truth).
// New collections only: 'lomaster' (rows tagged with a version number) + 'lomasterVersions'
// (version metadata). Importing a new file creates a NEW version and marks it active;
// OLD versions/rows are NEVER deleted. Lookups always use the active version.
import { v4 as uuidv4 } from 'uuid'

export const LOM_COLL = { rows: 'lomaster', versions: 'lomasterVersions' }

export const LOM_FIELDS = ['class', 'class_name', 'stage', 'subject_id', 'subject_printed', 'cg', 'cg_text', 'competency', 'competency_text', 'lo_code', 'lo_text', 'page', 'unclear', 'corrected']

export async function ensureLomIndexes(db) {
  try {
    await db.collection(LOM_COLL.rows).createIndex({ version: 1, class: 1, subject_id: 1, lo_code: 1 })
    await db.collection(LOM_COLL.rows).createIndex({ version: 1, class: 1, subject_id: 1 })
    await db.collection(LOM_COLL.versions).createIndex({ version: 1 }, { unique: true })
  } catch (_) {}
}

export async function getActiveVersion(db) {
  const v = await db.collection(LOM_COLL.versions).findOne({ active: true })
  return v || null
}

// Normalise an LO code so "OD401", "OD 4.1.1", "od  4.1.1" all compare equal.
export function normCode(s) { return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim() }
export function normText(s) { return String(s || '').replace(/\s+/g, ' ').trim() }

// Import a fresh array of rows as a new active version.
export async function importLoMaster(db, rawRows, { user, note = '', fileName = '' } = {}) {
  await ensureLomIndexes(db)
  if (!Array.isArray(rawRows) || !rawRows.length) throw new Error('No rows to import')
  const last = await db.collection(LOM_COLL.versions).find({}).sort({ version: -1 }).limit(1).toArray()
  const version = (last[0]?.version || 0) + 1
  const now = new Date()
  const docs = rawRows.map(r => {
    const d = { id: uuidv4(), version }
    for (const f of LOM_FIELDS) d[f] = r[f] ?? ''
    d.class = String(d.class)
    d.subject_id = String(d.subject_id || '').toUpperCase()
    d._code = normCode(d.lo_code)
    return d
  })
  // insert rows in chunks
  for (let i = 0; i < docs.length; i += 1000) await db.collection(LOM_COLL.rows).insertMany(docs.slice(i, i + 1000))
  // mark this version active, others inactive (rows are kept either way)
  await db.collection(LOM_COLL.versions).updateMany({}, { $set: { active: false } })
  const meta = { id: uuidv4(), version, active: true, createdAt: now, createdBy: user?.id || null, createdByName: user?.name || null, note, fileName, rowCount: docs.length,
    classes: [...new Set(docs.map(d => d.class))].sort(), subjects: [...new Set(docs.map(d => d.subject_id))].sort() }
  await db.collection(LOM_COLL.versions).insertOne(meta)
  return meta
}

export async function listVersions(db) {
  return db.collection(LOM_COLL.versions).find({}).sort({ version: -1 }).toArray()
}

// Switch the active version (old rows are retained; items re-read current text).
export async function activateVersion(db, version) {
  const v = await db.collection(LOM_COLL.versions).findOne({ version: Number(version) })
  if (!v) throw new Error('Version not found')
  await db.collection(LOM_COLL.versions).updateMany({}, { $set: { active: false } })
  await db.collection(LOM_COLL.versions).updateOne({ version: Number(version) }, { $set: { active: true } })
  return db.collection(LOM_COLL.versions).findOne({ version: Number(version) })
}

async function activeVersionNum(db) { return (await getActiveVersion(db))?.version ?? null }

// Rows for a class+subject (active version), sorted by LO code.
export async function rowsFor(db, { class: cls, subject_id, version }) {
  const v = version ?? await activeVersionNum(db)
  if (v == null) return []
  const q = { version: v }
  if (cls != null && cls !== '') q.class = String(cls)
  if (subject_id) q.subject_id = String(subject_id).toUpperCase()
  const rows = await db.collection(LOM_COLL.rows).find(q).toArray()
  return rows.map(stripRow).sort((a, b) => a.lo_code.localeCompare(b.lo_code, undefined, { numeric: true }))
}

function stripRow(r) { const o = {}; for (const f of LOM_FIELDS) o[f] = r[f]; return o }

// Lookup map keyed by normalised LO code (for the validator).
export async function codeMap(db, { class: cls, subject_id, version }) {
  const rows = await rowsFor(db, { class: cls, subject_id, version })
  const m = new Map()
  for (const r of rows) m.set(normCode(r.lo_code), r)
  return m
}

// Summary: distinct CGs / competencies / LOs for a class+subject.
export async function summary(db, { class: cls, subject_id, version }) {
  const rows = await rowsFor(db, { class: cls, subject_id, version })
  const cgs = new Map(), comps = new Map()
  for (const r of rows) {
    if (r.cg) cgs.set(r.cg, r.cg_text)
    if (r.competency) comps.set(r.competency, { text: r.competency_text, cg: r.cg })
  }
  return {
    class: String(cls), subject_id: (subject_id || '').toUpperCase(),
    subject_printed: rows[0]?.subject_printed || '', stage: rows[0]?.stage || '',
    counts: { cg: cgs.size, competency: comps.size, lo: rows.length },
    cgs: [...cgs].map(([code, text]) => ({ code, text })),
    competencies: [...comps].map(([code, v]) => ({ code, text: v.text, cg: v.cg })),
    los: rows.map(r => ({ lo_code: r.lo_code, lo_text: r.lo_text, cg: r.cg, cg_text: r.cg_text, competency: r.competency, competency_text: r.competency_text })),
  }
}

// Full-text-ish search within the active version.
export async function search(db, { class: cls, subject_id, q = '', limit = 200 }) {
  const rows = await rowsFor(db, { class: cls, subject_id })
  const s = normText(q).toLowerCase()
  const out = !s ? rows : rows.filter(r =>
    (r.lo_code || '').toLowerCase().includes(s) || (r.lo_text || '').toLowerCase().includes(s) ||
    (r.cg || '').toLowerCase().includes(s) || (r.cg_text || '').toLowerCase().includes(s) ||
    (r.competency || '').toLowerCase().includes(s) || (r.competency_text || '').toLowerCase().includes(s))
  return out.slice(0, limit)
}

// Distinct class/subject matrix for the admin picker (active version).
export async function matrix(db) {
  const v = await activeVersionNum(db)
  if (v == null) return { version: null, classes: [], items: [] }
  const rows = await db.collection(LOM_COLL.rows).aggregate([
    { $match: { version: v } },
    { $group: { _id: { class: '$class', subject_id: '$subject_id' }, subject_printed: { $first: '$subject_printed' }, stage: { $first: '$stage' }, los: { $sum: 1 } } },
    { $sort: { '_id.class': 1, '_id.subject_id': 1 } },
  ]).toArray()
  return {
    version: v,
    classes: [...new Set(rows.map(r => r._id.class))],
    items: rows.map(r => ({ class: r._id.class, subject_id: r._id.subject_id, subject_printed: r.subject_printed, stage: r.stage, los: r.los })),
  }
}
