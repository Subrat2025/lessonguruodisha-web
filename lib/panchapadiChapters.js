// ═════════════════════════════════════════════════════════════════════
// Panchapadi Chapters — dedicated collection for the Panchapadi New
// Lesson Plan library.  Fully ISOLATED from the legacy `chapters`
// curriculum collection.  Never read or write curriculum chapters
// from this module.
//
// One document per (classLabel, bookLabel, chapterLabel) triple.
// Rows are backfilled from existing `panchapadiUploads` on the first
// authenticated request that touches the browse / admin endpoints,
// and thereafter authoritative for chapter title / ordering /
// visibility / archived state.
//
// The teacher-facing `/panchapadi-lessons/browse` endpoint joins
// `panchapadiUploads` (periods) to `panchapadiChapters` on the
// composite key so admin changes to display order / archived flag
// apply immediately.
// ═════════════════════════════════════════════════════════════════════

import { randomUUID } from 'node:crypto'

/** Composite key used to join uploads ↔ chapters. */
export const chapterKey = (classLabel, bookLabel, chapterLabel) =>
  [classLabel || '', bookLabel || '', chapterLabel || '']
    .map(s => String(s).trim().toLowerCase())
    .join('::')

/**
 * Ensure the `panchapadiChapters` collection exists and every
 * (classLabel, bookLabel, chapterLabel) group present in
 * `panchapadiUploads` has a corresponding chapter row.  Idempotent —
 * a marker in the `migrations` collection prevents a second full
 * backfill; incremental hits on this function still upsert any new
 * groups introduced by later uploads.
 *
 * @param {import('mongodb').Db} d  Mongo database handle.
 * @returns {Promise<{ ok:true, created:number, updated:number, marker:string }>}
 */
let INFLIGHT = null
export async function ensurePanchapadiChaptersV5(d) {
  if (INFLIGHT) return INFLIGHT
  INFLIGHT = (async () => {
    const MARKER = 'panchapadi_chapters_v5'
    try {
      const migrations = d.collection('migrations')
      const chapters = d.collection('panchapadiChapters')
      const uploads = d.collection('panchapadiUploads')

      // Fast path — indexes are cheap to re-declare.
      await chapters.createIndex({ key: 1 }, { unique: true })
      await chapters.createIndex({ classLabel: 1, bookLabel: 1, displayOrder: 1 })
      await chapters.createIndex({ archived: 1 })

      // Aggregate every unique (class, book, chapter) triple that exists
      // in uploads today, along with the chapterOrder that came from
      // the HTML meta so we seed a stable initial displayOrder.
      const rows = await uploads.aggregate([
        {
          $group: {
            _id: {
              classLabel: '$classLabel',
              bookLabel: '$bookLabel',
              chapterLabel: '$chapterLabel',
            },
            classOrder: { $min: '$classOrder' },
            chapterOrder: { $min: '$chapterOrder' },
            language: { $first: '$language' },
            academicYear: { $first: '$academicYear' },
            periodCount: { $sum: 1 },
            updatedAt: { $max: '$updatedAt' },
          },
        },
      ]).toArray()

      const now = new Date()
      const ops = []
      let created = 0
      const skippedKeys = []
      for (const g of rows) {
        const { classLabel, bookLabel, chapterLabel } = g._id || {}
        if (!classLabel || !bookLabel || !chapterLabel) {
          skippedKeys.push(`${classLabel}::${bookLabel}::${chapterLabel}`)
          continue
        }
        const key = chapterKey(classLabel, bookLabel, chapterLabel)
        const existing = await chapters.findOne({ key })
        if (existing) continue  // never overwrite admin-supplied fields
        created += 1
        // Seed both displayOrder and defaultDisplayOrder to the same
        // HTML-meta chapter order so `Reset to Default` restores the
        // original import sequence.  defaultDisplayOrder is written
        // ONCE at import time and never overwritten by Move Up/Down.
        const seededOrder = ((g.chapterOrder ?? 999) * 10) || 9990
        ops.push({
          insertOne: {
            document: {
              id: randomUUID(),
              key,
              classLabel,
              classOrder: g.classOrder ?? 999,
              bookLabel,
              chapterLabel,
              chapterName: chapterLabel,
              chapterNumber: g.chapterOrder ?? null,
              chapterDescription: '',
              language: g.language || '',
              academicYear: g.academicYear || '',
              displayOrder: seededOrder,
              defaultDisplayOrder: seededOrder,
              status: 'published',
              visible: true,
              archived: false,
              periodCount: g.periodCount || 0,
              createdAt: now,
              updatedAt: now,
            },
          },
        })
      }
      if (ops.length) await chapters.bulkWrite(ops, { ordered: false })

      const marker = await migrations.findOne({ id: MARKER })
      if (!marker) {
        await migrations.insertOne({
          id: MARKER,
          migratedAt: now,
          created,
          groupsScanned: rows.length,
          skippedKeys: skippedKeys.slice(0, 20),
        })
      }
      return { ok: true, created, updated: 0, marker: MARKER }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[PANCHAPADI-MIGRATION v5] failed:', e?.message)
      return { ok: false, error: e?.message || 'unknown' }
    } finally {
      INFLIGHT = null
    }
  })()
  return INFLIGHT
}

/**
 * Reconcile per-chapter period counts.  Cheap — runs whenever the
 * admin browses the chapter list so counts stay accurate after
 * uploads/deletes without a separate cron.
 *
 * PERF: guarded by a per-process TTL cache so debounced searches +
 * filter changes don't re-aggregate the full uploads collection on
 * every keystroke.  Set `force:true` after a fresh upload / delete
 * to bypass the cache.
 */
let LAST_REFRESH_AT = 0
const REFRESH_TTL_MS = 60 * 1000     // 60 s — plenty for the admin session
export async function refreshChapterPeriodCounts(d, opts = {}) {
  const force = opts.force === true
  const now = Date.now()
  if (!force && now - LAST_REFRESH_AT < REFRESH_TTL_MS) {
    return { ok: true, updated: 0, cached: true }
  }
  try {
    const uploads = d.collection('panchapadiUploads')
    const chapters = d.collection('panchapadiChapters')
    const counts = await uploads.aggregate([
      { $group: {
        _id: { classLabel: '$classLabel', bookLabel: '$bookLabel', chapterLabel: '$chapterLabel' },
        count: { $sum: 1 },
      } },
    ]).toArray()
    if (!counts.length) { LAST_REFRESH_AT = now; return { ok: true, updated: 0 } }
    const ops = counts
      .filter(c => c._id?.classLabel && c._id?.bookLabel && c._id?.chapterLabel)
      .map(c => ({
        updateOne: {
          filter: { key: chapterKey(c._id.classLabel, c._id.bookLabel, c._id.chapterLabel) },
          update: { $set: { periodCount: c.count } },
        },
      }))
    if (ops.length) await chapters.bulkWrite(ops, { ordered: false })
    LAST_REFRESH_AT = now
    return { ok: true, updated: ops.length }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[panchapadi-chapters refreshCounts] failed:', e?.message)
    return { ok: false, error: e?.message || 'unknown' }
  }
}

/**
 * v6 — backfill `defaultDisplayOrder` for legacy rows.
 *
 * v5 seeded new rows with `defaultDisplayOrder` explicitly, but rows
 * inserted BEFORE v6 was deployed only carry `displayOrder`.  This
 * migration copies each legacy row's current `displayOrder` into a
 * new `defaultDisplayOrder` field the FIRST time it runs — which
 * assumes the current order matches the import order (true for any
 * row untouched by admin Move Up/Down, and a safe best-effort for
 * rows that were reordered before the feature existed).
 *
 * Idempotent — a marker in `migrations` prevents re-execution, and
 * per-row we only set the field when it's missing (never overwrite
 * a value already there).
 */
let INFLIGHT_V6 = null
export async function ensurePanchapadiDefaultOrderV6(d) {
  if (INFLIGHT_V6) return INFLIGHT_V6
  INFLIGHT_V6 = (async () => {
    const MARKER = 'panchapadi_chapters_default_order_v6'
    try {
      const migrations = d.collection('migrations')
      const chapters = d.collection('panchapadiChapters')
      const marker = await migrations.findOne({ id: MARKER })
      if (marker) return { ok: true, skipped: true, marker: MARKER }

      // Copy displayOrder → defaultDisplayOrder for any row where the
      // new field is missing.  Uses a single aggregation-pipeline update
      // so we don't pull every row into memory.
      const res = await chapters.updateMany(
        { defaultDisplayOrder: { $exists: false } },
        [{ $set: { defaultDisplayOrder: '$displayOrder' } }],
      )
      await migrations.insertOne({ id: MARKER, migratedAt: new Date(), modifiedCount: res.modifiedCount || 0 })
      return { ok: true, skipped: false, marker: MARKER, migratedCount: res.modifiedCount || 0 }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[PANCHAPADI-MIGRATION v6] failed:', e?.message)
      return { ok: false, error: e?.message || 'unknown' }
    } finally {
      INFLIGHT_V6 = null
    }
  })()
  return INFLIGHT_V6
}

