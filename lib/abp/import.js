// === ABP === Activity-based Panchapadi — ZIP import pipeline.
// Background job with 3× retry per file, draft import, duplicate handling,
// original-HTML archival to Cloudinary (authenticated), year-plan parse.
import AdmZip from 'adm-zip'
import { v4 as uuidv4 } from 'uuid'
import { parseChapterHtml, parseYearPlanHtml, sniffChapterHeader } from '@/lib/abp/parse.js'
import { ABP_COLL } from '@/lib/abp/store.js'
import { storeRawFile } from '@/lib/store/storage.js'
import { configureCloudinary } from '@/lib/cloudinary.js'

const RETRY_DELAYS = [3000, 8000, 20000]  // 3 retries
async function withRetry(fn, { onRetry } = {}) {
  let lastErr
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try { return await fn(attempt) }
    catch (e) {
      lastErr = e
      if (attempt < RETRY_DELAYS.length) { if (onRetry) { try { await onRetry(attempt + 1, e) } catch (_) {} } await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt])) }
    }
  }
  throw lastErr
}

// In-memory ZIP cache so a "retry failed files" call can re-use the upload.
const ZIP_CACHE = new Map()
export function cacheZip(jobId, data) {
  ZIP_CACHE.set(jobId, { ...data, at: Date.now() })
  if (ZIP_CACHE.size > 6) { const oldest = [...ZIP_CACHE.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (oldest) ZIP_CACHE.delete(oldest[0]) }
}
export function getCachedZip(jobId) { return ZIP_CACHE.get(jobId) }

const isYearPlanName = (n) => /chapterwise.*period|period.*cg|_cg_|year.?plan|ସାରଣୀ/i.test(n)
const isChapterName = (n) => /\.html?$/i.test(n) && !isYearPlanName(n)

// Peek at a ZIP to prefill class/subject/book + file counts (no import).
export function peekZip(zipBuffer) {
  const zip = new AdmZip(zipBuffer)
  const entries = zip.getEntries().filter(e => !e.isDirectory && /\.html?$/i.test(e.entryName))
  const chapterFiles = entries.filter(e => isChapterName(baseName(e.entryName))).map(e => e.entryName)
  const yearFiles = entries.filter(e => isYearPlanName(baseName(e.entryName))).map(e => e.entryName)
  let header = {}
  if (chapterFiles.length) {
    try { header = sniffChapterHeader(zip.getEntry(chapterFiles[0]).getData().toString('utf-8')) } catch (_) {}
  }
  // subject full -> subject + book split: "ଓଡ଼ିଆ (ଭାଷା ମହକ-୨)"
  const { subject, book } = splitSubject(header.subject || '')
  return { chapterFiles, yearFiles, prefill: { class: header.class != null ? String(header.class) : '', subject, book, subjectFull: header.subject || '' }, expectedChapters: chapterFiles.length }
}

function baseName(p) { return String(p).split('/').pop() }
export function splitSubject(full) {
  const s = String(full || '').trim()
  const m = s.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (m) return { subject: m[1].trim(), book: m[2].trim() }
  return { subject: s, book: '' }
}

export async function createImportJob(db, { zipName, mode, adminId, prefill }) {
  const id = uuidv4()
  const job = {
    id, zipName, mode, adminId,
    class: prefill?.class || '', subject: prefill?.subject || '', book: prefill?.book || '',
    status: 'running', total: 0, done: 0,
    expected: { files: 0, chapters: 0 }, imported: { chapters: 0, periods: 0, skipped: 0, replaced: 0 },
    errors: [], retries: [], warnings: [], yearPlan: null,
    createdAt: new Date(), updatedAt: new Date(),
  }
  await db.collection(ABP_COLL.jobs).insertOne(job)
  return job
}
export async function patchJob(db, jobId, patch) {
  await db.collection(ABP_COLL.jobs).updateOne({ id: jobId }, { $set: { ...patch, updatedAt: new Date() } })
}
export async function getJob(db, jobId) { return db.collection(ABP_COLL.jobs).findOne({ id: jobId }) }
export async function listJobs(db, limit = 30) { return db.collection(ABP_COLL.jobs).find({}).sort({ createdAt: -1 }).limit(limit).toArray() }

// Main runner (fire-and-forget).
export async function runZipImport(db, { jobId, zipBuffer, mode = 'skip', meta }) {
  try {
    const zip = new AdmZip(zipBuffer)
    const entries = zip.getEntries().filter(e => !e.isDirectory && /\.html?$/i.test(e.entryName))
    const chapterEntries = entries.filter(e => isChapterName(baseName(e.entryName)))
    const yearEntries = entries.filter(e => isYearPlanName(baseName(e.entryName)))
    const total = chapterEntries.length + yearEntries.length
    await patchJob(db, jobId, { total, expected: { files: entries.length, chapters: chapterEntries.length } })

    const { class: cls, subject, book } = meta
    let impChapters = 0, impPeriods = 0, skipped = 0, replaced = 0, updated = 0
    const warnings = []

    for (const entry of chapterEntries) {
      const fileName = baseName(entry.entryName)
      try {
        await withRetry(async () => {
          const html = entry.getData().toString('utf-8')
          const parsed = parseChapterHtml(html, { filename: fileName })
          if (!parsed.periods.length) throw new Error('no periods parsed')
          // collect warnings
          if (parsed.warnings?.length) warnings.push({ file: fileName, warnings: parsed.warnings })

          // Match an existing chapter by FILE NAME first (robust for "04a"
          // files that share a number with their parent), then fall back to
          // class+subject+book+number for legacy records without sourceFile.
          // IMPORTANT: only use the number fallback when the file actually has a
          // chapter number. Supplementary/prep files (00, 04a, 09a ...) parse to
          // number=null; matching those by {number:null} would collide and
          // overwrite each other, so for them we rely on the filename match only.
          const byFile = await db.collection(ABP_COLL.chapters).findOne({ class: String(cls), subject, book, sourceFile: fileName })
          const existing = byFile || (parsed.number != null
            ? await db.collection(ABP_COLL.chapters).findOne({ class: String(cls), subject, book, number: parsed.number })
            : null)
          const fileOrder = computeFileOrder(fileName, parsed.number)

          // 'update' (default for re-upload): UPDATE in place, keep order +
          // publish state, never create a second copy.
          if (mode === 'update') {
            if (existing) {
              if (existing.htmlRef) { try { const { deleteRaw } = await import('@/lib/store/storage.js'); await deleteRaw(existing.htmlRef) } catch (_) {} }
              await writeChapter(db, { id: existing.id, html, parsed, cls, subject, book, fileName, status: existing.status || 'draft', order: fileOrder })
              impPeriods += parsed.periods.length; updated++; return
            }
            await writeChapter(db, { id: uuidv4(), html, parsed, cls, subject, book, fileName, status: 'draft', order: fileOrder })
            impChapters++; impPeriods += parsed.periods.length; return
          }

          if (existing) {
            if (mode === 'skip') { skipped++; return }
            if (mode === 'replace') {
              if (existing.htmlRef) { try { const { deleteRaw } = await import('@/lib/store/storage.js'); await deleteRaw(existing.htmlRef) } catch (_) {} }
              await writeChapter(db, { id: existing.id, html, parsed, cls, subject, book, fileName, status: existing.status || 'draft', order: existing.order ?? fileOrder })
              impPeriods += parsed.periods.length; replaced++; return
            }
            // 'new' falls through to insert a fresh record
          }
          const newId = uuidv4()
          await writeChapter(db, { id: newId, html, parsed, cls, subject, book, fileName, status: 'draft', order: fileOrder })
          impChapters++; impPeriods += parsed.periods.length
        }, { onRetry: (n, e) => db.collection(ABP_COLL.jobs).updateOne({ id: jobId }, { $push: { retries: { file: fileName, attempt: n, reason: String(e?.message || e) } } }) })
      } catch (e) {
        await db.collection(ABP_COLL.jobs).updateOne({ id: jobId }, { $push: { errors: { file: fileName, reason: String(e?.message || e), attempts: RETRY_DELAYS.length + 1 } } })
      }
      await db.collection(ABP_COLL.jobs).updateOne({ id: jobId }, { $inc: { done: 1 }, $set: { updatedAt: new Date() } })
    }

    // Year plan
    let yearPlanInfo = null
    for (const entry of yearEntries) {
      const fileName = baseName(entry.entryName)
      try {
        await withRetry(async () => {
          const html = entry.getData().toString('utf-8')
          const yp = parseYearPlanHtml(html)
          const htmlRef = await archiveHtml(html, { cls, subject, book, fileName, kind: 'yearplan' })
          const existing = await db.collection(ABP_COLL.yearPlans).findOne({ class: String(cls), subject, book })
          const doc = { class: String(cls), subject, book, title: yp.title, stats: yp.stats, tables: yp.tables, htmlRef, status: 'draft', warnings: yp.warnings, updatedAt: new Date() }
          if (existing && mode !== 'new') {
            await db.collection(ABP_COLL.yearPlans).updateOne({ id: existing.id }, { $set: doc })
          } else {
            await db.collection(ABP_COLL.yearPlans).insertOne({ id: uuidv4(), createdAt: new Date(), ...doc })
          }
          yearPlanInfo = { title: yp.title, tables: yp.tables.length, stats: yp.stats.length }
        }, { onRetry: (n, e) => db.collection(ABP_COLL.jobs).updateOne({ id: jobId }, { $push: { retries: { file: fileName, attempt: n, reason: String(e?.message || e) } } }) })
      } catch (e) {
        await db.collection(ABP_COLL.jobs).updateOne({ id: jobId }, { $push: { errors: { file: fileName, reason: String(e?.message || e) } } })
      }
      await db.collection(ABP_COLL.jobs).updateOne({ id: jobId }, { $inc: { done: 1 } })
    }

    await patchJob(db, jobId, {
      status: 'done',
      imported: { chapters: impChapters, periods: impPeriods, skipped, replaced, updated, new: impChapters, duplicates: 0 },
      warnings, yearPlan: yearPlanInfo,
    })
  } catch (e) {
    await patchJob(db, jobId, { status: 'error', fatalError: String(e?.message || e) })
  }
}

// Archive original HTML privately (Cloudinary authenticated RAW). Never public.
async function archiveHtml(html, { cls, subject, book, fileName, kind = 'chapter' }) {
  try {
    configureCloudinary()
    const buf = Buffer.from(html, 'utf-8')
    return await storeRawFile(buf, { folder: `lg-abp/${kind}`, format: 'html', tags: ['lg-abp', kind, `class-${cls}`] })
  } catch (e) { console.error('[abp archiveHtml] failed:', e?.message || e); return null }
}

// Sortable order from the file name so "04a" sits right AFTER "04" (not at top):
//   OD1_04 -> 40, OD1_04a -> 41, OD1_12 -> 120, OD1_12a -> 121.
function computeFileOrder(fileName, fallbackNumber = 0) {
  const m = String(fileName || '').match(/_(\d+)\s*([a-zA-Z])?[_.]/)
  if (m) {
    const base = parseInt(m[1], 10) || 0
    const letter = m[2] ? (m[2].toLowerCase().charCodeAt(0) - 96) : 0
    return base * 10 + letter
  }
  return (Number(fallbackNumber) || 0) * 10
}

async function writeChapter(db, { id, html, parsed, cls, subject, book, fileName, status, order }) {
  const htmlRef = await archiveHtml(html, { cls, subject, book, fileName })
  const now = new Date()
  const chapterDoc = {
    id, class: String(cls), subject, book,
    number: parsed.number, title: parsed.title, titleFull: parsed.titleFull, genre: parsed.genre,
    classLabel: parsed.classLabel,
    theme: parsed.theme, mainCompetencies: parsed.mainCompetencies, mainLearningOutcomes: parsed.mainLearningOutcomes,
    planList: parsed.planList, loCodes: parsed.loCodes,
    metaPeriods: parsed.metaPeriods, pageCount: parsed.pageCount, periodCount: parsed.periodCount,
    warnings: parsed.warnings, status, order, sourceFile: fileName,
    htmlRef, updatedAt: now,
  }
  await db.collection(ABP_COLL.chapters).updateOne({ id }, { $set: chapterDoc, $setOnInsert: { createdAt: now } }, { upsert: true })
  // periods — PRESERVE existing period IDs (match by period number) so teacher
  // "taught" marks (abpProgress is keyed by periodId) survive an update-in-place re-import.
  const existingPeriods = await db.collection(ABP_COLL.periods).find({ chapterId: id }).project({ id: 1, number: 1 }).toArray()
  const idByNumber = new Map(existingPeriods.map(e => [String(e.number), e.id]))
  const seen = []
  for (const p of (parsed.periods || [])) {
    const pid = idByNumber.get(String(p.number)) || uuidv4()
    seen.push(pid)
    const pdoc = { chapterId: id, class: String(cls), subject, book, ...p, id: pid, updatedAt: now }
    await db.collection(ABP_COLL.periods).updateOne({ id: pid }, { $set: pdoc, $setOnInsert: { createdAt: now } }, { upsert: true })
  }
  // remove any periods that no longer exist in the re-imported file
  await db.collection(ABP_COLL.periods).deleteMany({ chapterId: id, id: { $nin: seen } })
  return chapterDoc
}
