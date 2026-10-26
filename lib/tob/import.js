// === TOB === Teacher Observation — ZIP import pipeline.
// Background job + 3x retry; parses chapter packs / sets / register; validates each
// item against the LO Master + framework; archives original HTML privately; DRAFT.
import AdmZip from 'adm-zip'
import { v4 as uuidv4 } from 'uuid'
import { parseChapterPack, parseSet, parseRegister, classifyFile, isKnownSubjectCode, VALID_SUBJECT_CODES } from '@/lib/tob/parse.js'
import { validateItem } from '@/lib/tob/validate.js'
import { TOB_COLL } from '@/lib/tob/store.js'
import * as LoMaster from '@/lib/lomaster/store.js'
import { storeRawFile } from '@/lib/store/storage.js'
import { configureCloudinary } from '@/lib/cloudinary.js'

const RETRY_DELAYS = [2000, 6000, 15000]
async function withRetry(fn, onRetry) {
  let err
  for (let a = 0; a <= RETRY_DELAYS.length; a++) {
    try { return await fn() } catch (e) { err = e; if (a < RETRY_DELAYS.length) { if (onRetry) { try { await onRetry(a + 1, e) } catch (_) {} } await new Promise(r => setTimeout(r, RETRY_DELAYS[a])) } }
  }
  throw err
}

const base = (p) => String(p).split('/').pop()

export function peekZip(buf) {
  const zip = new AdmZip(buf)
  const entries = zip.getEntries().filter(e => !e.isDirectory && /\.html?$/i.test(e.entryName))
  const counts = { chapter: 0, set: 0, register: 0, skipped: 0 }
  let prefill = { class: '', subject_id: '' }
  for (const e of entries) {
    const folder = e.entryName.includes('/') ? e.entryName.split('/')[0].toLowerCase() : ''
    const t = classifyFile(base(e.entryName).toLowerCase(), folder)
    if (!t) { counts.skipped++; continue }
    counts[t]++
    if (!prefill.class) { const m = base(e.entryName).match(/Class\s*(\d+)/i); if (m) prefill.class = m[1] }
    if (!prefill.subject_id && /odia|ଓଡ଼ିଆ/i.test(e.entryName)) prefill.subject_id = 'OD'
  }
  return { counts, total: entries.length, prefill }
}

export async function createJob(db, { zipName, mode, adminId, prefill }) {
  const job = { id: uuidv4(), zipName, mode, adminId, class: prefill?.class || '', subject_id: prefill?.subject_id || '',
    status: 'running', total: 0, done: 0, expected: {}, imported: { chapters: 0, sets: 0, registers: 0, skipped: 0, replaced: 0 },
    errors: [], retries: [], results: [], createdAt: new Date(), updatedAt: new Date() }
  await db.collection(TOB_COLL.jobs).insertOne(job)
  return job
}
export async function patchJob(db, id, patch) { await db.collection(TOB_COLL.jobs).updateOne({ id }, { $set: { ...patch, updatedAt: new Date() } }) }
export async function getJob(db, id) { return db.collection(TOB_COLL.jobs).findOne({ id }) }
export async function listJobs(db) { return db.collection(TOB_COLL.jobs).find({}).sort({ createdAt: -1 }).limit(30).toArray() }

async function archive(html, { cls, kind }) {
  try { configureCloudinary(); return await storeRawFile(Buffer.from(html, 'utf-8'), { folder: `lg-tob/${kind}`, format: 'html', tags: ['lg-tob', kind, `class-${cls}`] }) }
  catch (e) { console.error('[tob archive]', e?.message); return null }
}

export async function runImport(db, { jobId, zipBuffer, mode = 'skip', meta }) {
  try {
    const zip = new AdmZip(zipBuffer)
    const entries = zip.getEntries().filter(e => !e.isDirectory && /\.html?$/i.test(e.entryName))
    const { class: cls, subject_id } = meta
    // Reject unknown subject codes outright — never create a subject silently (#4).
    if (!isKnownSubjectCode(subject_id)) {
      await patchJob(db, jobId, { status: 'error', fatalError: `Unknown subject code "${subject_id || '(empty)'}". Valid codes are: ${VALID_SUBJECT_CODES.join(', ')}.` })
      return
    }
    // LO Master lookup for this class+subject (active version)
    const codeMap = await LoMaster.codeMap(db, { class: cls, subject_id })
    const masterRows = await LoMaster.rowsFor(db, { class: cls, subject_id })
    const masterTotal = masterRows.length
    if (masterTotal === 0) await patchJob(db, jobId, { warning: `No LO Master rows for Class ${cls} ${subject_id} — items will be YELLOW (not RED) and can still be published; the LO badge is hidden on the store.` })

    const plan = []
    for (const e of entries) {
      const folder = e.entryName.includes('/') ? e.entryName.split('/')[0].toLowerCase() : ''
      const t = classifyFile(base(e.entryName).toLowerCase(), folder)
      if (!t) continue
      plan.push({ entry: e, type: t, folder })
    }
    await patchJob(db, jobId, { total: plan.length, expected: { files: entries.length, toImport: plan.length, skipped: entries.length - plan.length } })

    let imp = { chapters: 0, sets: 0, registers: 0, skipped: 0, replaced: 0 }
    const results = []

    for (const { entry, type, folder } of plan) {
      const fileName = base(entry.entryName)
      try {
        await withRetry(async () => {
          const html = entry.getData().toString('utf-8')
          if (type === 'register') {
            const parsed = parseRegister(html, { filename: fileName })
            const htmlRef = await archive(html, { cls, kind: 'register' })
            const doc = { class: String(cls), subject_id: String(subject_id).toUpperCase(), title: parsed.title, forms: parsed.forms, htmlRef, status: 'draft', importJobId: jobId, updatedAt: new Date() }
            const existing = await db.collection(TOB_COLL.registers).findOne({ class: doc.class, subject_id: doc.subject_id })
            if (existing && mode === 'skip') { imp.skipped++; results.push({ file: fileName, type, status: 'skipped' }); return }
            if (existing) await db.collection(TOB_COLL.registers).updateOne({ id: existing.id }, { $set: doc })
            else await db.collection(TOB_COLL.registers).insertOne({ id: uuidv4(), createdAt: new Date(), ...doc })
            imp.registers++; results.push({ file: fileName, type, status: 'green', forms: parsed.forms.length })
            return
          }
          const parsed = type === 'set' ? parseSet(html, { filename: fileName }) : parseChapterPack(html, { filename: fileName, folder })
          const v = validateItem(parsed, { codeMap, class: cls, subject_id, masterTotal })
          // duplicate key
          const key = type === 'chapter' ? { class: String(cls), subject_id: String(subject_id).toUpperCase(), type, chapterNo: parsed.chapterNo }
            : { class: String(cls), subject_id: String(subject_id).toUpperCase(), type, setCode: parsed.setCode }
          const existing = await db.collection(TOB_COLL.items).findOne(key)
          if (existing && mode === 'skip') { imp.skipped++; results.push({ file: fileName, type, status: 'skipped' }); return }
          const htmlRef = await archive(html, { cls, kind: type })
          const now = new Date()
          const doc = {
            type, class: String(cls), subject_id: String(subject_id).toUpperCase(), subject_printed: parsed.subject_printed,
            stage: v.stage, term: parsed.term || (type === 'set' ? null : 1), setCode: parsed.setCode || null,
            chapterNo: parsed.chapterNo || null, title: parsed.title, fullTitle: parsed.fullTitle || parsed.title,
            cards: v.correctedCards, partACount: parsed.partACount, partBCount: parsed.partBCount,
            marks: parsed.marks, weightage: parsed.marks?.weightage, coverage: v.coverage,
            validation: { status: v.status, redCount: v.redCount, yellowCount: v.yellowCount, checks: v.checks },
            status: 'draft', htmlRef, order: parsed.chapterNo || parsed.setCode?.charCodeAt(0) || 0, importJobId: jobId,
            loMasterVersion: (await LoMaster.getActiveVersion(db))?.version || null, updatedAt: now,
          }
          if (existing && mode === 'replace') { await db.collection(TOB_COLL.items).updateOne({ id: existing.id }, { $set: doc }); imp.replaced++ }
          else { await db.collection(TOB_COLL.items).insertOne({ id: uuidv4(), createdAt: now, ...doc }); if (type === 'set') imp.sets++; else imp.chapters++ }
          results.push({ file: fileName, type, status: v.status, coverage: `${v.coverage.covered}/${v.coverage.total}`, red: v.redCount, yellow: v.yellowCount, term: doc.term })
        }, (n, e) => db.collection(TOB_COLL.jobs).updateOne({ id: jobId }, { $push: { retries: { file: fileName, attempt: n, reason: String(e?.message || e) } } }))
      } catch (e) {
        await db.collection(TOB_COLL.jobs).updateOne({ id: jobId }, { $push: { errors: { file: fileName, reason: String(e?.message || e) } } })
        results.push({ file: fileName, type, status: 'error', reason: String(e?.message || e) })
      }
      await db.collection(TOB_COLL.jobs).updateOne({ id: jobId }, { $inc: { done: 1 } })
    }
    await patchJob(db, jobId, { status: 'done', imported: imp, results })
  } catch (e) { await patchJob(db, jobId, { status: 'error', fatalError: String(e?.message || e) }) }
}
