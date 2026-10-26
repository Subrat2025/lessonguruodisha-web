// ============================================================
//  Panchapadi self-healing migrations
// ------------------------------------------------------------
//  Idempotent one-time data-safety migrations for the
//  panchapadiUploads collection.  These are safe to run on
//  every process startup and every API request — the
//  `migrations` marker collection guarantees each migration
//  runs at most ONCE per DB, and never touches records that
//  are already in the desired state.
//
//  No lesson content is modified.  Only the visibility flag
//  used by the "Panchapadi New Lesson Plan" library.  Nothing
//  in the /classes, /books, /chapters, /lessons or existing
//  Panchapadi collections is touched.
// ============================================================

// In-flight promise cache — protects against concurrent invocations of
// the migration during cold-start.  Cleared once the promise resolves,
// so subsequent requests hit the fast DB-marker short-circuit.
let INFLIGHT = null
let INFLIGHT_V2 = null
let INFLIGHT_V3 = null
let INFLIGHT_V4 = null

/**
 * Ensures every panchapadiUploads row has an explicit
 * `newLessonPlanVisible` boolean.  Rows that lack the field
 * default to `false` (legacy uploads must be explicitly opted
 * in by Admin before they appear in the New Lesson Plan
 * library).  Records a marker in the `migrations` collection
 * so subsequent invocations no-op.
 *
 * Safe to call on every API request — cheap when already run.
 */
export async function ensurePanchapadiVisibilityMigration(d) {
  // Coalesce concurrent callers into one execution.
  if (INFLIGHT) return INFLIGHT
  INFLIGHT = (async () => {
    const MARKER = 'panchapadi_new_lesson_visibility_migration_v1'
    try {
      const migrations = d.collection('migrations')
      const uploads = d.collection('panchapadiUploads')

      // Fast path — marker already recorded AND no orphaned legacy rows.
      // Belt-and-braces means we ALWAYS scan for missing flags even if the
      // marker exists, because a fresh production import could reintroduce
      // legacy rows.  This is O(1) index lookup on newLessonPlanVisible.
      const marker = await migrations.findOne({ id: MARKER })
      const missing = await uploads.countDocuments({ newLessonPlanVisible: { $exists: false } })

      if (marker && missing === 0) {
        return { ok: true, skipped: true, marker: MARKER, migratedAt: marker.migratedAt }
      }

      // Real work — patch every row lacking the flag → false.
      let modified = 0
      if (missing > 0) {
        const res = await uploads.updateMany(
          { newLessonPlanVisible: { $exists: false } },
          {
            $set: {
              newLessonPlanVisible: false,
              legacyPreVisibilityGate: true,
              migratedAt: new Date(),
              migrationNote: 'Auto-migrated by v1 self-healing migration. Legacy record hidden from Panchapadi New Lesson Plan library. Admin can opt in per-record.',
            },
          },
        )
        modified = res.modifiedCount || 0
      }
      // Upsert marker (idempotent — records latest run info).
      await migrations.updateOne(
        { id: MARKER },
        {
          $set: { id: MARKER, migratedAt: new Date(), modifiedCount: modified, totalRows: await uploads.countDocuments({}) },
        },
        { upsert: true },
      )
      // eslint-disable-next-line no-console
      console.log(`[PANCHAPADI-MIGRATION] ${MARKER} · migrated ${modified} legacy row(s) → newLessonPlanVisible=false`)
      return { ok: true, skipped: false, marker: MARKER, migratedCount: modified }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[PANCHAPADI-MIGRATION] failed:', e?.message)
      return { ok: false, error: e?.message || 'unknown migration failure' }
    } finally {
      // Clear the in-flight cache so subsequent hits re-check the DB
      // (still hits the fast short-circuit above when marker+missing=0).
      INFLIGHT = null
    }
  })()
  return INFLIGHT
}

/**
 * v2 — Download/print gate migration.
 *
 * User contract (June 2025): every existing panchapadiUpload row must
 * have ALL FOUR download/print gates explicitly set to `false` so the
 * teacher-facing viewer hides the corresponding buttons until Admin
 * intentionally opts each lesson in.  Fields:
 *   • allowPrint          — Show "Print" button
 *   • allowPdfDownload    — Show "Download PDF" button
 *   • allowHtmlDownload   — Show "Download HTML" button
 *   • allowRawDownload    — Show "Download Raw file" button
 *
 * Runs at most ONCE per DB, guarded by a marker in the `migrations`
 * collection.  Idempotent — subsequent invocations short-circuit.
 * Belt-and-braces: also patches any row missing ANY of the four flags
 * on later hits (defence against fresh imports of legacy data).
 */
export async function ensurePanchapadiDownloadGatesMigration(d) {
  if (INFLIGHT_V2) return INFLIGHT_V2
  INFLIGHT_V2 = (async () => {
    const MARKER = 'panchapadi_download_gates_migration_v2'
    try {
      const migrations = d.collection('migrations')
      const uploads = d.collection('panchapadiUploads')

      const marker = await migrations.findOne({ id: MARKER })
      // How many rows are missing at least one of the four flags?
      const anyMissing = await uploads.countDocuments({
        $or: [
          { allowPrint: { $exists: false } },
          { allowPdfDownload: { $exists: false } },
          { allowHtmlDownload: { $exists: false } },
          { allowRawDownload: { $exists: false } },
        ],
      })

      // Fast path — marker exists AND every row already has all four
      // fields — no work to do.
      if (marker && anyMissing === 0) {
        return { ok: true, skipped: true, marker: MARKER, migratedAt: marker.migratedAt }
      }

      let firstRunModified = 0
      // First-run: force-reset ALL rows to false so admin re-enables
      // intentionally.  Only happens once — marker prevents rerun.
      if (!marker) {
        const res = await uploads.updateMany(
          {},
          {
            $set: {
              allowPrint: false,
              allowPdfDownload: false,
              allowHtmlDownload: false,
              allowRawDownload: false,
              downloadGatesResetAt: new Date(),
              downloadGatesResetNote:
                'Auto-reset by v2 self-healing migration. All download/print buttons hidden until Admin re-enables per-lesson.',
            },
          },
        )
        firstRunModified = res.modifiedCount || 0
      } else if (anyMissing > 0) {
        // Marker already set but a later import added rows lacking the
        // fields — patch just those missing fields to false (do NOT
        // reset rows that already have explicit true/false).
        const patchOps = []
        for (const field of ['allowPrint', 'allowPdfDownload', 'allowHtmlDownload', 'allowRawDownload']) {
          patchOps.push(
            uploads.updateMany(
              { [field]: { $exists: false } },
              { $set: { [field]: false } },
            ),
          )
        }
        const results = await Promise.all(patchOps)
        firstRunModified = results.reduce((n, r) => n + (r.modifiedCount || 0), 0)
      }

      await migrations.updateOne(
        { id: MARKER },
        { $set: { id: MARKER, migratedAt: new Date(), modifiedCount: firstRunModified, totalRows: await uploads.countDocuments({}) } },
        { upsert: true },
      )
      // eslint-disable-next-line no-console
      console.log(`[PANCHAPADI-MIGRATION] ${MARKER} · reset ${firstRunModified} row(s) → all four download/print flags = false`)
      return { ok: true, skipped: false, marker: MARKER, migratedCount: firstRunModified }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[PANCHAPADI-MIGRATION v2] failed:', e?.message)
      return { ok: false, error: e?.message || 'unknown migration failure' }
    } finally {
      INFLIGHT_V2 = null
    }
  })()
  return INFLIGHT_V2
}


/**
 * v3 — Per-period topic backfill.
 *
 * Populates a `topicTitle` field on every panchapadiUploads row by
 * running the HTML through the panchapadiSections parser.  Bundle
 * uploads historically stored `title = "${chapterName} · Period N"`
 * which caused the teacher-facing list to read "Period 1 · Chapter · Period 1".
 * The extractor pulls a clean per-period topic (from <h1>, <title>, or <h2>)
 * so the list reads "Period 1 · Actual Topic Name" instead.
 *
 * Idempotent — only touches rows missing `topicTitle`.  Guarded by a
 * marker in the `migrations` collection.  Safe to call on every /browse
 * hit (fast short-circuit when marker exists and no rows are missing).
 */
export async function ensurePanchapadiTopicTitleMigration(d) {
  if (INFLIGHT_V3) return INFLIGHT_V3
  INFLIGHT_V3 = (async () => {
    const MARKER = 'panchapadi_topic_title_migration_v3'
    try {
      const migrations = d.collection('migrations')
      const uploads = d.collection('panchapadiUploads')

      const marker = await migrations.findOne({ id: MARKER })
      // Missing = field absent OR field is empty string.
      const missingFilter = { $or: [
        { topicTitle: { $exists: false } },
        { topicTitle: '' },
        { topicTitle: null },
      ] }
      const missing = await uploads.countDocuments(missingFilter)

      if (marker && missing === 0) {
        return { ok: true, skipped: true, marker: MARKER, migratedAt: marker.migratedAt }
      }

      let modified = 0
      if (missing > 0) {
        const { extractPeriodTopic } = await import('@/lib/panchapadiSections.js')
        // Only fetch id + html + fallback title fields — html can be big so
        // we page through 200 at a time to bound memory.
        const cursor = uploads.find(missingFilter, {
          projection: { _id: 0, id: 1, html: 1, chapterLabel: 1, period: 1 },
        })
        let batch = []
        const BATCH_SIZE = 40
        const flush = async () => {
          if (!batch.length) return
          const ops = batch.map(row => ({
            updateOne: {
              filter: { id: row.id },
              update: { $set: {
                topicTitle: row._topic,
                topicTitleBackfilledAt: new Date(),
              } },
            },
          }))
          const res = await uploads.bulkWrite(ops, { ordered: false })
          modified += (res.modifiedCount || 0)
          batch = []
        }
        while (await cursor.hasNext()) {
          const row = await cursor.next()
          if (!row) continue
          let t = ''
          try { t = extractPeriodTopic(row.html || '') } catch { /* skip */ }
          // Fall back to chapter label if extraction fails — better than empty.
          if (!t) t = String(row.chapterLabel || '').trim()
          batch.push({ ...row, _topic: t.slice(0, 200) })
          if (batch.length >= BATCH_SIZE) await flush()
        }
        await flush()
      }

      await migrations.updateOne(
        { id: MARKER },
        { $set: { id: MARKER, migratedAt: new Date(), modifiedCount: modified, totalRows: await uploads.countDocuments({}) } },
        { upsert: true },
      )
      // eslint-disable-next-line no-console
      console.log(`[PANCHAPADI-MIGRATION] ${MARKER} · backfilled topicTitle for ${modified} row(s)`)
      return { ok: true, skipped: false, marker: MARKER, migratedCount: modified }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[PANCHAPADI-MIGRATION v3] failed:', e?.message)
      return { ok: false, error: e?.message || 'unknown migration failure' }
    } finally {
      INFLIGHT_V3 = null
    }
  })()
  return INFLIGHT_V3
}


/**
 * v4 — Force-refresh per-period topic titles.
 *
 * The v3 migration ran with an older `extractPeriodTopic()` that
 * returned the generic template header ("PANCHAPADI LESSON PLAN")
 * for every period, because it read the hero `<h1>` first.  v4 has
 * a smarter extractor that reads the Lesson Profile table's
 * "ଅଧ୍ୟାୟ / ପ୍ରସଙ୍ଗ" row (per-period Topic/Prasanga) and skips
 * generic titles.  This migration overwrites `topicTitle` for
 * every row (unconditional refresh) so historical bundles show
 * period-specific topics on the teacher-facing period list.
 *
 * Idempotent — marker prevents a second run.  Records
 * `topicTitleV4RefreshedAt` on each row so future audits can trace
 * which rows were re-parsed.
 */
export async function ensurePanchapadiTopicTitleV4Refresh(d) {
  if (INFLIGHT_V4) return INFLIGHT_V4
  INFLIGHT_V4 = (async () => {
    const MARKER = 'panchapadi_topic_title_v4_refresh'
    try {
      const migrations = d.collection('migrations')
      const uploads = d.collection('panchapadiUploads')

      const marker = await migrations.findOne({ id: MARKER })
      if (marker) {
        return { ok: true, skipped: true, marker: MARKER, migratedAt: marker.migratedAt }
      }

      const { extractPeriodTopic } = await import('@/lib/panchapadiSections.js')
      const cursor = uploads.find({}, {
        projection: { _id: 0, id: 1, html: 1, chapterLabel: 1, period: 1, topicTitle: 1 },
      })
      let batch = []
      let modified = 0
      const BATCH_SIZE = 40
      const flush = async () => {
        if (!batch.length) return
        const ops = batch.map(row => ({
          updateOne: {
            filter: { id: row.id },
            update: { $set: {
              topicTitle: row._topic,
              topicTitleV4RefreshedAt: new Date(),
            } },
          },
        }))
        const res = await uploads.bulkWrite(ops, { ordered: false })
        modified += (res.modifiedCount || 0)
        batch = []
      }

      while (await cursor.hasNext()) {
        const row = await cursor.next()
        if (!row) continue
        let t = ''
        try { t = extractPeriodTopic(row.html || '') } catch { /* skip */ }
        if (!t) t = String(row.chapterLabel || '').trim()
        batch.push({ ...row, _topic: t.slice(0, 200) })
        if (batch.length >= BATCH_SIZE) await flush()
      }
      await flush()

      await migrations.updateOne(
        { id: MARKER },
        { $set: { id: MARKER, migratedAt: new Date(), modifiedCount: modified, totalRows: await uploads.countDocuments({}) } },
        { upsert: true },
      )
      // eslint-disable-next-line no-console
      console.log(`[PANCHAPADI-MIGRATION] ${MARKER} · refreshed topicTitle for ${modified} row(s)`)
      return { ok: true, skipped: false, marker: MARKER, migratedCount: modified }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[PANCHAPADI-MIGRATION v4] failed:', e?.message)
      return { ok: false, error: e?.message || 'unknown migration failure' }
    } finally {
      INFLIGHT_V4 = null
    }
  })()
  return INFLIGHT_V4
}


