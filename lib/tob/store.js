// === TOB === Teacher Observation — data layer, settings, CRUD, coverage, publish.
// New collections only (tob*). Nothing existing is touched.
import { v4 as uuidv4 } from 'uuid'
import { deleteAnyFile } from '@/lib/store/storage.js'
import { TOB_FRAMEWORK, frameworkFor, stageForClass, validateItem } from '@/lib/tob/validate.js'
import * as LoMaster from '@/lib/lomaster/store.js'

export const TOB_COLL = {
  items: 'tobItems',         // chapters + sets (type field)
  registers: 'tobRegisters',
  jobs: 'tobImportJobs',
  fixLog: 'tobFixLog',       // admin marks-fix audit
  events: 'tobEvents',
}
export const TOB_SETTINGS_KEY = 'tob_settings'
export const TOB_DEFAULTS = Object.freeze({ enabled: true, viewAudience: 'everyone' }) // everyone | premium | nobody

export async function getTobSettings(db) {
  const doc = await db.collection('settings').findOne({ key: TOB_SETTINGS_KEY })
  return { ...TOB_DEFAULTS, ...(doc?.value || {}) }
}
export async function saveTobSettings(db, patch, user) {
  const next = { ...(await getTobSettings(db)), ...(patch || {}) }
  next.enabled = !!next.enabled
  if (!['everyone', 'premium', 'nobody'].includes(next.viewAudience)) next.viewAudience = 'everyone'
  await db.collection('settings').updateOne({ key: TOB_SETTINGS_KEY }, { $set: { key: TOB_SETTINGS_KEY, value: next, updatedAt: new Date(), updatedBy: user?.id || null } }, { upsert: true })
  return next
}
export async function ensureTobIndexes(db) {
  try {
    await db.collection(TOB_COLL.items).createIndex({ id: 1 }, { unique: true })
    await db.collection(TOB_COLL.items).createIndex({ class: 1, subject_id: 1, type: 1, term: 1, order: 1 })
  } catch (_) {}
}

export const FRAMEWORK = TOB_FRAMEWORK

// ---------------- Browse ----------------
const pub = { status: 'published' }
export async function listCourses(db, { includeDraft = false } = {}) {
  const rows = await db.collection(TOB_COLL.items).aggregate([
    { $match: includeDraft ? {} : pub },
    { $group: { _id: { class: '$class', subject_id: '$subject_id', subject_printed: '$subject_printed', stage: '$stage' }, chapters: { $sum: { $cond: [{ $eq: ['$type', 'chapter'] }, 1, 0] } }, sets: { $sum: { $cond: [{ $eq: ['$type', 'set'] }, 1, 0] } } } },
    { $sort: { '_id.class': 1, '_id.subject_id': 1 } },
  ]).toArray()
  return rows.map(r => ({ class: r._id.class, subject_id: r._id.subject_id, subject_printed: r._id.subject_printed, stage: r._id.stage, chapters: r.chapters, sets: r.sets }))
}

export async function listItems(db, { class: cls, subject_id, type, term, includeDraft = false } = {}) {
  const m = { ...(includeDraft ? {} : pub) }
  if (cls) m.class = String(cls)
  if (subject_id) m.subject_id = String(subject_id).toUpperCase()
  if (type) m.type = type
  if (term) m.term = (term === 'full' || term === 'FULL') ? 'full' : Number(term)
  const rows = await db.collection(TOB_COLL.items).find(m).sort({ type: 1, term: 1, order: 1, chapterNo: 1, setCode: 1 }).toArray()
  return rows.map(itemCard)
}
export function itemCard(i) {
  return {
    id: i.id, type: i.type, class: i.class, subject_id: i.subject_id, subject_printed: i.subject_printed, stage: i.stage,
    term: i.term, setCode: i.setCode, chapterNo: i.chapterNo, title: i.title,
    marks: effectiveMarks(i), weightage: i.weightage, coverage: i.coverage,
    validation: { status: i.validation?.status, redCount: i.validation?.redCount, yellowCount: i.validation?.yellowCount },
    status: i.status, order: i.order,
  }
}
// Teacher display uses framework config values (always correct) once GREEN/approved.
export function effectiveMarks(i) {
  const sfw = frameworkFor(i.stage, i.subject_id)
  const green = i.validation?.status === 'green' || i.marksApproved
  if (sfw.kind === 'components') {
    const c = i.marks?.components || {}
    const parts = sfw.components.map(cc => ({ key: cc.key, label: cc.label, marks: green ? cc.marks : (c[cc.key] ?? null) }))
    return { components: true, total: green ? sfw.total : i.marks?.total, parts, performance: i.marks?.performance ?? sfw.performance ?? null, source: green ? 'framework' : 'file', unverified: !green }
  }
  if (sfw.kind === 'unset') {
    return { frameworkUnset: true, total: i.marks?.total, source: 'file', unverified: true }
  }
  const fw = FRAMEWORK[i.stage]
  if (!fw || !fw.marks) return { marks: false }
  if (green) return { total: fw.total, written: fw.written, project: fw.project, diary: fw.diary, weightage: fw.weightage, source: 'framework' }
  return { total: i.marks?.total, written: i.marks?.written, project: i.marks?.project, diary: i.marks?.diary, weightage: i.marks?.weightage, source: 'file', unverified: true }
}

export async function getItem(db, id, { includeDraft = false } = {}) {
  const i = await db.collection(TOB_COLL.items).findOne({ id, ...(includeDraft ? {} : pub) })
  if (!i) return null
  return { ...itemCard(i), cards: i.cards, partACount: i.partACount, partBCount: i.partBCount, fullTitle: i.fullTitle, validation: i.validation }
}

// Year view: across all items of a class+subject (optionally a term), which of the
// master LOs are covered and how many times (tasks vs projects separated).
export async function coverageMatrix(db, { class: cls, subject_id, term, includeDraft = false }) {
  const m = { class: String(cls), subject_id: String(subject_id).toUpperCase(), ...(includeDraft ? {} : pub) }
  if (term) m.term = (term === 'full' || term === 'FULL') ? 'full' : Number(term)
  const items = await db.collection(TOB_COLL.items).find(m).toArray()
  const count = new Map()  // code -> {task, project, total}
  for (const it of items) {
    for (const card of (it.cards || [])) {
      for (const lo of (card.los || [])) {
        const code = String(lo.lo_code || '').toUpperCase().replace(/\s+/g, ' ').trim()
        if (!code) continue
        const c = count.get(code) || { task: 0, project: 0, total: 0 }
        if (card.part === 'B') c.project++; else c.task++
        c.total++
        count.set(code, c)
      }
    }
  }
  return { class: String(cls), subject_id: m.subject_id, term: term || null, items: items.length, counts: Object.fromEntries(count) }
}

// ---------------- Admin ----------------
export async function adminList(db, { class: cls, subject_id } = {}) {
  const m = { status: { $ne: 'trashed' } }
  if (cls) m.class = String(cls)
  if (subject_id) m.subject_id = String(subject_id).toUpperCase()
  const rows = await db.collection(TOB_COLL.items).find(m).sort({ class: 1, subject_id: 1, type: 1, term: 1, order: 1 }).toArray()
  return rows.map(i => ({ ...itemCard(i), fileMarks: i.marks, hasHtml: !!i.htmlRef, checks: i.validation?.checks || [] }))
}

export async function setItemStatus(db, id, status) {
  const i = await db.collection(TOB_COLL.items).findOne({ id })
  if (!i) return { ok: false, error: 'not found' }
  if (status === 'published' && i.validation?.status === 'red' && !i.redOverride) return { ok: false, error: 'Cannot publish: item has RED validation errors. Fix them or override with a reason.' }
  await db.collection(TOB_COLL.items).updateOne({ id }, { $set: { status, updatedAt: new Date() } })
  return { ok: true }
}
// === TOB === #4: per-item Term override from the Items & Validation table.
export async function setItemTerm(db, id, term) {
  const t = (term === '1' || term === 1) ? 1 : (term === '2' || term === 2) ? 2 : (term === 'full' || term === null) ? null : undefined
  if (t === undefined) return { ok: false, error: 'term must be 1, 2 or full' }
  const i = await db.collection(TOB_COLL.items).findOne({ id })
  if (!i) return { ok: false, error: 'not found' }
  await db.collection(TOB_COLL.items).updateOne({ id }, { $set: { term: t, updatedAt: new Date() } })
  return { ok: true, term: t }
}
export async function publishCourse(db, { class: cls, subject_id }, status) {
  const m = { class: String(cls), subject_id: String(subject_id).toUpperCase() }
  if (status === 'published') {
    // Publish GREEN or YELLOW (or admin-approved). Skip only RED that isn't overridden.
    const approved = { $or: [{ 'validation.status': 'green' }, { 'validation.status': 'yellow' }, { redOverride: true }, { marksApproved: true }, { type: 'register' }] }
    const skippedDocs = await db.collection(TOB_COLL.items).find({ ...m, $nor: [approved] }).project({ title: 1, type: 1, chapterNo: 1, setCode: 1, validation: 1 }).toArray()
    const r = await db.collection(TOB_COLL.items).updateMany({ ...m, ...approved }, { $set: { status: 'published', updatedAt: new Date() } })
    await db.collection(TOB_COLL.registers).updateMany(m, { $set: { status: 'published', updatedAt: new Date() } })
    return {
      ok: true, status, published: r.modifiedCount, skippedCount: skippedDocs.length,
      skipped: skippedDocs.map(s => ({ title: s.title, where: s.type === 'set' ? `Set ${s.setCode}` : `Ch ${s.chapterNo}`, status: s.validation?.status || 'unknown', reason: `RED — fix or override (${s.validation?.redCount || 0} red)` })),
      message: skippedDocs.length ? `Published ${r.modifiedCount} item(s). Skipped ${skippedDocs.length} RED item(s) — fix or override, then publish again.` : `Published all ${r.modifiedCount} item(s) (GREEN + YELLOW). Nothing left half-published.`,
    }
  }
  const r = await db.collection(TOB_COLL.items).updateMany(m, { $set: { status, updatedAt: new Date() } })
  await db.collection(TOB_COLL.registers).updateMany(m, { $set: { status, updatedAt: new Date() } })
  return { ok: true, status, modified: r.modifiedCount, message: `Unpublished ${r.modifiedCount} item(s).` }
}

// Admin applies a marks fix (logged, never automatic). Uses the item's OWN subject
// framework — for AE it corrects to 10/5/5/5, NEVER to written 10 + project 15.
export async function applyMarksFix(db, id, user, reason = '') {
  const i = await db.collection(TOB_COLL.items).findOne({ id })
  if (!i) return { ok: false, error: 'not found' }
  const sfw = frameworkFor(i.stage, i.subject_id)
  if (sfw.kind === 'unset') return { ok: false, error: 'No marks framework is defined for this subject yet — cannot auto-apply.' }
  if (!sfw.marks) return { ok: false, error: 'stage has no marks' }
  const newMarks = sfw.kind === 'components'
    ? { total: sfw.total, components: Object.fromEntries(sfw.components.map(cc => [cc.key, cc.marks])), performance: i.marks?.performance ?? sfw.performance ?? null }
    : { total: sfw.total, written: sfw.written, project: sfw.project, diary: sfw.diary, weightage: sfw.weightage }
  await db.collection(TOB_COLL.fixLog).insertOne({ id: uuidv4(), itemId: id, by: user?.id, byName: user?.name, at: new Date(), old: i.marks, new: newMarks, reason })
  // Re-validate marks only: clear marks-related flags, recompute status
  const MARKS_CODES = ['MARKS', 'WEIGHTAGE', 'DIARY', 'RUBRIC', 'MARKS_AE', 'MARKS_COMP', 'MARKS_NOFW', 'MARK_LABEL']
  const remaining = (i.validation?.checks || []).filter(c => !MARKS_CODES.includes(c.code))
  const status = remaining.some(c => c.level === 'red') ? 'red' : remaining.some(c => c.level === 'yellow') ? 'yellow' : 'green'
  await db.collection(TOB_COLL.items).updateOne({ id }, { $set: { marks: newMarks, marksApproved: true, 'validation.checks': remaining, 'validation.status': status, 'validation.redCount': remaining.filter(c => c.level === 'red').length, 'validation.yellowCount': remaining.filter(c => c.level === 'yellow').length, updatedAt: new Date() } })
  return { ok: true, marks: newMarks, status }
}
export async function overrideRed(db, id, user, reason) {
  if (!reason) return { ok: false, error: 'reason required' }
  await db.collection(TOB_COLL.fixLog).insertOne({ id: uuidv4(), itemId: id, by: user?.id, byName: user?.name, at: new Date(), action: 'RED_OVERRIDE', reason })
  await db.collection(TOB_COLL.items).updateOne({ id }, { $set: { redOverride: true, redOverrideReason: reason, updatedAt: new Date() } })
  return { ok: true }
}

export async function deleteItem(db, id) {
  const i = await db.collection(TOB_COLL.items).findOne({ id })
  if (!i) return { ok: false, error: 'not found' }
  if (i.htmlRef) { try { await deleteAnyFile(i.htmlRef) } catch (_) {} }
  await db.collection(TOB_COLL.items).deleteOne({ id })
  return { ok: true }
}

export async function getRegister(db, { class: cls, subject_id }, { includeDraft = false } = {}) {
  return db.collection(TOB_COLL.registers).findOne({ class: String(cls), subject_id: String(subject_id).toUpperCase(), ...(includeDraft ? {} : pub) })
}

// Re-run the validator on already-imported items using the CURRENT active LO Master
// + framework — fixes items in place after the LO Master is (re)loaded. No re-import.
export async function revalidateItem(db, item) {
  const codeMap = await LoMaster.codeMap(db, { class: item.class, subject_id: item.subject_id })
  const masterRows = await LoMaster.rowsFor(db, { class: item.class, subject_id: item.subject_id })
  const parsedLike = { type: item.type, class: item.class, stage: item.stage, marks: item.marks, cards: item.cards }
  const v = validateItem(parsedLike, { codeMap, class: item.class, subject_id: item.subject_id, masterTotal: masterRows.length })
  let checks = v.checks, status = v.status
  // keep admin's marks approval: drop marks-related flags if already approved
  if (item.marksApproved) { checks = checks.filter(c => !['MARKS', 'WEIGHTAGE', 'DIARY', 'RUBRIC', 'MARKS_AE', 'MARKS_COMP', 'MARKS_NOFW', 'MARK_LABEL'].includes(c.code)); status = checks.some(c => c.level === 'red') ? 'red' : checks.some(c => c.level === 'yellow') ? 'yellow' : 'green' }
  const active = (await LoMaster.getActiveVersion(db))?.version || null
  await db.collection(TOB_COLL.items).updateOne({ id: item.id }, { $set: {
    cards: v.correctedCards, coverage: v.coverage,
    validation: { status, redCount: checks.filter(c => c.level === 'red').length, yellowCount: checks.filter(c => c.level === 'yellow').length, checks },
    loMasterVersion: active, updatedAt: new Date(),
  } })
  return status
}
export async function revalidateCourse(db, { class: cls, subject_id } = {}) {
  const m = {}
  if (cls) m.class = String(cls)
  if (subject_id) m.subject_id = String(subject_id).toUpperCase()
  const items = await db.collection(TOB_COLL.items).find(m).toArray()
  const summary = { total: items.length, green: 0, yellow: 0, red: 0 }
  for (const it of items) { const s = await revalidateItem(db, it); summary[s] = (summary[s] || 0) + 1 }
  return summary
}
