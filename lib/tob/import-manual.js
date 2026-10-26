// === TOB === Manual importer. Class+Subject chosen ONCE for the whole ZIP.
// Metadata (type / set letter / chapter no. / term) comes from the ADMIN's
// edited preview table — NEVER guessed from titles. We still PARSE each file's
// CONTENT to build the task/project cards + LO coverage (so the teacher page +
// sample render correctly). Nothing is written until commit. On a duplicate
// (same class+subject+type+set/chapter+term) the old item goes to Trash.
import AdmZip from 'adm-zip'
import { v4 as uuidv4 } from 'uuid'
import { parseChapterPack, parseSet, classifyFile } from '@/lib/tob/parse.js'
import { validateItem } from '@/lib/tob/validate.js'
import { TOB_COLL } from '@/lib/tob/store.js'
import * as LoMaster from '@/lib/lomaster/store.js'
import { storeRawFile } from '@/lib/store/storage.js'
import { configureCloudinary } from '@/lib/cloudinary.js'

const base = (p) => String(p).split('/').pop()
function normTerm(t) {
  if (t === 1 || t === '1') return '1'
  if (t === 2 || t === '2') return '2'
  if (t === 'full' || t === 'year' || /full\s*year/i.test(String(t))) return 'full'
  return null
}
function parseOne(html, { type, fileName, folder }) {
  return type === 'set' ? parseSet(html, { filename: fileName }) : parseChapterPack(html, { filename: fileName, folder })
}

// READ-ONLY: build suggestions, one row per HTML file. Every value is a
// suggestion; the admin can override it. `confident:false` → UI blocks Save.
export async function peekManual(db, zipBuffer, { class: cls, subject_id }) {
  const zip = new AdmZip(zipBuffer)
  const entries = zip.getEntries().filter(e => !e.isDirectory && /\.html?$/i.test(e.entryName))
  const codeMap = await LoMaster.codeMap(db, { class: cls, subject_id })
  const masterTotal = (await LoMaster.rowsFor(db, { class: cls, subject_id })).length
  const rows = []
  for (const e of entries) {
    const fileName = base(e.entryName)
    const folder = e.entryName.includes('/') ? e.entryName.split('/')[0].toLowerCase() : ''
    const html = e.getData().toString('utf-8')
    const sug = classifyFile(fileName.toLowerCase(), folder)
    const type = (sug === 'set' || sug === 'chapter') ? sug : ''
    let cov = { covered: 0, total: masterTotal }, cards = 0, title = '', term = null, setCode = null, chapterNo = null
    try {
      const parsed = parseOne(html, { type: type || 'set', fileName, folder })
      const v = validateItem(parsed, { codeMap, class: cls, subject_id, masterTotal })
      cov = v.coverage || cov
      cards = (v.correctedCards || []).length || ((parsed.partACount || 0) + (parsed.partBCount || 0))
      title = parsed.title || ''
      term = normTerm(parsed.term)
      setCode = parsed.setCode || null
      chapterNo = parsed.chapterNo ?? null
    } catch (_) {}
    const confident = !!type && (type === 'set' ? !!setCode : chapterNo != null) && !!term
    rows.push({ fileName, type, setCode, chapterNo, term, title, cardsFound: cards, coverage: cov, confident })
  }
  return { rows, class: String(cls), subject_id: String(subject_id).toUpperCase(), total: entries.length }
}

// WRITE: save using the admin's edited rows. Duplicate → old to Trash, new saved.
export async function commitManual(db, { zipBuffer, class: cls, subject_id, rows = [], me }) {
  const zip = new AdmZip(zipBuffer)
  const byName = {}
  for (const e of zip.getEntries()) { if (!e.isDirectory) byName[base(e.entryName)] = e }
  const codeMap = await LoMaster.codeMap(db, { class: cls, subject_id })
  const masterTotal = (await LoMaster.rowsFor(db, { class: cls, subject_id })).length
  const version = (await LoMaster.getActiveVersion(db))?.version || null
  const CLS = String(cls), SUBJ = String(subject_id).toUpperCase()
  let added = 0, replaced = 0, skipped = 0
  const details = []
  for (const r of rows) {
    const e = byName[r.fileName]
    const type = r.type
    const term = normTerm(r.term)
    const bad = !e || (type !== 'set' && type !== 'chapter') || !term || (type === 'set' && !r.setCode) || (type === 'chapter' && (r.chapterNo == null || r.chapterNo === ''))
    if (bad) { skipped++; details.push({ file: r.fileName, status: 'skipped', reason: 'missing metadata' }); continue }
    try {
      const folder = e.entryName.includes('/') ? e.entryName.split('/')[0].toLowerCase() : ''
      const html = e.getData().toString('utf-8')
      const parsed = parseOne(html, { type, fileName: r.fileName, folder })
      const v = validateItem(parsed, { codeMap, class: cls, subject_id, masterTotal })
      const setCode = type === 'set' ? String(r.setCode).toUpperCase() : null
      const chapterNo = type === 'chapter' ? Number(r.chapterNo) : null
      const key = { class: CLS, subject_id: SUBJ, type, term, ...(type === 'set' ? { setCode } : { chapterNo }) }
      const existing = await db.collection(TOB_COLL.items).findOne({ ...key, status: { $ne: 'trashed' } })
      let htmlRef = null
      try { configureCloudinary(); htmlRef = await storeRawFile(Buffer.from(html, 'utf-8'), { folder: `lg-tob/${type}`, format: 'html', tags: ['lg-tob', type, `class-${CLS}`] }) } catch (_) {}
      const now = new Date()
      const doc = {
        type, class: CLS, subject_id: SUBJ, subject_printed: parsed.subject_printed || '', stage: v.stage,
        term, setCode, chapterNo, title: parsed.title || '', fullTitle: parsed.fullTitle || parsed.title || '',
        cards: v.correctedCards, partACount: parsed.partACount, partBCount: parsed.partBCount,
        marks: parsed.marks, weightage: parsed.marks?.weightage, coverage: v.coverage,
        validation: { status: v.status, redCount: v.redCount, yellowCount: v.yellowCount, checks: v.checks },
        status: 'draft', htmlRef, order: chapterNo || String(setCode || '').charCodeAt(0) || 0,
        loMasterVersion: version, updatedAt: now, importSource: 'manual',
      }
      if (existing) {
        if (r.replace === false) { skipped++; details.push({ file: r.fileName, status: 'skipped', reason: 'exists, kept' }); continue }
        await db.collection(TOB_COLL.items).updateOne({ id: existing.id }, { $set: { status: 'trashed', trashedAt: now, prevStatus: existing.status, trashedBy: me?.id || null } })
        await db.collection(TOB_COLL.items).insertOne({ id: uuidv4(), createdAt: now, ...doc })
        replaced++; details.push({ file: r.fileName, status: 'replaced' })
      } else {
        await db.collection(TOB_COLL.items).insertOne({ id: uuidv4(), createdAt: now, ...doc })
        added++; details.push({ file: r.fileName, status: 'added' })
      }
    } catch (ex) { skipped++; details.push({ file: r.fileName, status: 'error', reason: String(ex?.message || ex) }) }
  }
  return { added, replaced, skipped, details }
}
