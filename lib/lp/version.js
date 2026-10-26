// ============================================================
//  Lesson-plan "Upload new version" — Phase 1: parser + dry-run
// ------------------------------------------------------------
//  Parses a teacher-filled lesson-plan HTML (new template OR the
//  older single-row layout), matches each file to a class/book/
//  chapter/period by its em-* meta tags, and produces a DRY-RUN
//  preview (New / Update / Same / Error) WITHOUT saving anything.
//  LO codes are checked with the SAME matcher as Teacher Observation
//  (lib/tob/lo-normalize.js → looseCode): spaces/dots/brackets ignored.
//  An unknown code is a warning, never a block.
//
//  Phase 2 (apply/versioning/restore/audit) builds on these helpers.
// ============================================================
import * as cheerio from 'cheerio'
import AdmZip from 'adm-zip'
import { extractEmMeta, extractTitle } from '@/lib/panchapadiUpload.js'
import { looseCode } from '@/lib/tob/lo-normalize.js'

const COLL = { classes: 'classes', books: 'books', chapters: 'chapters', lessons: 'lessons' }

// Fields the preview/apply layer tracks (matches the spec's change list).
export const VERSIONED_FIELDS = [
  'title', 'cg', 'competency', 'learningOutcomes', 'loCodesNew', 'loCodesOld',
  'tlm', 'panchapadi', 'homework', 'topicCheck', 'moreExamples', 'moreQuestions', 'projectWork',
]

const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
const normList = (a) => (Array.isArray(a) ? a : (a ? [a] : [])).map(norm).filter(Boolean)
const txt = ($, el) => { const n = $(el); return n && n.length ? norm(n.text()) : '' }
// Keep inner HTML for rich engagement blocks (lists, examples) but trimmed.
const inner = ($, el) => { const n = $(el); return n && n.length ? String(n.html() || '').trim() : null }

// ---- Extract the ZIP's .html files (ignore PDFs & junk) --------------------
export function filesFromZip(buffer) {
  const zip = new AdmZip(buffer)
  const out = []
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue
    const name = e.entryName
    if (/(^|\/)__MACOSX\//.test(name) || /(^|\/)\./.test(name.split('/').pop())) continue
    if (/\.pdf$/i.test(name)) continue           // ignore PDFs per spec
    if (!/\.html?$/i.test(name)) continue
    out.push({ filename: name.split('/').pop(), html: e.getData().toString('utf-8') })
  }
  return out
}

// ---- Parse ONE lesson-plan HTML file into structured fields ----------------
export function parseLessonHtml(html, filename = '') {
  const em = extractEmMeta(html)
  const classLabel = em.class || ''
  const classOrderMatch = String(classLabel).match(/(\d+)/)
  const meta = {
    class: classLabel,
    classOrder: classOrderMatch ? Number(classOrderMatch[1]) : null,
    book: em.book || '',
    chapter: em.chapter || '',
    chapterOrder: Number(em['chapter-order'] || 0) || null,
    period: Number(em.period || 0) || null,
  }
  const $ = cheerio.load(html)
  const out = { filename, title: norm(extractTitle(html)), meta, has: {} }

  const header = $('table.header').first()
  const rowValue = (sel) => {
    const row = header.find(sel).first()
    if (!row.length) return undefined
    // Prefer the last/value cell; fall back to the whole row's text.
    const cells = row.find('td')
    return cells.length > 1 ? norm(cells.last().text()) : norm(row.text())
  }

  // --- NEW template: CG / Competency / LO text / LO codes ---
  const cg = rowValue('tr.cg'); if (cg !== undefined) { out.cg = cg; out.has.cg = true }
  const comp = rowValue('tr.competency'); if (comp !== undefined) { out.competency = comp; out.has.competency = true }

  const loRow = header.find('tr.lo').first()
  if (loRow.length) {
    // Learning-outcome text: split <li> items, else by newline/;
    const lis = loRow.find('li')
    out.learningOutcomes = lis.length
      ? lis.map((_, e) => txt($, e)).get().filter(Boolean)
      : norm((loRow.find('td').last().text() || loRow.text())).split(/[\n;।]+/).map(norm).filter(Boolean)
    out.has.lo = true
  }
  const loCodesRow = header.find('tr.lo-codes').first()
  if (loCodesRow.length) {
    out.loCodesNew = loCodesRow.find('b').map((_, e) => txt($, e)).get().filter(Boolean)
    out.loCodesOld = loCodesRow.find('span.code.old').map((_, e) => txt($, e)).get().filter(Boolean)
    out.has.loCodes = true
  }

  // --- OLD layout fallback: LO code + Learning Outcomes in ONE row ---
  // (label contains "LO ସଂକେତ" / "ସଂକେତ" and "ଶିକ୍ଷଣ ଫଳ"). Only used to fill
  // fields the new rows did not provide — so an old file never wipes new data.
  if (!out.has.loCodes || !out.has.lo) {
    const combined = findCombinedLoRow($, header)
    if (combined) {
      if (!out.has.loCodes && combined.codes.length) { out.loCodesNew = combined.codes; out.loCodesOld = []; out.has.loCodes = true; out.loLayout = 'combined' }
      if (!out.has.lo && combined.los.length) { out.learningOutcomes = combined.los; out.has.lo = true }
    }
  }

  // --- Engagement sections (new template) ---
  const eng = $('section.lp-engage').first()
  if (eng.length) {
    const grab = (sel) => inner($, eng.find(sel).first())
    const tc = grab('.topic-check'); if (tc != null) { out.topicCheck = tc; out.has.topicCheck = true }
    const me = grab('.more-examples'); if (me != null) { out.moreExamples = me; out.has.moreExamples = true }
    const mq = grab('.more-questions'); if (mq != null) { out.moreQuestions = mq; out.has.moreQuestions = true }
    const pw = grab('.project-work'); if (pw != null) { out.projectWork = pw; out.has.projectWork = true }
  }
  return out
}

// Find an old-layout combined LO row. Returns { codes:[], los:[] } or null.
function findCombinedLoRow($, header) {
  let found = null
  header.find('tr').each((_, tr) => {
    if (found) return
    const label = norm($(tr).text())
    const isLoRow = /ସଂକେତ/.test(label) && /(ଶିକ୍ଷଣ\s*ଫଳ|Learning\s*Outcome)/i.test(label)
    if (!isLoRow) return
    const $tr = $(tr)
    const codes = $tr.find('.code, b, code').map((_, e) => norm($(e).text())).get().filter(c => /[A-Za-z].*\d/.test(c))
    const lis = $tr.find('li')
    const los = lis.length ? lis.map((_, e) => norm($(e).text())).get().filter(Boolean)
      : norm($tr.find('td').last().text()).split(/[\n;।]+/).map(norm).filter(Boolean)
    found = { codes, los: los.filter(x => !codes.includes(x)) }
  })
  return found
}

// ---- LO index + classification (same matcher as Teacher Observation) -------
// Lesson LO codes may carry a class prefix the LO Master omits:
//   file "C1-LLD-9.7.1"  ===  master "LLD 9.7.1".
// We strip a leading "C<class>-" token ONLY when it is EXACTLY the file's own
// class number, followed by a hyphen and a LETTER (e.g. a Class 1 file's
// "C1-LLD-9.7.1" → "LLD-9.7.1"). This is deliberately narrow so it NEVER touches:
//   • Hindi codes   "C.9.7.1"            (no hyphen after a class number)
//   • Competency    "C-9.7" / "C-9.7.1"  (no class number, digit follows "-")
//   • "CG-9"                             (letter 'G', not "C<class>-")
// After stripping we apply the shared TOB `looseCode` (spaces/dots/brackets
// ignored). Master codes have no prefix, so stripping is a no-op there. The
// shared TOB matcher itself is NOT modified. No LO Master data is changed —
// this is matching only.
const stripClassPrefix = (s, classOrder) => {
  const str = String(s == null ? '' : s)
  const n = Number(classOrder)
  if (!Number.isFinite(n) || n <= 0) return str
  // "C<class>" then optional spaces, a REQUIRED hyphen, optional spaces, and a
  // LETTER lookahead. The hyphen right after the class number stops "C1" from
  // matching inside "C12-…", and the letter lookahead excludes "C1-9.7".
  const re = new RegExp('^\\s*C' + n + '\\s*-\\s*(?=[A-Za-z])', 'i')
  return str.replace(re, '')
}
const lessonCodeKey = (s, classOrder) => looseCode(stripClassPrefix(s, classOrder))

export async function buildLoIndex(db, classOrder) {
  const masterRows = await db.collection('lomaster').find(
    { class: String(classOrder) }, { projection: { lo_code: 1 } }).toArray()
  const masterSet = new Set(masterRows.map(r => lessonCodeKey(r.lo_code, classOrder)).filter(Boolean))
  const oldRows = await db.collection('loCodes').find(
    { class: Number(classOrder) }, { projection: { code: 1 } }).toArray()
  const oldSet = new Set(oldRows.map(r => lessonCodeKey(r.code, classOrder)).filter(Boolean))
  return { masterSet, oldSet, classOrder: Number(classOrder) }
}

// Classify a list of codes: counts matched in lomaster vs loCodes; unknown list.
// `prefer` = 'new' checks lomaster first, 'old' checks loCodes first.
export function classifyCodes(codes, idx, prefer = 'new') {
  const res = { inMaster: 0, inLoCodes: 0, unknown: [] }
  for (const c of normList(codes)) {
    const k = lessonCodeKey(c, idx?.classOrder)
    const inM = idx.masterSet.has(k), inL = idx.oldSet.has(k)
    if (prefer === 'old') {
      if (inL) res.inLoCodes++; else if (inM) res.inMaster++; else res.unknown.push(c)
    } else {
      if (inM) res.inMaster++; else if (inL) res.inLoCodes++; else res.unknown.push(c)
    }
  }
  return res
}

// ---- Compare a parsed file to an existing lesson doc -----------------------
// Only fields the FILE actually provides are compared (and later overwritten),
// so an older file missing CG/engagement rows never wipes existing data.
const codesEqual = (a, b) => {
  const A = normList(a).map(looseCode).sort(), B = normList(b).map(looseCode).sort()
  return A.length === B.length && A.every((x, i) => x === B[i])
}
export function diffLesson(existing, p) {
  const changed = []
  const diff = {}
  const cmpText = (field, newVal, oldVal) => {
    if (norm(newVal) !== norm(oldVal)) { changed.push(field); diff[field] = { old: norm(oldVal), new: norm(newVal) } }
  }
  const cmpList = (field, newVal, oldVal) => {
    if (normList(newVal).join(' ||| ') !== normList(oldVal).join(' ||| ')) { changed.push(field); diff[field] = { old: normList(oldVal), new: normList(newVal) } }
  }
  const cmpCodes = (field, newVal, oldVal) => {
    if (!codesEqual(newVal, oldVal)) { changed.push(field); diff[field] = { old: normList(oldVal), new: normList(newVal) } }
  }
  if (p.title) cmpText('title', p.title, existing.title)
  if (p.has.cg) cmpText('cg', p.cg, existing.cg)
  if (p.has.competency) cmpText('competency', p.competency, existing.competency)
  if (p.has.lo) cmpList('learningOutcomes', p.learningOutcomes, existing.learningOutcomes)
  if (p.has.loCodes) {
    cmpCodes('loCodesNew', p.loCodesNew, existing.loCodes)          // stored new codes live on .loCodes
    cmpCodes('loCodesOld', p.loCodesOld, existing.loCodesOld)
  }
  if (p.has.topicCheck) cmpText('topicCheck', p.topicCheck, existing.topicCheck)
  if (p.has.moreExamples) cmpText('moreExamples', p.moreExamples, existing.moreExamples)
  if (p.has.moreQuestions) cmpText('moreQuestions', p.moreQuestions, existing.moreQuestions)
  if (p.has.projectWork) cmpText('projectWork', p.projectWork, existing.projectWork)
  return { changed, diff }
}

const bookMatches = (fileBook, dbBook) => {
  const a = norm(fileBook).toLowerCase(), b = norm(dbBook).toLowerCase()
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

// ---- Shared classifier: match + status for every file (used by dry-run AND apply) ----
// scope: { classId, classOrder, bookId, bookName, chapterId? }
async function classifyFiles(db, { files, scope, removeMissing = false }) {
  const chapters = await db.collection(COLL.chapters).find({ bookId: scope.bookId }).toArray()
  const idx = await buildLoIndex(db, scope.classOrder)
  const seen = new Set()
  const rows = []
  const counts = { New: 0, Update: 0, Same: 0, Error: 0 }
  const lo = { newMatchedMaster: 0, newMatchedLoCodes: 0, oldMatchedLoCodes: 0, oldMatchedMaster: 0, unknown: [] }

  const resolveChapter = (meta) => {
    if (meta.chapterOrder != null) { const c = chapters.find(c => Number(c.order) === meta.chapterOrder); if (c) return c }
    if (meta.chapter) { const c = chapters.find(c => bookMatches(meta.chapter, c.name)); if (c) return c }
    if (chapters.length === 1) return chapters[0]
    return null
  }

  for (const f of files) {
    const p = parseLessonHtml(f.html, f.filename)
    const r = { filename: f.filename, period: p.meta.period, title: p.title, status: '', errors: [], warnings: [], changes: [], diff: {}, parsed: p, existing: null, chapterId: null }

    const missingMeta = [!p.meta.class && 'em-class', !p.meta.book && 'em-book', !p.meta.period && 'em-period'].filter(Boolean)
    if (missingMeta.length) { r.status = 'Error'; r.errors.push(`Missing meta tag(s): ${missingMeta.join(', ')}`); counts.Error++; rows.push(r); continue }
    if (p.meta.classOrder != null && scope.classOrder != null && p.meta.classOrder !== scope.classOrder) {
      r.status = 'Error'; r.errors.push(`Wrong class — file says "${p.meta.class}", this book is Class ${scope.classOrder}. Skipped.`); counts.Error++; rows.push(r); continue
    }
    if (!bookMatches(p.meta.book, scope.bookName)) {
      r.status = 'Error'; r.errors.push(`Wrong book — file says "${p.meta.book}", this book is "${scope.bookName}". Skipped.`); counts.Error++; rows.push(r); continue
    }
    const chapter = resolveChapter(p.meta)
    if (!chapter) { r.status = 'Error'; r.errors.push(`Chapter not found for this book (em-chapter "${p.meta.chapter}", order ${p.meta.chapterOrder}). Skipped.`); counts.Error++; rows.push(r); continue }
    if (scope.chapterId && chapter.id !== scope.chapterId) { r.status = 'Error'; r.errors.push(`File is for a different chapter ("${chapter.name}"). Skipped.`); counts.Error++; rows.push(r); continue }
    r.chapterId = chapter.id; r.chapterName = chapter.name
    seen.add(chapter.id + '|' + p.meta.period)

    const cNew = classifyCodes(p.loCodesNew, idx, 'new')
    const cOld = classifyCodes(p.loCodesOld, idx, 'old')
    lo.newMatchedMaster += cNew.inMaster; lo.newMatchedLoCodes += cNew.inLoCodes
    lo.oldMatchedLoCodes += cOld.inLoCodes; lo.oldMatchedMaster += cOld.inMaster
    const unknown = [...cNew.unknown, ...cOld.unknown]
    r.lo = { newMatchedMaster: cNew.inMaster, newMatchedLoCodes: cNew.inLoCodes, oldMatchedLoCodes: cOld.inLoCodes, oldMatchedMaster: cOld.inMaster, unknown }
    if (unknown.length) { r.warnings.push(`Unknown LO code(s) (not in LO Master or loCodes): ${unknown.join(', ')}`); lo.unknown.push(...unknown) }

    const existing = await db.collection(COLL.lessons).findOne({ bookId: scope.bookId, chapterId: chapter.id, period: p.meta.period })
    r.existing = existing || null
    if (!existing) {
      r.status = 'New'
      r.changes = VERSIONED_FIELDS.filter(fld => p.has[fld] || (fld === 'title' && p.title) || ((fld === 'loCodesNew' || fld === 'loCodesOld') && p.has.loCodes) || (fld === 'learningOutcomes' && p.has.lo))
      counts.New++
    } else {
      const d = diffLesson(existing, p)
      r.changes = d.changed; r.diff = d.diff
      r.status = d.changed.length ? 'Update' : 'Same'
      counts[r.status]++
    }
    rows.push(r)
  }

  const missing = []
  const lessonFilter = scope.chapterId ? { bookId: scope.bookId, chapterId: scope.chapterId } : { bookId: scope.bookId }
  const dbLessons = await db.collection(COLL.lessons).find(lessonFilter, { projection: { id: 1, chapterId: 1, period: 1, title: 1 } }).toArray()
  for (const l of dbLessons) {
    if (!seen.has(l.chapterId + '|' + l.period)) missing.push({ lessonId: l.id, chapterId: l.chapterId, period: l.period, title: l.title, action: removeMissing ? 'REMOVE' : 'KEEP' })
  }
  return { rows, counts, loSummary: lo, missing }
}

// Public row shape (drops internal parsed/existing docs).
const publicRow = (r) => ({ filename: r.filename, period: r.period, title: r.title, status: r.status, chapterName: r.chapterName, errors: r.errors, warnings: r.warnings, changes: r.changes, diff: r.diff, lo: r.lo })

// ---- DRY RUN (nothing is saved) --------------------------------------------
export async function dryRunVersionUpload(db, { files, scope, removeMissing = false }) {
  const { rows, counts, loSummary, missing } = await classifyFiles(db, { files, scope, removeMissing })
  return { saved: false, counts, rows: rows.map(publicRow), loSummary, missing, removeMissing }
}

// ============================================================
//  Phase 2 — Apply · Versioning · Restore · Audit · Cache
// ============================================================
import { v4 as uuidv4 } from 'uuid'

const VCOLL = { versions: 'lessonVersions', batches: 'lessonUploadBatches', audit: 'lessonVersionAudit' }
const META_FIELDS = new Set(['_id', 'id', 'classId', 'bookId', 'chapterId', 'period', 'createdAt', 'updatedAt', 'contentVersion', 'lastUploadAt', 'restoredFrom', 'source'])

// Build the $set of ONLY the fields the uploaded file actually provides.
function buildUpdateDoc(existing, p) {
  const set = { updatedAt: new Date(), contentVersion: (existing?.contentVersion || 0) + 1, lastUploadAt: new Date() }
  if (p.title) set.title = p.title
  if (p.has.cg) set.cg = p.cg
  if (p.has.competency) set.competency = p.competency
  if (p.has.lo) set.learningOutcomes = p.learningOutcomes
  if (p.has.loCodes) { set.loCodes = p.loCodesNew || []; set.loCodesOld = p.loCodesOld || [] }
  if (p.has.topicCheck) set.topicCheck = p.topicCheck
  if (p.has.moreExamples) set.moreExamples = p.moreExamples
  if (p.has.moreQuestions) set.moreQuestions = p.moreQuestions
  if (p.has.projectWork) set.projectWork = p.projectWork
  return set
}
function newLessonDoc(scope, r) {
  const p = r.parsed, now = new Date()
  const base = { id: uuidv4(), classId: scope.classId, bookId: scope.bookId, chapterId: r.chapterId, period: p.meta.period, title: p.title || `Period ${p.meta.period}`, createdAt: now, source: 'upload' }
  return Object.assign(base, buildUpdateDoc({}, p))
}
// Snapshot a lesson into lessonVersions BEFORE it is overwritten/removed.
// Keeps the last 10 per lesson; never deletes the only backup.
async function snapshotLesson(db, lesson, { reason, batchId = null, by, now = new Date() }) {
  if (!lesson) return null
  const snap = { ...lesson }; delete snap._id
  const vid = uuidv4()
  await db.collection(VCOLL.versions).insertOne({ id: vid, lessonId: lesson.id, bookId: lesson.bookId, chapterId: lesson.chapterId, period: lesson.period, reason, batchId, at: now, by, snapshot: snap })
  const all = await db.collection(VCOLL.versions).find({ lessonId: lesson.id }).sort({ at: -1 }).project({ id: 1 }).toArray()
  if (all.length > 10) {
    const toDel = all.slice(10).map(x => x.id)
    if (toDel.length && all.length - toDel.length >= 1) await db.collection(VCOLL.versions).deleteMany({ id: { $in: toDel } })
  }
  return vid
}
// Public wrapper: snapshot a lesson's CURRENT content into lessonVersions
// before a destructive action (e.g. a forced Regenerate that clears an
// admin-uploaded field). Keeps the last 10 per lesson (via snapshotLesson).
// Returns the new version id (or null if nothing to snapshot). Never throws.
export async function snapshotLessonVersion(db, lesson, { reason = 'pre-regenerate', by, batchId = null } = {}) {
  try {
    if (!db || !lesson || !lesson.id) return null
    return await snapshotLesson(db, lesson, { reason, batchId, by, now: new Date() })
  } catch (_) { return null }
}

async function audit(db, entry) { try { await db.collection(VCOLL.audit).insertOne({ id: uuidv4(), at: new Date(), ...entry }) } catch (_) {} }
// Period pages render from the live `lessons` doc, so overwriting IS the cache
// clear. We also bump a per-lesson token (contentVersion/updatedAt) and drop any
// cached rendered payloads keyed to this lesson so teachers see the new version.
async function clearPeriodCache(db, lessonId) {
  try { await db.collection('lessonRenderCache').deleteMany({ lessonId }) } catch (_) {}
}

// Apply ONLY New + Update rows. Same/Error untouched. removeMissing deletes
// periods not in the upload ONLY when removeMissing && confirmRemove are both true.
export async function applyVersionUpload(db, { files, scope, removeMissing = false, confirmRemove = false, me }) {
  const { rows, counts, loSummary, missing } = await classifyFiles(db, { files, scope, removeMissing })
  const batchId = uuidv4(), now = new Date()
  const by = { id: me?.id || null, name: me?.name || me?.email || 'admin' }
  const added = [], updated = [], removed = []

  for (const r of rows) {
    if (r.status === 'New') {
      const doc = newLessonDoc(scope, r)
      await db.collection(COLL.lessons).insertOne(doc)
      await snapshotLesson(db, doc, { reason: 'created', batchId, by, now })
      await clearPeriodCache(db, doc.id)
      added.push(r.period)
    } else if (r.status === 'Update') {
      await snapshotLesson(db, r.existing, { reason: 'pre-update', batchId, by, now })   // backup BEFORE overwrite
      await db.collection(COLL.lessons).updateOne({ id: r.existing.id }, { $set: buildUpdateDoc(r.existing, r.parsed) })
      await clearPeriodCache(db, r.existing.id)
      updated.push(r.period)
    }
  }
  if (removeMissing && confirmRemove) {
    for (const m of missing) {
      const l = await db.collection(COLL.lessons).findOne({ id: m.lessonId })
      if (l) { await snapshotLesson(db, l, { reason: 'pre-remove', batchId, by, now }); await db.collection(COLL.lessons).deleteOne({ id: l.id }); removed.push(l.period) }
    }
  }
  const batch = { id: batchId, bookId: scope.bookId, chapterId: scope.chapterId || null, at: now, by, counts, periodsAdded: added, periodsUpdated: updated, periodsRemoved: removed, removeMissing: !!(removeMissing && confirmRemove) }
  await db.collection(VCOLL.batches).insertOne(batch)
  await audit(db, { action: 'LP_UPLOAD_APPLY', batchId, bookId: scope.bookId, chapterId: scope.chapterId || null, by, counts, added, updated, removed })
  return { saved: true, batchId, counts, added, updated, removed, rows: rows.map(publicRow), missing }
}

// Restore a specific period version. Snapshots the current content first (so the
// restore is itself undoable), then writes the old snapshot back exactly.
export async function restoreLessonVersion(db, { versionId, me }) {
  const v = await db.collection(VCOLL.versions).findOne({ id: versionId })
  if (!v) throw new Error('Version not found')
  const current = await db.collection(COLL.lessons).findOne({ id: v.lessonId })
  const now = new Date()
  const by = { id: me?.id || null, name: me?.name || me?.email || 'admin' }
  if (current) await snapshotLesson(db, current, { reason: 'pre-restore', by, now })
  const snap = { ...v.snapshot }; delete snap._id
  snap.updatedAt = now; snap.restoredFrom = versionId; snap.contentVersion = (current?.contentVersion || 0) + 1
  await db.collection(COLL.lessons).replaceOne({ id: v.lessonId }, snap, { upsert: true })
  await clearPeriodCache(db, v.lessonId)
  await audit(db, { action: 'LP_RESTORE', lessonId: v.lessonId, period: v.period, versionId, bookId: v.bookId, by })
  return { restored: true, lessonId: v.lessonId, period: v.period }
}

export async function listBookVersions(db, bookId) {
  return db.collection(VCOLL.batches).find({ bookId }).sort({ at: -1 }).limit(50).toArray()
}
export async function listPeriodVersions(db, lessonId) {
  return db.collection(VCOLL.versions).find({ lessonId }).sort({ at: -1 }).limit(10).project({ snapshot: 0 }).toArray()
}
export async function listAudit(db, bookId) {
  return db.collection(VCOLL.audit).find({ bookId }).sort({ at: -1 }).limit(100).toArray()
}

// Preview what "Restore this upload" (a whole batch) will do.
export async function previewRestoreBatch(db, batchId) {
  const batch = await db.collection(VCOLL.batches).findOne({ id: batchId })
  if (!batch) throw new Error('Upload not found')
  return { batchId, at: batch.at, by: batch.by, willRevert: batch.periodsUpdated || [], willRemove: batch.periodsAdded || [] }
}

// Restore an ENTIRE upload: revert every updated period to its pre-update
// snapshot and remove every period that this upload added. Snapshots current
// state first so the batch-restore is itself undoable.
export async function restoreBatch(db, { batchId, me }) {
  const batch = await db.collection(VCOLL.batches).findOne({ id: batchId })
  if (!batch) throw new Error('Upload not found')
  const now = new Date()
  const by = { id: me?.id || null, name: me?.name || me?.email || 'admin' }
  const reverted = [], removed = []
  const preSnaps = await db.collection(VCOLL.versions).find({ batchId, reason: 'pre-update' }).toArray()
  for (const s of preSnaps) {
    const cur = await db.collection(COLL.lessons).findOne({ id: s.lessonId })
    if (cur) await snapshotLesson(db, cur, { reason: 'pre-restore', by, now })
    const snap = { ...s.snapshot }; delete snap._id; snap.updatedAt = now; snap.restoredFrom = s.id; snap.contentVersion = (cur?.contentVersion || 0) + 1
    await db.collection(COLL.lessons).replaceOne({ id: s.lessonId }, snap, { upsert: true })
    await clearPeriodCache(db, s.lessonId)
    reverted.push(s.period)
  }
  const createdSnaps = await db.collection(VCOLL.versions).find({ batchId, reason: 'created' }).toArray()
  for (const s of createdSnaps) {
    const cur = await db.collection(COLL.lessons).findOne({ id: s.lessonId })
    if (cur) { await snapshotLesson(db, cur, { reason: 'pre-remove', by, now }); await db.collection(COLL.lessons).deleteOne({ id: cur.id }); await clearPeriodCache(db, cur.id); removed.push(s.period) }
  }
  await audit(db, { action: 'LP_RESTORE_BATCH', batchId, bookId: batch.bookId, by, reverted, removed })
  return { restored: true, batchId, reverted, removed }
}

