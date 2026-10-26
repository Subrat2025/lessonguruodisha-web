// === ABP === Activity-based Panchapadi — data layer, settings, gating,
// chapter/period/year-plan CRUD, taught-progress, analytics, download controls.
// Writes ONLY to new 'abp*' collections + the 'abp_settings' setting key.
import { v4 as uuidv4 } from 'uuid'
import { isPremiumUser } from '@/lib/store/catalog.js'
import { deleteRaw, deleteAnyFile } from '@/lib/store/storage.js'

export const ABP_SETTINGS_KEY = 'abp_settings'

export const ABP_COLL = {
  chapters: 'abpChapters',
  periods: 'abpPeriods',
  yearPlans: 'abpYearPlans',
  jobs: 'abpImportJobs',
  progress: 'abpProgress',       // per-user "taught" ticks
  events: 'abpEvents',           // views / downloads telemetry
  downloadLogs: 'abpDownloadLogs',
  pdfCache: 'abpPdfCache',        // cached base (un-stamped) PDFs per chapter
}

// Download control defaults — everything OFF until the admin turns it on.
export const ABP_DEFAULTS = Object.freeze({
  enabled: true,                 // tool master visibility (teacher screens)
  viewAudience: 'premium',       // 'everyone' | 'premium' | 'nobody'
  freeFirstPeriod: true,         // 1st period of each chapter free to preview
  downloadWho: 'premium',        // 'everyone' | 'premium' | 'nobody'
  downloadLimitPerChapter: 5,    // per user per chapter
  download: {                    // 4-level ON/OFF — lower level overrides higher
    global: false,
    class: {},                   // { '4': true|false }
    subject: {},                 // { '4|ଓଡ଼ିଆ': true|false }
    chapter: {},                 // { <chapterId>: true|false }
  },
})

export function courseKey({ class: cls, subject, book }) { return `${cls}|${subject || ''}|${book || ''}` }
export function subjectKey({ class: cls, subject }) { return `${cls}|${subject || ''}` }

export async function getAbpSettings(db) {
  const doc = await db.collection('settings').findOne({ key: ABP_SETTINGS_KEY })
  const v = doc?.value || {}
  return { ...ABP_DEFAULTS, ...v, download: { ...ABP_DEFAULTS.download, ...(v.download || {}) } }
}
export async function saveAbpSettings(db, patch, adminUser) {
  const cur = await getAbpSettings(db)
  const next = { ...cur, ...(patch || {}) }
  if (patch?.download) next.download = { ...cur.download, ...patch.download }
  next.enabled = !!next.enabled
  next.freeFirstPeriod = !!next.freeFirstPeriod
  next.downloadLimitPerChapter = Math.max(0, Number(next.downloadLimitPerChapter) || 0)
  if (!['everyone', 'premium', 'nobody'].includes(next.viewAudience)) next.viewAudience = 'premium'
  if (!['everyone', 'premium', 'nobody'].includes(next.downloadWho)) next.downloadWho = 'premium'
  await db.collection('settings').updateOne(
    { key: ABP_SETTINGS_KEY },
    { $set: { key: ABP_SETTINGS_KEY, value: next, updatedAt: new Date(), updatedBy: adminUser?.id || null } },
    { upsert: true },
  )
  return next
}

export async function ensureAbpIndexes(db) {
  try {
    await db.collection(ABP_COLL.chapters).createIndex({ class: 1, subject: 1, book: 1, number: 1 })
    await db.collection(ABP_COLL.chapters).createIndex({ id: 1 }, { unique: true })
    await db.collection(ABP_COLL.periods).createIndex({ chapterId: 1, number: 1 })
    await db.collection(ABP_COLL.progress).createIndex({ userId: 1, chapterId: 1 })
    await db.collection(ABP_COLL.events).createIndex({ type: 1, createdAt: -1 })
    await db.collection(ABP_COLL.yearPlans).createIndex({ class: 1, subject: 1, book: 1 })
  } catch (_) { /* best-effort */ }
}

// ---------------- Download / view gating ----------------
// Lower level overrides higher: global → class → subject → chapter.
export function downloadEnabledFor(settings, { class: cls, subject, chapterId }) {
  const dl = settings.download || {}
  let on = !!dl.global
  if (cls != null && dl.class && dl.class[String(cls)] !== undefined) on = !!dl.class[String(cls)]
  const sk = subjectKey({ class: cls, subject })
  if (dl.subject && dl.subject[sk] !== undefined) on = !!dl.subject[sk]
  if (chapterId && dl.chapter && dl.chapter[chapterId] !== undefined) on = !!dl.chapter[chapterId]
  return on
}

// Can this user DOWNLOAD this chapter's PDF right now? Returns { ok, reason }.
export function canDownload(settings, user, { class: cls, subject, chapterId }) {
  if (user?.role === 'admin') return { ok: true }
  if (!downloadEnabledFor(settings, { class: cls, subject, chapterId })) return { ok: false, reason: 'DOWNLOAD_OFF' }
  if (settings.downloadWho === 'nobody') return { ok: false, reason: 'DOWNLOAD_OFF' }
  if (settings.downloadWho === 'premium' && !isPremiumUser(user)) return { ok: false, reason: 'PREMIUM_REQUIRED' }
  return { ok: true }
}

// Can this user VIEW a given period? period 1 is a free preview when freeFirstPeriod.
export function canViewPeriod(settings, user, periodNumber) {
  if (user?.role === 'admin') return { ok: true }
  if (settings.viewAudience === 'everyone') return { ok: true }
  if (settings.freeFirstPeriod && Number(periodNumber) === 1) return { ok: true, preview: true }
  if (settings.viewAudience === 'nobody') return { ok: false, reason: 'VIEW_OFF' }
  if (settings.viewAudience === 'premium' && !isPremiumUser(user)) return { ok: false, reason: 'PREMIUM_REQUIRED' }
  return { ok: true }
}

// ---------------- Public browse ----------------
const pub = { status: 'published' }

export async function listClasses(db, { includeDraft = false } = {}) {
  const match = includeDraft ? {} : pub
  const rows = await db.collection(ABP_COLL.chapters).aggregate([
    { $match: match },
    { $group: { _id: '$class', chapters: { $sum: 1 }, periods: { $sum: '$periodCount' } } },
    { $sort: { _id: 1 } },
  ]).toArray()
  return rows.map(r => ({ class: r._id, chapters: r.chapters, periods: r.periods }))
}

export async function listCourses(db, cls, { includeDraft = false } = {}) {
  const match = includeDraft ? { class: String(cls) } : { ...pub, class: String(cls) }
  const rows = await db.collection(ABP_COLL.chapters).aggregate([
    { $match: match },
    { $group: { _id: { subject: '$subject', book: '$book' }, chapters: { $sum: 1 }, periods: { $sum: '$periodCount' } } },
    { $sort: { '_id.subject': 1, '_id.book': 1 } },
  ]).toArray()
  // attach year plan availability
  const out = []
  for (const r of rows) {
    const yp = await db.collection(ABP_COLL.yearPlans).findOne({ class: String(cls), subject: r._id.subject, book: r._id.book, ...(includeDraft ? {} : pub) })
    out.push({ class: String(cls), subject: r._id.subject, book: r._id.book, chapters: r.chapters, periods: r.periods, hasYearPlan: !!yp })
  }
  return out
}

export async function listChapters(db, { class: cls, subject, book }, { includeDraft = false } = {}) {
  const match = { class: String(cls), subject, book, trashedAt: { $exists: false }, ...(includeDraft ? {} : pub) }
  const rows = await db.collection(ABP_COLL.chapters).find(match).sort({ order: 1, number: 1 }).toArray()
  return rows.map(chapterCard)
}

export function chapterCard(c) {
  return {
    id: c.id, number: c.number, title: c.title, titleFull: c.titleFull, genre: c.genre,
    class: c.class, subject: c.subject, book: c.book, classLabel: c.classLabel,
    theme: c.theme, periodCount: c.periodCount, status: c.status,
    mainCompetencies: c.mainCompetencies, mainLearningOutcomes: c.mainLearningOutcomes,
    loCodes: c.loCodes || [], order: c.order ?? c.number,
    warnings: c.warnings || [],
  }
}

export async function getChapterFull(db, chapterId, { includeDraft = false } = {}) {
  const c = await db.collection(ABP_COLL.chapters).findOne({ id: chapterId, ...(includeDraft ? {} : pub) })
  if (!c) return null
  const periods = await db.collection(ABP_COLL.periods).find({ chapterId }).sort({ number: 1 }).toArray()
  return { chapter: chapterCard(c), periods: periods.map(periodView) }
}

export function periodView(p) {
  return {
    id: p.id, chapterId: p.chapterId, number: p.number, title: p.title, chapLine: p.chapLine,
    curricularGoal: p.curricularGoal, competencies: p.competencies, learningOutcome: p.learningOutcome,
    objective: p.objective, skillFocus: p.skillFocus, loCodes: p.loCodes, tlm: p.tlm,
    differentiation: p.differentiation || '', multigrade: p.multigrade || '',
    stages: p.stages, assessment: p.assessment, homework: p.homework, warnings: p.warnings || [],
  }
}

export async function getYearPlan(db, { class: cls, subject, book }, { includeDraft = false } = {}) {
  return db.collection(ABP_COLL.yearPlans).findOne({ class: String(cls), subject, book, ...(includeDraft ? {} : pub) })
}

// ---------------- Taught progress ----------------
export async function toggleTaught(db, userId, { chapterId, periodId, taught }) {
  const key = { userId, chapterId, periodId }
  if (taught) await db.collection(ABP_COLL.progress).updateOne(key, { $set: { ...key, taughtAt: new Date() } }, { upsert: true })
  else await db.collection(ABP_COLL.progress).deleteOne(key)
  return getChapterProgress(db, userId, chapterId)
}
export async function getChapterProgress(db, userId, chapterId) {
  if (!userId) return { taught: [] }
  const rows = await db.collection(ABP_COLL.progress).find({ userId, chapterId }).project({ periodId: 1 }).toArray()
  return { taught: rows.map(r => r.periodId) }
}

// ---------------- Telemetry ----------------
export async function logAbpEvent(db, { type, chapterId = null, periodId = null, userId = null, meta = {} }) {
  try { await db.collection(ABP_COLL.events).insertOne({ id: uuidv4(), type, chapterId, periodId, userId, meta, createdAt: new Date() }) } catch (_) {}
}

// Per-user per-chapter download count (total, all-time).
export async function downloadCount(db, userId, chapterId) {
  if (!userId) return 0
  return db.collection(ABP_COLL.downloadLogs).countDocuments({ userId, chapterId, action: 'DOWNLOAD' })
}
export async function logAbpDownload(db, { userId, chapterId, documentId, kind = 'chapter', ip = null }) {
  try { await db.collection(ABP_COLL.downloadLogs).insertOne({ id: uuidv4(), userId, chapterId, documentId, kind, action: 'DOWNLOAD', ip, createdAt: new Date() }) } catch (_) {}
}

export async function abpAnalytics(db) {
  const EV = db.collection(ABP_COLL.events)
  const views = await EV.countDocuments({ type: 'chapter_view' })
  const periodViews = await EV.countDocuments({ type: 'period_view' })
  const downloads = await EV.countDocuments({ type: 'download' })
  const topRows = await EV.aggregate([
    { $match: { type: 'chapter_view', chapterId: { $ne: null } } },
    { $group: { _id: '$chapterId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 },
  ]).toArray()
  const ids = topRows.map(r => r._id)
  const chaps = ids.length ? await db.collection(ABP_COLL.chapters).find({ id: { $in: ids } }).project({ id: 1, title: 1, number: 1, class: 1, subject: 1 }).toArray() : []
  const byId = Object.fromEntries(chaps.map(c => [c.id, c]))
  const top = topRows.map(r => ({ chapterId: r._id, views: r.n, title: byId[r._id]?.title || r._id, number: byId[r._id]?.number, class: byId[r._id]?.class, subject: byId[r._id]?.subject }))
  const taughtTotal = await db.collection(ABP_COLL.progress).countDocuments({})
  return { views, periodViews, downloads, top, taughtTotal }
}

// ---------------- Admin chapter management ----------------
export async function updateChapter(db, chapterId, patch) {
  const allow = {}
  for (const k of ['title', 'titleFull', 'genre', 'order', 'subject', 'book']) if (patch[k] !== undefined) allow[k] = patch[k]
  if (patch.order !== undefined) allow.order = Number(patch.order)
  allow.updatedAt = new Date()
  await db.collection(ABP_COLL.chapters).updateOne({ id: chapterId }, { $set: allow })
  return db.collection(ABP_COLL.chapters).findOne({ id: chapterId })
}

export async function setChapterStatus(db, chapterId, status) {
  await db.collection(ABP_COLL.chapters).updateOne({ id: chapterId }, { $set: { status, updatedAt: new Date() } })
  return db.collection(ABP_COLL.chapters).findOne({ id: chapterId })
}

// Publish/unpublish a whole course (class+subject+book) + its year plan.
export async function setCourseStatus(db, { class: cls, subject, book }, status) {
  const m = { class: String(cls), subject, book }
  const r = await db.collection(ABP_COLL.chapters).updateMany(m, { $set: { status, updatedAt: new Date() } })
  await db.collection(ABP_COLL.yearPlans).updateMany(m, { $set: { status, updatedAt: new Date() } })
  return { modified: r.modifiedCount }
}

// Delete a chapter: removes periods + the stored Cloudinary HTML + cached PDF.
export async function deleteChapter(db, chapterId) {
  const c = await db.collection(ABP_COLL.chapters).findOne({ id: chapterId })
  if (!c) return { ok: false, error: 'not found' }
  const periods = await db.collection(ABP_COLL.periods).countDocuments({ chapterId })
  if (c.htmlRef) { try { await deleteRaw(c.htmlRef) } catch (_) {} }
  const cache = await db.collection(ABP_COLL.pdfCache).findOne({ chapterId })
  if (cache?.pdfRef) { try { await deleteAnyFile(cache.pdfRef) } catch (_) {} }
  await db.collection(ABP_COLL.periods).deleteMany({ chapterId })
  await db.collection(ABP_COLL.progress).deleteMany({ chapterId })
  await db.collection(ABP_COLL.pdfCache).deleteMany({ chapterId })
  await db.collection(ABP_COLL.chapters).deleteOne({ id: chapterId })
  return { ok: true, removed: { chapter: 1, periods } }
}

// What a delete will remove (for the confirm dialog).
export async function deletePreview(db, chapterId) {
  const c = await db.collection(ABP_COLL.chapters).findOne({ id: chapterId })
  if (!c) return null
  const periods = await db.collection(ABP_COLL.periods).countDocuments({ chapterId })
  return { chapterId, title: c.title, number: c.number, periods, hasHtml: !!c.htmlRef }
}

// Admin: full list grouped for management.
export async function adminChapterList(db, { class: cls, subject, book } = {}) {
  const m = { trashedAt: { $exists: false } }
  if (cls) m.class = String(cls)
  if (subject) m.subject = subject
  if (book) m.book = book
  const rows = await db.collection(ABP_COLL.chapters).find(m).sort({ class: 1, subject: 1, book: 1, order: 1, number: 1 }).toArray()
  return rows.map(c => ({ ...chapterCard(c), hasHtml: !!c.htmlRef, updatedAt: c.updatedAt, createdAt: c.createdAt }))
}

// ---- #2 reorder: move a chapter up/down within its class+subject+book -------
export async function moveChapter(db, id, dir) {
  const c = await db.collection(ABP_COLL.chapters).findOne({ id })
  if (!c) return { ok: false, error: 'not found' }
  const sibs = await db.collection(ABP_COLL.chapters)
    .find({ class: c.class, subject: c.subject, book: c.book || '', trashedAt: { $exists: false } })
    .sort({ order: 1, number: 1 }).toArray()
  const idx = sibs.findIndex(x => x.id === id)
  const j = dir === 'up' ? idx - 1 : idx + 1
  if (idx < 0 || j < 0 || j >= sibs.length) return { ok: false, error: 'at edge' }
  const t = sibs[idx]; sibs[idx] = sibs[j]; sibs[j] = t
  const now = new Date()
  await db.collection(ABP_COLL.chapters).bulkWrite(sibs.map((s, i) => ({ updateOne: { filter: { id: s.id }, update: { $set: { order: i + 1, updatedAt: now } } } })))
  return { ok: true }
}

// ---- #3 Trash (soft delete, restorable) -------------------------------------
export async function courseDeletePreview(db, { class: cls, subject, book }) {
  const m = { class: String(cls), subject, book: book || '', trashedAt: { $exists: false } }
  const ids = (await db.collection(ABP_COLL.chapters).find(m).project({ id: 1 }).toArray()).map(c => c.id)
  const periods = ids.length ? await db.collection(ABP_COLL.periods).countDocuments({ chapterId: { $in: ids } }) : 0
  return { chapters: ids.length, periods }
}
export async function trashCourse(db, { class: cls, subject, book }, { adminId } = {}) {
  const m = { class: String(cls), subject, book: book || '', trashedAt: { $exists: false } }
  const ids = (await db.collection(ABP_COLL.chapters).find(m).project({ id: 1 }).toArray()).map(c => c.id)
  const now = new Date()
  if (ids.length) await db.collection(ABP_COLL.chapters).updateMany({ id: { $in: ids } }, [{ $set: { trashedAt: now, prevStatus: '$status', status: 'draft', trashedBy: adminId || null } }])
  await db.collection(ABP_COLL.yearPlans).updateMany({ class: String(cls), subject, book: book || '', trashedAt: { $exists: false } }, { $set: { trashedAt: now } })
  return { trashed: ids.length }
}
export async function listTrash(db) {
  const rows = await db.collection(ABP_COLL.chapters).find({ trashedAt: { $exists: true } }).sort({ trashedAt: -1 }).toArray()
  return rows.map(c => ({ id: c.id, class: c.class, subject: c.subject, book: c.book, number: c.number, title: c.title, periods: c.periodCount || 0, trashedAt: c.trashedAt }))
}
export async function restoreChapter(db, id) {
  const c = await db.collection(ABP_COLL.chapters).findOne({ id, trashedAt: { $exists: true } })
  if (!c) return { ok: false, error: 'not in trash' }
  await db.collection(ABP_COLL.chapters).updateOne({ id }, { $set: { status: c.prevStatus || 'draft', updatedAt: new Date() }, $unset: { trashedAt: '', prevStatus: '', trashedBy: '' } })
  return { ok: true }
}
// Soft-trash a SINGLE chapter (restorable). Used by the duplicate resolver so
// the copies you don't keep go to Trash (not permanently deleted).
export async function trashChapter(db, id, { adminId } = {}) {
  const c = await db.collection(ABP_COLL.chapters).findOne({ id, trashedAt: { $exists: false } })
  if (!c) return { ok: false, error: 'not found' }
  const now = new Date()
  await db.collection(ABP_COLL.chapters).updateOne({ id }, [{ $set: { trashedAt: now, prevStatus: '$status', status: 'draft', trashedBy: adminId || null } }])
  return { ok: true }
}

// ---- #2c Find duplicates (read-only) ----------------------------------------
export async function findDuplicates(db) {
  const rows = await db.collection(ABP_COLL.chapters).aggregate([
    { $match: { trashedAt: { $exists: false } } },
    { $group: { _id: { class: '$class', subject: '$subject', book: '$book', number: '$number', title: '$title' }, count: { $sum: 1 }, items: { $push: { id: '$id', createdAt: '$createdAt', status: '$status', periodCount: '$periodCount', sourceFile: '$sourceFile' } } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { '_id.class': 1, '_id.subject': 1, '_id.number': 1 } },
  ]).toArray()
  return rows.map(r => ({ class: r._id.class, subject: r._id.subject, book: r._id.book, number: r._id.number, title: r._id.title, copies: r.count, items: r.items.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) }))
}
