// ═════════════════════════════════════════════════════════════════════
// Academic Pacing — Phase 1
//
// Admin-only academic planning layer.  Phase 1 delivers:
//   • Academic Year records (label, teachingDays, notes, isActive)
//   • Subject Period Allocations per (AcademicYear × Class × Subject)
//   • Helper to enumerate "subjects" for a class by scanning existing
//     `books.subject` string values (subject is not a first-class
//     collection — we reuse the label already stored on books).
//
// Phase 2 will layer chapter × period pacing on top of this WITHOUT
// changing the AY / allocation shape defined here.
//
// Collections (new, isolated from every other domain):
//   • academicYears
//   • subjectPeriodAllocations
//
// Indexes:
//   • academicYears.label unique
//   • subjectPeriodAllocations.{academicYearId, classId, subject} unique
//
// Seed:
//   • On first access, seeds Academic Year "2026-27" with
//     teachingDays=190 and isActive=true (admin can edit or delete
//     later; teachingDays is NEVER hardcoded in downstream logic).
// ═════════════════════════════════════════════════════════════════════

import { randomUUID } from 'node:crypto'

const AY_MIGRATION_KEY = 'academic_pacing_v1_seeded'
const CP_MIGRATION_KEY = 'academic_pacing_v2_chapter_plans'

/**
 * Normalise a chapter name into a stable key we can use to dedupe
 * DB uploads vs Drive PDFs (same chapter uploaded twice with slightly
 * different spelling still resolves to the same key).  Strips
 * whitespace variance, common suffixes like ".pdf", and lowercases
 * ascii — Odia glyphs pass through unchanged.
 */
export function chapterKeyFor(name) {
  return String(name || '')
    .replace(/\.pdf$/i, '')
    .replace(/[\u2010-\u2015]/g, '-')     // various dash glyphs → hyphen
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Idempotent: ensures indexes + optional seed.  Safe to call from any
 * endpoint handler — a `migrations` marker record short-circuits the
 * seed after the first call.
 */
export async function ensureAcademicPacingSeeded(d) {
  const ay = d.collection('academicYears')
  const alloc = d.collection('subjectPeriodAllocations')
  // Idempotent indexes.
  await Promise.allSettled([
    ay.createIndex({ label: 1 }, { unique: true, name: 'label_unique', background: true }),
    ay.createIndex({ isActive: 1 }, { name: 'isActive_1', background: true }),
    alloc.createIndex(
      { academicYearId: 1, classId: 1, subject: 1 },
      { unique: true, name: 'ay_class_subject_unique', background: true },
    ),
    alloc.createIndex({ academicYearId: 1 }, { name: 'academicYearId_1', background: true }),
    d.collection('chapterPacingPlans').createIndex(
      { academicYearId: 1, classId: 1, subject: 1, chapterKey: 1 },
      { unique: true, name: 'ay_class_subject_chapter_unique', background: true },
    ),
    d.collection('chapterPacingPlans').createIndex(
      { academicYearId: 1, classId: 1, subject: 1 },
      { name: 'ay_class_subject_1', background: true },
    ),
  ])
  // One-time seed guard via the shared migrations collection so we
  // don't need to keep a boolean per JS process.
  const migrations = d.collection('migrations')
  const marker = await migrations.findOne({ key: AY_MIGRATION_KEY })
  if (marker) return { seeded: false }
  const existing = await ay.countDocuments({})
  if (existing === 0) {
    const now = new Date()
    await ay.insertOne({
      id: randomUUID(),
      label: '2026-27',
      teachingDays: 190,
      notes: 'Seeded default academic year — edit or add new years as needed.',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
  }
  await migrations.updateOne(
    { key: AY_MIGRATION_KEY },
    { $set: { key: AY_MIGRATION_KEY, at: new Date() } },
    { upsert: true },
  )
  return { seeded: true }
}

/**
 * List all academic years (newest first).  Attaches lightweight
 * `allocationCount` + `plannedPeriodsTotal` for each row so the
 * admin sees pacing progress at a glance.
 */
export async function listAcademicYears(d) {
  const rows = await d.collection('academicYears')
    .find({}, { projection: { _id: 0 } })
    .sort({ isActive: -1, label: -1 })
    .toArray()
  if (!rows.length) return []
  const ids = rows.map(r => r.id)
  const aggr = await d.collection('subjectPeriodAllocations')
    .aggregate([
      { $match: { academicYearId: { $in: ids } } },
      { $group: {
        _id: '$academicYearId',
        allocationCount: { $sum: 1 },
        plannedPeriodsTotal: { $sum: { $ifNull: ['$annualPeriods', 0] } },
      } },
    ])
    .toArray()
  const byId = Object.fromEntries(aggr.map(x => [x._id, x]))
  for (const r of rows) {
    r.allocationCount = byId[r.id]?.allocationCount || 0
    r.plannedPeriodsTotal = byId[r.id]?.plannedPeriodsTotal || 0
  }
  return rows
}

/** Create a new academic year.  Enforces unique label. */
export async function createAcademicYear(d, { label, teachingDays, notes, isActive } = {}) {
  const cleanLabel = String(label || '').trim()
  const days = Math.max(0, Number(teachingDays) || 0)
  if (!cleanLabel) return { error: 'label required' }
  if (!/^\d{4}[-–]\d{2,4}$/.test(cleanLabel)) return { error: 'label must match "YYYY-YY" (e.g. 2026-27)' }
  const existing = await d.collection('academicYears').findOne({ label: cleanLabel })
  if (existing) return { error: `Academic year "${cleanLabel}" already exists` }
  const now = new Date()
  const doc = {
    id: randomUUID(),
    label: cleanLabel,
    teachingDays: days,
    notes: String(notes || '').trim(),
    isActive: !!isActive,
    createdAt: now,
    updatedAt: now,
  }
  await d.collection('academicYears').insertOne(doc)
  // If admin marked active, unset active on every other AY so only one
  // is active at a time.
  if (doc.isActive) {
    await d.collection('academicYears').updateMany(
      { id: { $ne: doc.id } },
      { $set: { isActive: false, updatedAt: now } },
    )
  }
  return { ok: true, year: { ...doc, _id: undefined, allocationCount: 0, plannedPeriodsTotal: 0 } }
}

/** Update an academic year — label / teachingDays / notes / isActive. */
export async function updateAcademicYear(d, id, patch = {}) {
  const cur = await d.collection('academicYears').findOne({ id })
  if (!cur) return { error: 'Academic year not found' }
  const set = { updatedAt: new Date() }
  if (patch.label !== undefined) {
    const l = String(patch.label || '').trim()
    if (!l) return { error: 'label cannot be empty' }
    if (!/^\d{4}[-–]\d{2,4}$/.test(l)) return { error: 'label must match "YYYY-YY"' }
    if (l !== cur.label) {
      const dup = await d.collection('academicYears').findOne({ label: l, id: { $ne: id } })
      if (dup) return { error: `Academic year "${l}" already exists` }
      set.label = l
      // Cascade label into allocations for readability.
      await d.collection('subjectPeriodAllocations').updateMany(
        { academicYearId: id },
        { $set: { academicYearLabel: l, updatedAt: new Date() } },
      )
    }
  }
  if (patch.teachingDays !== undefined) {
    const days = Math.max(0, Number(patch.teachingDays) || 0)
    set.teachingDays = days
  }
  if (patch.notes !== undefined) set.notes = String(patch.notes || '').trim()
  if (patch.isActive !== undefined) set.isActive = !!patch.isActive
  await d.collection('academicYears').updateOne({ id }, { $set: set })
  if (set.isActive) {
    await d.collection('academicYears').updateMany(
      { id: { $ne: id } },
      { $set: { isActive: false, updatedAt: new Date() } },
    )
  }
  const fresh = await d.collection('academicYears').findOne({ id }, { projection: { _id: 0 } })
  return { ok: true, year: fresh }
}

/** Delete an academic year — refuses if allocations still reference it. */
export async function deleteAcademicYear(d, id) {
  const cur = await d.collection('academicYears').findOne({ id })
  if (!cur) return { error: 'Academic year not found' }
  const usage = await d.collection('subjectPeriodAllocations').countDocuments({ academicYearId: id })
  if (usage > 0) return { error: `Cannot delete — ${usage} allocation${usage === 1 ? '' : 's'} still reference this year.` }
  await d.collection('academicYears').deleteOne({ id })
  return { ok: true }
}

/**
 * Enumerate the subjects that exist for a given class by scanning
 * distinct `books.subject` values.  Books without a subject field fall
 * back to the book name so the admin can still allocate periods
 * against them.
 *
 * Returns [{ subject, bookIds:[], bookNames:[] }] sorted alphabetically.
 */
export async function listSubjectsForClass(d, classId) {
  if (!classId) return []
  const books = await d.collection('books')
    .find({ classId, $or: [{ hidden: { $ne: true } }, { hidden: { $exists: false } }] }, { projection: { _id: 0, id: 1, name: 1, subject: 1 } })
    .sort({ order: 1 })
    .toArray()
  const map = new Map()
  for (const b of books) {
    const key = String(b.subject || b.name || 'General').trim() || 'General'
    if (!map.has(key)) map.set(key, { subject: key, bookIds: [], bookNames: [] })
    const e = map.get(key)
    e.bookIds.push(b.id)
    e.bookNames.push(b.name)
  }
  return [...map.values()].sort((a, b) => a.subject.localeCompare(b.subject))
}

/**
 * List every Class × Subject pair across the app so admins can allocate
 * annual periods even for subjects that don't yet have a book stub.
 * We return both dense rows (books present) and any manually-created
 * allocation rows so nothing disappears from the UI after creation.
 */
export async function listAllClassSubjectPairs(d, academicYearId) {
  const classes = await d.collection('classes').find({}, { projection: { _id: 0 } }).sort({ order: 1 }).toArray()
  const rows = []
  for (const cls of classes) {
    const subjects = await listSubjectsForClass(d, cls.id)
    for (const s of subjects) {
      rows.push({
        classId: cls.id,
        className: cls.name,
        classNameOdia: cls.nameOdia || '',
        classOrder: cls.order || 0,
        subject: s.subject,
        bookIds: s.bookIds,
        bookNames: s.bookNames,
        annualPeriods: 0,
        allocationId: '',
        notes: '',
      })
    }
  }
  // Attach existing allocations for the requested AY.
  if (academicYearId) {
    const existing = await d.collection('subjectPeriodAllocations')
      .find({ academicYearId }, { projection: { _id: 0 } })
      .toArray()
    const byKey = new Map(existing.map(e => [`${e.classId}::${e.subject}`, e]))
    for (const r of rows) {
      const hit = byKey.get(`${r.classId}::${r.subject}`)
      if (hit) {
        r.annualPeriods = hit.annualPeriods || 0
        r.allocationId = hit.id
        r.notes = hit.notes || ''
      }
    }
    // Include manually-created allocations that don't appear in `books` (edge case).
    for (const e of existing) {
      const key = `${e.classId}::${e.subject}`
      if (rows.some(r => `${r.classId}::${r.subject}` === key)) continue
      rows.push({
        classId: e.classId,
        className: e.className || '',
        classNameOdia: '',
        classOrder: 999,
        subject: e.subject,
        bookIds: [],
        bookNames: [],
        annualPeriods: e.annualPeriods || 0,
        allocationId: e.id,
        notes: e.notes || '',
      })
    }
  }
  return rows.sort((a, b) =>
    (a.classOrder - b.classOrder) || String(a.className).localeCompare(String(b.className))
    || String(a.subject).localeCompare(String(b.subject))
  )
}

/** Upsert a single Class × Subject allocation for a given AY. */
export async function upsertAllocation(d, { academicYearId, classId, className, subject, annualPeriods, notes }) {
  if (!academicYearId) return { error: 'academicYearId required' }
  if (!classId) return { error: 'classId required' }
  const subj = String(subject || '').trim()
  if (!subj) return { error: 'subject required' }
  const ay = await d.collection('academicYears').findOne({ id: academicYearId })
  if (!ay) return { error: 'Academic year not found' }
  const cls = await d.collection('classes').findOne({ id: classId })
  if (!cls) return { error: 'Class not found' }
  const now = new Date()
  const key = { academicYearId, classId, subject: subj }
  const existing = await d.collection('subjectPeriodAllocations').findOne(key)
  const doc = {
    id: existing?.id || randomUUID(),
    academicYearId,
    academicYearLabel: ay.label,
    classId,
    className: className || cls.name,
    subject: subj,
    annualPeriods: Math.max(0, Number(annualPeriods) || 0),
    notes: String(notes || '').trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
  await d.collection('subjectPeriodAllocations').updateOne(
    key, { $set: doc }, { upsert: true },
  )
  return { ok: true, allocation: doc }
}

/** Delete a specific allocation (or (yearId, classId, subject) tuple). */
export async function deleteAllocation(d, { id, academicYearId, classId, subject }) {
  const filter = id ? { id } : { academicYearId, classId, subject }
  const r = await d.collection('subjectPeriodAllocations').deleteOne(filter)
  return { ok: true, deleted: r.deletedCount }
}

/**
 * Summarise an academic year's pacing state for the header/progress
 * widget.  Not the same as the row list — this rolls up totals per
 * class and overall.
 */
export async function summariseAcademicYear(d, academicYearId) {
  const ay = await d.collection('academicYears').findOne({ id: academicYearId }, { projection: { _id: 0 } })
  if (!ay) return { error: 'Academic year not found' }
  const alloc = await d.collection('subjectPeriodAllocations')
    .find({ academicYearId }, { projection: { _id: 0 } })
    .toArray()
  const byClass = new Map()
  let totalPlanned = 0
  let totalSubjects = 0
  for (const a of alloc) {
    totalPlanned += Number(a.annualPeriods) || 0
    totalSubjects += 1
    if (!byClass.has(a.classId)) byClass.set(a.classId, { classId: a.classId, className: a.className, subjects: 0, planned: 0 })
    const b = byClass.get(a.classId)
    b.subjects += 1
    b.planned += Number(a.annualPeriods) || 0
  }
  return {
    ok: true,
    year: ay,
    totals: { totalPlanned, totalSubjects, classesTouched: byClass.size },
    perClass: [...byClass.values()].sort((a, b) => String(a.className).localeCompare(String(b.className))),
  }
}

// ═════════════════════════════════════════════════════════════════════
// PHASE 2 — Chapter Pacing
//
// For each (AcademicYear × Class × Subject) allocation, we let the admin
// break the annual budget down chapter-by-chapter, and (optionally)
// enter Topic + Sub-topic for every generated Period row.
//
// Data:
//   • Collection: `chapterPacingPlans`
//   • Shape:
//     {
//       id, academicYearId, academicYearLabel, classId, className,
//       subject, bookName, chapterKey, chapterName, chapterOrder,
//       chapterSource: 'db' | 'drive' | 'db+drive',
//       totalPeriods, periods: [{ periodNumber, topic, subTopic,
//         status: 'planned'|'generated'|'archived', loCodes:[],
//         lessonId:'', driveFileId:'', driveFileUrl:'', updatedAt }],
//       createdAt, updatedAt
//     }
// ═════════════════════════════════════════════════════════════════════

/**
 * Enumerate chapters for a given (year, class, subject) triple by
 * union-merging:
 *   1. Distinct chapters uploaded into `panchapadiUploads` (DB — fast,
 *      offline).  We infer book membership from the allocation's
 *      `bookNames[]`.
 *   2. Chapters saved by admin into `chapterPacingPlans` (persisted
 *      pacing, may include chapters not yet uploaded/generated).
 *
 * The Google Drive Bridge catalog is *not* fetched here — that stays
 * an on-demand action in the AI Generator to keep this endpoint fast.
 * Drive chapters can be recorded into `chapterPacingPlans` when admin
 * clicks "Add Drive Chapter" (future) or via CSV import (Phase 2d).
 *
 * Returns rows sorted by chapterOrder then name.  Each row carries
 * enough state for the UI to render live per-chapter pacing status.
 */
export async function listChaptersForAllocation(d, { academicYearId, classId, subject }) {
  if (!academicYearId || !classId || !subject) return { rows: [], allocation: null, remaining: 0 }
  const allocation = await d.collection('subjectPeriodAllocations')
    .findOne({ academicYearId, classId, subject }, { projection: { _id: 0 } })

  const cls = await d.collection('classes').findOne({ id: classId })
  const className = cls?.name || allocation?.className || ''

  // Books that belong to this Class × Subject — reuse the same logic
  // subjectPeriodAllocations was originally derived from.
  const classBooks = await d.collection('books')
    .find({ classId }, { projection: { _id: 0, id: 1, name: 1, subject: 1 } })
    .toArray()
  const matchingBooks = classBooks.filter(b =>
    String(b.subject || b.name || '').trim() === subject ||
    String(b.name || '').trim() === subject
  )
  const bookNames = [...new Set(matchingBooks.map(b => b.name).filter(Boolean))]

  // 1. DB chapters — group by bookLabel + chapterLabel from panchapadiUploads.
  const dbChapters = bookNames.length
    ? await d.collection('panchapadiUploads').aggregate([
        { $match: { classLabel: className, bookLabel: { $in: bookNames } } },
        { $group: {
          _id: { book: '$bookLabel', chapter: '$chapterLabel', order: '$chapterOrder' },
          uploadedPeriods: { $sum: 1 },
        } },
      ]).toArray()
    : []

  const rowMap = new Map()
  for (const c of dbChapters) {
    const name = String(c._id.chapter || '').trim()
    if (!name) continue
    const key = chapterKeyFor(name)
    rowMap.set(key, {
      chapterKey: key,
      chapterName: name,
      bookName: c._id.book || '',
      chapterOrder: Number(c._id.order) || 0,
      chapterSource: 'db',
      totalPeriods: 0,
      periods: [],
      uploadedPeriods: c.uploadedPeriods || 0,
      planId: '',
      _hasPlan: false,
    })
  }

  // 2. Overlay persisted plans — takes precedence for totalPeriods/periods,
  //    and can introduce chapters that don't exist in DB yet.
  const plans = await d.collection('chapterPacingPlans')
    .find({ academicYearId, classId, subject }, { projection: { _id: 0 } })
    .toArray()
  for (const p of plans) {
    const key = p.chapterKey || chapterKeyFor(p.chapterName)
    const existing = rowMap.get(key) || {
      chapterKey: key,
      chapterName: p.chapterName,
      bookName: p.bookName || (bookNames[0] || ''),
      chapterOrder: p.chapterOrder || 999,
      chapterSource: 'plan',
      totalPeriods: 0,
      periods: [],
      uploadedPeriods: 0,
    }
    existing.totalPeriods = p.totalPeriods || 0
    existing.periods = Array.isArray(p.periods) ? p.periods : []
    existing.planId = p.id
    existing._hasPlan = true
    existing.chapterSource = existing.chapterSource === 'db' ? 'db+plan' : (existing.chapterSource === 'plan' ? 'plan' : existing.chapterSource)
    rowMap.set(key, existing)
  }

  const rows = [...rowMap.values()]
    .sort((a, b) => (a.chapterOrder - b.chapterOrder) || String(a.chapterName).localeCompare(String(b.chapterName)))
    // Derive summary counts so the frontend can render badges without
    // extra roundtrips.
    .map(r => {
      const filledTopics = (r.periods || []).filter(p => (p.topic || '').trim()).length
      const filledSubTopics = (r.periods || []).filter(p => (p.subTopic || '').trim()).length
      const generated = (r.periods || []).filter(p => p.status === 'generated' || p.lessonId).length
      const archived = (r.periods || []).filter(p => p.status === 'archived' || p.driveFileUrl).length
      return { ...r, filledTopics, filledSubTopics, generatedCount: generated, archivedCount: archived }
    })

  const totalAllocated = rows.reduce((s, r) => s + (r.totalPeriods || 0), 0)
  const annual = allocation?.annualPeriods || 0
  return {
    rows,
    allocation,
    className,
    bookNames,
    totalAllocated,
    remaining: annual - totalAllocated,
    annualPeriods: annual,
  }
}

/**
 * Upsert (or replace) a chapter pacing plan.  Whenever `totalPeriods`
 * changes, we auto-reconcile the `periods[]` array:
 *   • grow it by appending blank period rows for the new numbers
 *   • shrink it by trimming trailing rows (loses their topics — the
 *     UI should confirm before shrinking).
 *
 * Admin-approved topics/subtopics on surviving rows are preserved.
 */
export async function upsertChapterPlan(d, body) {
  const { randomUUID } = await import('node:crypto')
  const {
    academicYearId, classId, className, subject,
    chapterName, chapterOrder, bookName, totalPeriods,
    // optional pre-baked periods array (used by CSV import)
    periods: incomingPeriods,
  } = body || {}
  if (!academicYearId) return { error: 'academicYearId required' }
  if (!classId) return { error: 'classId required' }
  if (!subject) return { error: 'subject required' }
  if (!chapterName) return { error: 'chapterName required' }

  const ay = await d.collection('academicYears').findOne({ id: academicYearId })
  if (!ay) return { error: 'Academic year not found' }
  const cls = await d.collection('classes').findOne({ id: classId })
  if (!cls) return { error: 'Class not found' }

  const chapterKey = chapterKeyFor(chapterName)
  const key = { academicYearId, classId, subject, chapterKey }
  const existing = await d.collection('chapterPacingPlans').findOne(key)
  const n = Math.max(0, Math.min(200, Number(totalPeriods) || 0))
  const now = new Date()

  // Reconcile periods[] — preserve existing topic/subtopic data.
  let periods
  if (Array.isArray(incomingPeriods) && incomingPeriods.length) {
    // CSV import path: honour supplied array verbatim (Phase 2d).
    periods = incomingPeriods.slice(0, 200).map((p, i) => ({
      periodNumber: Number(p.periodNumber) || (i + 1),
      topic: String(p.topic || '').trim(),
      subTopic: String(p.subTopic || '').trim(),
      status: p.status || 'planned',
      loCodes: Array.isArray(p.loCodes) ? p.loCodes : [],
      lessonId: p.lessonId || '',
      driveFileId: p.driveFileId || '',
      driveFileUrl: p.driveFileUrl || '',
      updatedAt: now,
    }))
  } else {
    const prev = Array.isArray(existing?.periods) ? existing.periods : []
    periods = []
    for (let i = 1; i <= n; i++) {
      const kept = prev.find(p => p.periodNumber === i)
      periods.push({
        periodNumber: i,
        topic: kept?.topic || '',
        subTopic: kept?.subTopic || '',
        status: kept?.status || 'planned',
        loCodes: kept?.loCodes || [],
        lessonId: kept?.lessonId || '',
        driveFileId: kept?.driveFileId || '',
        driveFileUrl: kept?.driveFileUrl || '',
        updatedAt: kept?.updatedAt || now,
      })
    }
  }

  const doc = {
    id: existing?.id || randomUUID(),
    academicYearId,
    academicYearLabel: ay.label,
    classId,
    className: className || cls.name,
    subject: String(subject).trim(),
    bookName: String(bookName || existing?.bookName || '').trim(),
    chapterKey,
    chapterName: String(chapterName).trim(),
    chapterOrder: Number(chapterOrder) || existing?.chapterOrder || 999,
    chapterSource: existing?.chapterSource || 'plan',
    totalPeriods: incomingPeriods?.length ? periods.length : n,
    periods,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
  await d.collection('chapterPacingPlans').updateOne(key, { $set: doc }, { upsert: true })
  return { ok: true, plan: doc }
}

/** Patch a single Period row inside a chapter plan (topic/subTopic/status). */
export async function updatePeriodInPlan(d, { planId, periodNumber, topic, subTopic, status, loCodes, lessonId, driveFileId, driveFileUrl }) {
  if (!planId) return { error: 'planId required' }
  const plan = await d.collection('chapterPacingPlans').findOne({ id: planId })
  if (!plan) return { error: 'Chapter plan not found' }
  const now = new Date()
  const periods = Array.isArray(plan.periods) ? [...plan.periods] : []
  const idx = periods.findIndex(p => p.periodNumber === Number(periodNumber))
  if (idx < 0) return { error: `Period ${periodNumber} not found — expand totalPeriods first.` }
  const p = { ...periods[idx] }
  if (topic !== undefined) p.topic = String(topic || '').trim()
  if (subTopic !== undefined) p.subTopic = String(subTopic || '').trim()
  if (status !== undefined) p.status = String(status || 'planned').trim()
  if (Array.isArray(loCodes)) p.loCodes = loCodes.map(x => String(x || '').trim()).filter(Boolean)
  if (lessonId !== undefined) p.lessonId = String(lessonId || '')
  if (driveFileId !== undefined) p.driveFileId = String(driveFileId || '')
  if (driveFileUrl !== undefined) p.driveFileUrl = String(driveFileUrl || '')
  p.updatedAt = now
  periods[idx] = p
  await d.collection('chapterPacingPlans').updateOne(
    { id: planId }, { $set: { periods, updatedAt: now } },
  )
  return { ok: true, period: p, planId }
}

/** Delete a chapter plan (frees up its periods from the annual budget). */
export async function deleteChapterPlan(d, id) {
  if (!id) return { error: 'id required' }
  const r = await d.collection('chapterPacingPlans').deleteOne({ id })
  return { ok: true, deleted: r.deletedCount }
}

/**
 * Look up the exact chapter pacing period the AI Lesson Generator
 * needs to respect.  Returns the { topic, subTopic, loCodes,
 * chapterOrder, totalPeriods, planId } needed to build the Gemini
 * prompt with hard constraints.  Missing plan or missing period
 * returns null so the generator falls back to inference.
 */
export async function findPlannedPeriod(d, { academicYearId, classId, subject, chapterName, periodNumber }) {
  if (!academicYearId || !classId || !subject || !chapterName || !periodNumber) return null
  const chapterKey = chapterKeyFor(chapterName)
  const plan = await d.collection('chapterPacingPlans').findOne(
    { academicYearId, classId, subject, chapterKey }, { projection: { _id: 0 } },
  )
  if (!plan) return null
  const period = (plan.periods || []).find(p => p.periodNumber === Number(periodNumber))
  if (!period) return { plan, period: null, hasHardConstraint: false }
  const hasTopic = !!(period.topic || '').trim()
  const hasSubTopic = !!(period.subTopic || '').trim()
  return {
    plan,
    period,
    hasTopic,
    hasSubTopic,
    hasHardConstraint: hasTopic && hasSubTopic,
    hasSoftConstraint: hasTopic && !hasSubTopic,
  }
}

/**
 * Aggregate progress dashboard per subject for an academic year:
 *   for each (class, subject) allocation → totals of chapters planned,
 *   period rows created, topics filled, generated, archived.
 * Used by the Phase 2b Progress Dashboard card.
 */
export async function progressSummaryForYear(d, academicYearId) {
  if (!academicYearId) return { subjects: [], totals: {} }
  const allocations = await d.collection('subjectPeriodAllocations')
    .find({ academicYearId }, { projection: { _id: 0 } }).toArray()
  const plans = await d.collection('chapterPacingPlans')
    .find({ academicYearId }, { projection: { _id: 0 } }).toArray()
  const byKey = new Map()
  for (const a of allocations) {
    byKey.set(`${a.classId}::${a.subject}`, {
      classId: a.classId, className: a.className, subject: a.subject,
      annualPeriods: a.annualPeriods || 0,
      chapters: 0, plannedPeriods: 0, topicsFilled: 0, subTopicsFilled: 0,
      generated: 0, archived: 0,
    })
  }
  for (const p of plans) {
    const key = `${p.classId}::${p.subject}`
    if (!byKey.has(key)) byKey.set(key, {
      classId: p.classId, className: p.className, subject: p.subject,
      annualPeriods: 0, chapters: 0, plannedPeriods: 0, topicsFilled: 0,
      subTopicsFilled: 0, generated: 0, archived: 0,
    })
    const row = byKey.get(key)
    row.chapters += 1
    row.plannedPeriods += p.totalPeriods || 0
    for (const pd of (p.periods || [])) {
      if ((pd.topic || '').trim()) row.topicsFilled += 1
      if ((pd.subTopic || '').trim()) row.subTopicsFilled += 1
      if (pd.status === 'generated' || pd.lessonId) row.generated += 1
      if (pd.status === 'archived' || pd.driveFileUrl) row.archived += 1
    }
  }
  const subjects = [...byKey.values()].sort((a, b) =>
    String(a.className).localeCompare(String(b.className)) ||
    String(a.subject).localeCompare(String(b.subject))
  )
  const totals = subjects.reduce((acc, r) => ({
    subjectCount: acc.subjectCount + 1,
    annualPeriods: acc.annualPeriods + r.annualPeriods,
    plannedPeriods: acc.plannedPeriods + r.plannedPeriods,
    chapters: acc.chapters + r.chapters,
    topicsFilled: acc.topicsFilled + r.topicsFilled,
    subTopicsFilled: acc.subTopicsFilled + r.subTopicsFilled,
    generated: acc.generated + r.generated,
    archived: acc.archived + r.archived,
  }), { subjectCount: 0, annualPeriods: 0, plannedPeriods: 0, chapters: 0, topicsFilled: 0, subTopicsFilled: 0, generated: 0, archived: 0 })
  return { subjects, totals }
}


// ═════════════════════════════════════════════════════════════════════
// PHASE 2d — CSV Bulk Import
//
// Admin downloads a template, fills it with:
//   Academic Year, Class, Subject, Book, Chapter No, Chapter Name,
//   Total Periods, Period No, Topic, Sub-topic
// then uploads.  The importer:
//   1. Parses & validates every row.  Bad rows are reported with row
//      numbers — nothing is imported until the admin confirms.
//   2. On confirm, upserts allocations + chapter plans in bulk.
//
// Import happens in two stages: validate → apply.  The frontend uses
// the same endpoint with `?dryRun=1` for the first pass so admins can
// review before committing.
// ═════════════════════════════════════════════════════════════════════

export const CSV_TEMPLATE_HEADERS = [
  'Academic Year', 'Class', 'Subject', 'Book',
  'Chapter No', 'Chapter Name', 'Total Periods',
  'Period No', 'Topic', 'Sub-topic',
]

export function buildCsvTemplate() {
  const lines = [
    CSV_TEMPLATE_HEADERS.join(','),
    '2026-27,Class 1,Odia,ଝୁଲଣା ଶ୍ରେଣୀ ୧,1,ଅକ୍ଷର ପରିଚୟ,5,1,ଅ ଅକ୍ଷର,picture reading',
    '2026-27,Class 1,Odia,ଝୁଲଣା ଶ୍ରେଣୀ ୧,1,ଅକ୍ଷର ପରିଚୟ,5,2,ଆ ଅକ୍ଷର,letter drill',
    '2026-27,Class 1,Odia,ଝୁଲଣା ଶ୍ରେଣୀ ୧,1,ଅକ୍ଷର ପରିଚୟ,5,3,ଇ ଅକ୍ଷର,practice',
    '2026-27,Class 1,Odia,ଝୁଲଣା ଶ୍ରେଣୀ ୧,1,ଅକ୍ଷର ପରିଚୟ,5,4,revision,workbook',
    '2026-27,Class 1,Odia,ଝୁଲଣା ଶ୍ରେଣୀ ୧,1,ଅକ୍ଷର ପରିଚୟ,5,5,assessment,oral test',
    '2026-27,Class 1,Mathematics,ଗଣିତ (ଖୁସିଖୁସିଆ ଗଣିତ),2,ପାଠ - ୨,4,1,,',
    '2026-27,Class 1,Mathematics,ଗଣିତ (ଖୁସିଖୁସିଆ ଗଣିତ),2,ପାଠ - ୨,4,2,,',
    '2026-27,Class 1,Mathematics,ଗଣିତ (ଖୁସିଖୁସିଆ ଗଣିତ),2,ପାଠ - ୨,4,3,,',
    '2026-27,Class 1,Mathematics,ଗଣିତ (ଖୁସିଖୁସିଆ ଗଣିତ),2,ପାଠ - ୨,4,4,,',
  ]
  return '\uFEFF' + lines.join('\n')      // UTF-8 BOM keeps Excel happy with Odia
}

/**
 * Minimal RFC-4180 CSV parser — handles double-quoted fields with
 * embedded commas / newlines / escaped quotes.  Returns array of
 * row-arrays.  First non-empty row is the header row.
 */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const t = String(text || '').replace(/^\uFEFF/, '')  // strip BOM
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && t[i + 1] === '\n') i++
        row.push(field); field = ''
        if (row.some(x => String(x).trim())) rows.push(row)
        row = []
      } else field += c
    }
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(x => String(x).trim())) rows.push(row) }
  return rows
}

/**
 * Validate a parsed CSV against the template shape.  Returns:
 *   { headers, records: [{rowNumber, ...cleaned, errors:[]}],
 *     summary: { total, valid, errorRows }, groupedPlans: Map }
 * `groupedPlans` is the pre-computed shape ready to upsert (rows
 * sharing (year, class, subject, chapter) collapse into one plan with
 * a periods[] array).
 */
export async function validateCsvImport(d, csvText) {
  const parsed = parseCsv(csvText)
  if (!parsed.length) return { error: 'CSV is empty' }
  const [rawHeaders, ...body] = parsed
  const headers = rawHeaders.map(h => String(h || '').trim())
  const expectedHeaders = CSV_TEMPLATE_HEADERS
  const missing = expectedHeaders.filter(h => !headers.includes(h))
  if (missing.length) return { error: `Missing header column(s): ${missing.join(', ')}` }

  // Prefetch classes for name→id resolution.
  const classes = await d.collection('classes').find({}, { projection: { _id: 0, id: 1, name: 1, order: 1 } }).toArray()
  const classByName = new Map(classes.map(c => [String(c.name || '').trim().toLowerCase(), c]))

  // Prefetch academic years — we auto-create only well-formed labels.
  const years = await d.collection('academicYears').find({}, { projection: { _id: 0, id: 1, label: 1 } }).toArray()
  const yearByLabel = new Map(years.map(y => [String(y.label || '').trim(), y]))

  const idx = Object.fromEntries(expectedHeaders.map(h => [h, headers.indexOf(h)]))
  const records = []
  const yearsToCreate = new Set()
  for (let i = 0; i < body.length; i++) {
    const row = body[i]
    const get = (h) => String(row[idx[h]] ?? '').trim()
    const rec = {
      rowNumber: i + 2,     // +2 for 1-based row + header row
      academicYear: get('Academic Year'),
      className: get('Class'),
      subject: get('Subject'),
      book: get('Book'),
      chapterNo: Number(get('Chapter No')) || 0,
      chapterName: get('Chapter Name'),
      totalPeriods: Number(get('Total Periods')) || 0,
      periodNo: Number(get('Period No')) || 0,
      topic: get('Topic'),
      subTopic: get('Sub-topic'),
      errors: [],
    }
    if (!rec.academicYear) rec.errors.push('Academic Year required')
    else if (!/^\d{4}[-–]\d{2,4}$/.test(rec.academicYear)) rec.errors.push('Academic Year must match YYYY-YY (e.g. 2026-27)')
    else if (!yearByLabel.has(rec.academicYear)) yearsToCreate.add(rec.academicYear)

    if (!rec.className) rec.errors.push('Class required')
    else if (!classByName.has(rec.className.toLowerCase())) rec.errors.push(`Unknown Class "${rec.className}"`)

    if (!rec.subject) rec.errors.push('Subject required')
    if (!rec.chapterName) rec.errors.push('Chapter Name required')
    if (!(rec.totalPeriods >= 1 && rec.totalPeriods <= 200)) rec.errors.push('Total Periods must be 1..200')
    if (rec.periodNo && (rec.periodNo < 1 || rec.periodNo > rec.totalPeriods)) rec.errors.push(`Period No ${rec.periodNo} exceeds Total Periods ${rec.totalPeriods}`)
    records.push(rec)
  }

  // Group by (year, class, subject, chapter) → plan shape.
  const grouped = new Map()
  for (const r of records) {
    if (r.errors.length) continue
    const cls = classByName.get(r.className.toLowerCase())
    const cKey = `${r.academicYear}::${cls.id}::${r.subject}::${chapterKeyFor(r.chapterName)}`
    if (!grouped.has(cKey)) grouped.set(cKey, {
      academicYear: r.academicYear,
      classId: cls.id, className: cls.name,
      subject: r.subject, book: r.book,
      chapterNo: r.chapterNo, chapterName: r.chapterName,
      totalPeriods: r.totalPeriods,
      periods: {},          // periodNumber → { topic, subTopic }
    })
    const g = grouped.get(cKey)
    // Prefer larger totalPeriods when rows disagree.
    if (r.totalPeriods > g.totalPeriods) g.totalPeriods = r.totalPeriods
    if (r.periodNo) {
      const existing = g.periods[r.periodNo]
      if (existing && (existing.topic || existing.subTopic) && (r.topic || r.subTopic)) {
        r.errors.push(`Duplicate Period ${r.periodNo} for chapter "${r.chapterName}"`)
      } else {
        g.periods[r.periodNo] = { topic: r.topic, subTopic: r.subTopic }
      }
    }
  }

  // Also validate chapter-total consistency within a group.
  for (const [, g] of grouped) {
    const distinctTotals = new Set(records.filter(r =>
      !r.errors.length &&
      r.academicYear === g.academicYear &&
      r.className === g.className &&
      r.subject === g.subject &&
      chapterKeyFor(r.chapterName) === chapterKeyFor(g.chapterName)
    ).map(r => r.totalPeriods))
    if (distinctTotals.size > 1) {
      for (const r of records) {
        if (r.className === g.className && r.subject === g.subject && chapterKeyFor(r.chapterName) === chapterKeyFor(g.chapterName)) {
          if (r.totalPeriods !== g.totalPeriods) r.errors.push(`Inconsistent Total Periods (${r.totalPeriods} vs ${g.totalPeriods}) for chapter "${r.chapterName}"`)
        }
      }
    }
  }

  const errorRows = records.filter(r => r.errors.length).length
  return {
    headers, records,
    summary: { total: records.length, valid: records.length - errorRows, errorRows },
    plans: [...grouped.values()],
    yearsToCreate: [...yearsToCreate],
  }
}

/**
 * Apply a validated CSV import — creates missing academic years,
 * upserts allocations (per Class × Subject, running total from the
 * chapters), and upserts chapter plans with their period arrays.
 */
export async function applyCsvImport(d, csvText) {
  const v = await validateCsvImport(d, csvText)
  if (v.error) return { error: v.error }
  if (v.summary.errorRows > 0) return { error: `${v.summary.errorRows} row(s) have validation errors — fix them before applying.` }

  const { randomUUID } = await import('node:crypto')
  const now = new Date()

  // 1. Auto-create academic years that don't exist yet.
  for (const label of v.yearsToCreate) {
    const existing = await d.collection('academicYears').findOne({ label })
    if (!existing) {
      await d.collection('academicYears').insertOne({
        id: randomUUID(),
        label,
        teachingDays: 190,        // sensible default; admin can adjust
        notes: 'Auto-created via CSV import',
        isActive: false,
        createdAt: now, updatedAt: now,
      })
    }
  }
  const years = await d.collection('academicYears').find({}, { projection: { _id: 0 } }).toArray()
  const yearByLabel = new Map(years.map(y => [String(y.label).trim(), y]))

  // 2. Upsert every chapter plan; aggregate per-subject totals as we go.
  const subjectTotals = new Map()      // `${yearId}::${classId}::${subject}` → sum of totalPeriods
  const plansApplied = []
  for (const g of v.plans) {
    const yr = yearByLabel.get(g.academicYear)
    if (!yr) continue
    const periods = []
    for (let i = 1; i <= g.totalPeriods; i++) {
      const src = g.periods[i] || {}
      periods.push({
        periodNumber: i,
        topic: src.topic || '',
        subTopic: src.subTopic || '',
        status: 'planned',
        loCodes: [], lessonId: '', driveFileId: '', driveFileUrl: '',
        updatedAt: now,
      })
    }
    const r = await upsertChapterPlan(d, {
      academicYearId: yr.id, classId: g.classId, className: g.className,
      subject: g.subject, bookName: g.book,
      chapterName: g.chapterName, chapterOrder: g.chapterNo, totalPeriods: g.totalPeriods,
      periods,
    })
    if (r?.ok) plansApplied.push(r.plan.id)
    const key = `${yr.id}::${g.classId}::${g.subject}`
    subjectTotals.set(key, (subjectTotals.get(key) || 0) + g.totalPeriods)
  }

  // 3. Bump allocations so annualPeriods is at least the sum of chapter
  //    totals (never shrink an existing allocation set by admin).
  const allocationsTouched = []
  for (const [key, sum] of subjectTotals) {
    const [academicYearId, classId, subject] = key.split('::')
    const existing = await d.collection('subjectPeriodAllocations').findOne(
      { academicYearId, classId, subject }, { projection: { _id: 0 } },
    )
    const targetAnnual = Math.max(existing?.annualPeriods || 0, sum)
    const cls = await d.collection('classes').findOne({ id: classId })
    const r = await upsertAllocation(d, {
      academicYearId, classId, className: cls?.name || existing?.className,
      subject, annualPeriods: targetAnnual, notes: existing?.notes,
    })
    if (r?.ok) allocationsTouched.push(r.allocation.id)
  }

  return {
    ok: true,
    summary: {
      yearsCreated: v.yearsToCreate.length,
      plansUpserted: plansApplied.length,
      allocationsTouched: allocationsTouched.length,
      rowsProcessed: v.summary.total,
    },
  }
}

