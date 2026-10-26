// === TOB === One-ZIP importer (new template). ONE zip = ONE class + ONE subject.
// manifest.csv is the SOURCE OF TRUTH for type/class/subject/term/chapter/set.
// If a row is missing in the manifest we fall back to: folder name → <meta term>.
// We NEVER guess term/type from the title text. HTML only (PDFs ignored silently).
import AdmZip from 'adm-zip'
import { v4 as uuidv4 } from 'uuid'
import {
  parseChapterPack, parseSet, parseRegister, classifyFile,
  termFromFolder, termFromMeta, subjectCodeToId, subjectPrinted,
  isKnownSubjectCode, VALID_SUBJECT_CODES,
} from '@/lib/tob/parse.js'
import { validateItem } from '@/lib/tob/validate.js'
import { TOB_COLL } from '@/lib/tob/store.js'
import * as LoMaster from '@/lib/lomaster/store.js'
import { storeRawFile } from '@/lib/store/storage.js'
import { configureCloudinary } from '@/lib/cloudinary.js'

const base = (p) => String(p).split('/').pop()
// relative path inside the class folder, lowercased: "term1_chapters/ch01.html"
const relPath = (entryName) => {
  const parts = String(entryName).split('/').filter(Boolean)
  return (parts.length > 1 ? parts.slice(1).join('/') : parts.join('/')).toLowerCase()
}
const normTerm = (t) => {
  const v = String(t ?? '').toUpperCase().replace('T', '').trim()
  if (v === '1') return '1'; if (v === '2') return '2'
  if (v === 'FULL' || v === 'YEAR' || v === 'FULLYEAR') return 'full'
  return null
}
// Stored term shape used in the DB: register = 'full', chapter = Number (1/2),
// set = 'full' or Number. Mirror this exactly when checking for duplicates so a
// string '1' coming from the preview matches a stored Number 1, and so T1/T2/FULL
// sets stay DISTINCT items instead of overwriting each other.
const storedTerm = (type, term) => {
  const t = normTerm(term)
  if (type === 'register') return 'full'
  if (type === 'set') return t === 'full' ? 'full' : (t ? Number(t) : null)
  return t === 'full' ? 1 : (t ? Number(t) : null)   // chapter
}

// --- tiny CSV parser (handles quotes + commas inside quotes + BOM) ---
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQ = false
  const s = String(text || '').replace(/^\uFEFF/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.length && r.some(x => String(x).trim() !== ''))
}
function readManifest(zip) {
  const e = zip.getEntries().find(x => !x.isDirectory && /(^|\/)manifest\.csv$/i.test(x.entryName))
  if (!e) return null
  const rows = parseCsv(e.getData().toString('utf-8'))
  if (!rows.length) return null
  const header = rows[0].map(h => String(h).trim().toLowerCase())
  const idx = (k) => header.indexOf(k)
  const out = new Map()
  const meta = {}
  for (const r of rows.slice(1)) {
    const get = (k) => { const i = idx(k); return i >= 0 ? String(r[i] ?? '').trim() : '' }
    const file = get('file'); if (!file) continue
    const rec = { file, type: get('type').toLowerCase(), class: get('class'), subject: get('subject'), term: get('term'), chapter_no: get('chapter_no'), set: get('set'), title: get('title') }
    out.set(file.toLowerCase(), rec)
    if (!meta.class && rec.class) meta.class = rec.class
    if (!meta.subject && rec.subject) meta.subject = rec.subject
  }
  return { rows: out, meta }
}

// Derive class/subject if the manifest is missing: from the top folder name.
function metaFromFolder(zip) {
  const first = zip.getEntries().find(e => e.entryName.includes('/'))
  const top = first ? first.entryName.split('/')[0] : ''
  const cm = top.match(/Class\s*(\d+)/i)
  const sm = top.match(/Class\s*\d+[_\-\s]+([A-Za-z]+)/)
  return { class: cm ? cm[1] : '', subject: sm ? sm[1] : '' }
}

async function buildRow(db, { html, entryName, man, codeMap, masterTotal, cls, subject_id }) {
  const fileName = base(entryName)
  const folder = relPath(entryName).split('/')[0] || ''
  // type: manifest → folder/name
  let type = man?.type || classifyFile(fileName.toLowerCase(), folder)
  if (!['chapter', 'set', 'register'].includes(type)) type = classifyFile(fileName.toLowerCase(), folder)
  // term: manifest → folder → meta
  let term = normTerm(man?.term) || termFromFolder(folder, man?.chapter_no) || termFromMeta(html)
  // chapter/set codes: manifest → filename
  let chapterNo = man?.chapter_no ? Number(man.chapter_no) : (fileName.match(/Ch0*(\d+)/i) ? Number(RegExp.$1) : null)
  let setCode = man?.set ? String(man.set).toUpperCase() : (fileName.match(/Set[_\s]?([A-Za-z])/i) ? RegExp.$1.toUpperCase() : null)

  let title = man?.title || '', cov = { covered: 0, total: masterTotal }, cards = 0, status = 'green', redCount = 0, yellowCount = 0, checks = []
  try {
    if (type === 'register') {
      const parsed = parseRegister(html, { filename: fileName })
      title = title || parsed.title; cards = (parsed.forms || []).length
      status = 'green'
    } else {
      const parsed = type === 'set' ? parseSet(html, { filename: fileName }) : parseChapterPack(html, { filename: fileName, folder })
      const v = validateItem(parsed, { codeMap, class: cls, subject_id, masterTotal })
      cov = v.coverage || cov
      cards = (v.correctedCards || []).length || ((parsed.partACount || 0) + (parsed.partBCount || 0))
      title = title || parsed.title || ''
      status = v.status; redCount = v.redCount; yellowCount = v.yellowCount; checks = v.checks
      if (type === 'chapter' && chapterNo == null) chapterNo = parsed.chapterNo || null
      if (type === 'set' && !setCode) setCode = parsed.setCode || null
    }
  } catch (e) { status = 'red'; checks = [{ level: 'red', code: 'PARSE', message: String(e?.message || e) }]; redCount = 1 }

  if (type === 'set' && !term) term = 'full'
  if (type === 'chapter' && !term && chapterNo != null) term = Number(chapterNo) >= 8 ? '2' : '1'
  if (type === 'register' && !term) term = 'full'

  // One-line human reason for the preview: the first RED (else first YELLOW) note.
  const reason = (checks.find(c => c.level === 'red') || checks.find(c => c.level === 'yellow') || {}).message || ''
  return { fileName, file: relPath(entryName), type, term, chapterNo, setCode, title, cardsFound: cards, coverage: cov, status, redCount, yellowCount, checks, reason }
}

// READ-ONLY preview. Returns class/subject + one row per HTML file with the
// manifest-resolved type/term/chapter/set and a GREEN/YELLOW/RED status + dup flag.
export async function peekOneZip(db, zipBuffer) {
  const zip = new AdmZip(zipBuffer)
  const mani = readManifest(zip)
  const fm = metaFromFolder(zip)
  const clsRaw = mani?.meta?.class || fm.class || ''
  const subjRaw = mani?.meta?.subject || fm.subject || ''
  const cls = String(clsRaw)
  // Reject unknown subject codes outright — never create a subject silently (#4).
  if (!isKnownSubjectCode(subjRaw)) {
    throw new Error(`Unknown subject code "${subjRaw || '(empty)'}" in the ZIP. Valid codes are: ${VALID_SUBJECT_CODES.join(', ')}. Fix the "subject" column in manifest.csv (or the folder name) and re-upload.`)
  }
  const subject_id = subjectCodeToId(subjRaw)
  const subject_printed = subjectPrinted(subjRaw) || subjectPrinted(subject_id) || subject_id

  const codeMap = await LoMaster.codeMap(db, { class: cls, subject_id })
  const masterTotal = (await LoMaster.rowsFor(db, { class: cls, subject_id })).length
  const warnings = []
  if (!mani) warnings.push('No manifest.csv found — type/term/class/subject were derived from folder names. Please check each row.')
  if (masterTotal === 0) warnings.push(`No LO Master rows for Class ${cls} ${subject_id} — items will show as YELLOW (not RED) and can still be published. The LO badge will be hidden on the store for these items.`)

  const entries = zip.getEntries().filter(e => !e.isDirectory && /\.html?$/i.test(e.entryName))
  const CLS = cls, SUBJ = subject_id
  const rows = []
  for (const e of entries) {
    const man = mani?.rows.get(relPath(e.entryName)) || mani?.rows.get(base(e.entryName).toLowerCase())
    const html = e.getData().toString('utf-8')
    const row = await buildRow(db, { html, entryName: e.entryName, man, codeMap, masterTotal, cls: CLS, subject_id: SUBJ })
    // duplicate? — the key MUST include TERM (except register) and use the
    // canonical subject id, and MUST ignore trashed items (a replaced/trashed item
    // never blocks a re-import). Match the stored term shape exactly so T1/T2/FULL
    // stay distinct instead of overwriting one another.
    const tStored = storedTerm(row.type, row.term)
    const key = { class: CLS, subject_id: SUBJ, type: row.type, status: { $ne: 'trashed' } }
    if (row.type === 'set') { key.setCode = row.setCode; if (tStored != null) key.term = tStored }
    else if (row.type === 'chapter') { key.chapterNo = row.chapterNo; if (tStored != null) key.term = tStored }
    const existing = row.type === 'register'
      ? await db.collection(TOB_COLL.items).findOne({ class: CLS, subject_id: SUBJ, type: 'register', status: { $ne: 'trashed' } })
      : await db.collection(TOB_COLL.items).findOne(key)
    row.dup = !!existing
    row.replace = !!existing  // default: replace duplicates
    rows.push(row)
  }
  // stable order: chapters by no, sets by code, register last
  rows.sort((a, b) => {
    const rank = t => t === 'chapter' ? 0 : t === 'set' ? 1 : 2
    if (rank(a.type) !== rank(b.type)) return rank(a.type) - rank(b.type)
    if (a.type === 'chapter') return (a.chapterNo || 0) - (b.chapterNo || 0)
    if (a.type === 'set') return String(a.setCode || '').localeCompare(String(b.setCode || ''))
    return 0
  })
  const summary = {
    total: rows.length,
    green: rows.filter(r => r.status === 'green').length,
    yellow: rows.filter(r => r.status === 'yellow').length,
    red: rows.filter(r => r.status === 'red').length,
    chapters: rows.filter(r => r.type === 'chapter').length,
    sets: rows.filter(r => r.type === 'set').length,
    registers: rows.filter(r => r.type === 'register').length,
    duplicates: rows.filter(r => r.dup).length,
  }
  return { class: CLS, subject_id: SUBJ, subject_printed, hasManifest: !!mani, rows, summary, warnings }
}

// WRITE: save using the admin's (possibly edited) rows. publish=true → also
// publish GREEN+YELLOW immediately. Duplicate → old to Trash, new inserted;
// if the old was PUBLISHED and the new is GREEN/YELLOW, keep it published (#7).
export async function commitOneZip(db, { zipBuffer, class: cls, subject_id, rows = [], publish = false, me }) {
  const zip = new AdmZip(zipBuffer)
  const byRel = {}, byName = {}
  for (const e of zip.getEntries()) { if (!e.isDirectory) { byRel[relPath(e.entryName)] = e; byName[base(e.entryName).toLowerCase()] = e } }
  const CLS = String(cls)
  if (!isKnownSubjectCode(subject_id)) {
    throw new Error(`Unknown subject code "${String(subject_id || '').toUpperCase() || '(empty)'}". Valid codes are: ${VALID_SUBJECT_CODES.join(', ')}.`)
  }
  // Normalise to the canonical id so a raw manifest code (e.g. "VOC"/"ART") and
  // the canonical id ("VE"/"AE") both resolve to the same LO Master + store subject.
  const SUBJ = subjectCodeToId(subject_id)
  const codeMap = await LoMaster.codeMap(db, { class: CLS, subject_id: SUBJ })
  const masterTotal = (await LoMaster.rowsFor(db, { class: CLS, subject_id: SUBJ })).length
  const version = (await LoMaster.getActiveVersion(db))?.version || null
  const printed = subjectPrinted(SUBJ) || SUBJ
  let added = 0, replaced = 0, skipped = 0, published = 0
  const details = []

  for (const r of rows) {
    const e = byRel[String(r.file || '').toLowerCase()] || byName[String(r.fileName || '').toLowerCase()]
    const type = r.type
    const term = normTerm(r.term) ?? (type === 'register' ? 'full' : null)
    const bad = !e || !['chapter', 'set', 'register'].includes(type)
      || (type === 'set' && !r.setCode) || (type === 'chapter' && (r.chapterNo == null || r.chapterNo === '')) || (type !== 'register' && !term)
    if (bad) { skipped++; details.push({ file: r.fileName, status: 'skipped', reason: 'missing type/term/number' }); continue }
    try {
      const folder = relPath(e.entryName).split('/')[0] || ''
      const html = e.getData().toString('utf-8')
      const now = new Date()
      let htmlRef = null
      try { configureCloudinary(); htmlRef = await storeRawFile(Buffer.from(html, 'utf-8'), { folder: `lg-tob/${type}`, format: 'html', tags: ['lg-tob', type, `class-${CLS}`] }) } catch (_) {}

      let doc
      if (type === 'register') {
        const parsed = parseRegister(html, { filename: r.fileName })
        doc = { type: 'register', class: CLS, subject_id: SUBJ, subject_printed: printed, term: 'full', setCode: null, chapterNo: null,
          title: r.title || parsed.title || 'ରେକର୍ଡ ପୁସ୍ତିକା', fullTitle: parsed.title || '', forms: parsed.forms,
          validation: { status: 'green', redCount: 0, yellowCount: 0, checks: [] }, coverage: { covered: 0, total: 0 },
          status: 'draft', htmlRef, order: 999, loMasterVersion: version, updatedAt: now, importSource: 'onezip' }
      } else {
        const parsed = type === 'set' ? parseSet(html, { filename: r.fileName }) : parseChapterPack(html, { filename: r.fileName, folder })
        const v = validateItem(parsed, { codeMap, class: CLS, subject_id: SUBJ, masterTotal })
        const setCode = type === 'set' ? String(r.setCode).toUpperCase() : null
        const chapterNo = type === 'chapter' ? Number(r.chapterNo) : null
        doc = { type, class: CLS, subject_id: SUBJ, subject_printed: printed, stage: v.stage,
          term: term === 'full' ? (type === 'set' ? 'full' : 1) : Number(term), setCode, chapterNo,
          title: r.title || parsed.title || '', fullTitle: parsed.fullTitle || parsed.title || '',
          cards: v.correctedCards, partACount: parsed.partACount, partBCount: parsed.partBCount,
          marks: parsed.marks, weightage: parsed.marks?.weightage, coverage: v.coverage,
          validation: { status: v.status, redCount: v.redCount, yellowCount: v.yellowCount, checks: v.checks },
          status: 'draft', htmlRef, order: chapterNo || String(setCode || '').charCodeAt(0) || 0,
          loMasterVersion: version, updatedAt: now, importSource: 'onezip' }
      }

      // duplicate lookup
      const dupKey = type === 'register'
        ? { class: CLS, subject_id: SUBJ, type: 'register', status: { $ne: 'trashed' } }
        : { class: CLS, subject_id: SUBJ, type, status: { $ne: 'trashed' }, ...(type === 'set' ? { setCode: doc.setCode, term: doc.term } : { chapterNo: doc.chapterNo, term: doc.term }) }
      const existing = await db.collection(TOB_COLL.items).findOne(dupKey)

      const st = doc.validation.status
      const canPublish = st === 'green' || st === 'yellow' || type === 'register'
      // #7: keep published if replacing a previously-published item with GREEN/YELLOW
      let finalStatus = 'draft'
      if (existing && existing.status === 'published' && canPublish) finalStatus = 'published'
      if (publish && canPublish) finalStatus = 'published'
      doc.status = finalStatus

      if (existing) {
        if (r.replace === false) { skipped++; details.push({ file: r.fileName, status: 'skipped', reason: 'exists, kept' }); continue }
        await db.collection(TOB_COLL.items).updateOne({ id: existing.id }, { $set: { status: 'trashed', trashedAt: now, prevStatus: existing.status, trashedBy: me?.id || null } })
        await db.collection(TOB_COLL.items).insertOne({ id: uuidv4(), createdAt: now, ...doc })
        replaced++; details.push({ file: r.fileName, status: 'replaced', published: finalStatus === 'published' })
      } else {
        await db.collection(TOB_COLL.items).insertOne({ id: uuidv4(), createdAt: now, ...doc })
        added++; details.push({ file: r.fileName, status: 'added', published: finalStatus === 'published' })
      }
      if (finalStatus === 'published') published++
    } catch (ex) { skipped++; details.push({ file: r.fileName, status: 'error', reason: String(ex?.message || ex) }) }
  }
  return { added, replaced, skipped, published, details }
}
