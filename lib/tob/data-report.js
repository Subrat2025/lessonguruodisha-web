// === TOB === Admin-only, READ-ONLY data report.
// Scans every place a "Teacher Observation (25 marks)" item could live and
// produces a normalised map: class · subject · set (A–J) · term · title
// language (Odia/English) · file · price · status + duplicate flags.
// With ?content=1 it also DOWNLOADS each file, normalises it (strips
// whitespace + volatile ids/versions) and HASHES the text, so it can tell
// "same content (re-import copy)" from "really different content", and compare
// Odia-title set rows against their English-title counterparts.
// NEVER writes, edits or deletes anything.
import crypto from 'node:crypto'
import { fetchAnyBytes } from '@/lib/store/storage.js'
import { configureCloudinary } from '@/lib/cloudinary.js'

const ORIYA_RE = /[\u0B00-\u0B7F]/
const LATIN_RE = /[A-Za-z]/

function titleLang(s) {
  const t = String(s || '')
  const od = ORIYA_RE.test(t), en = LATIN_RE.test(t)
  if (od && en) return 'mixed'
  if (od) return 'odia'
  if (en) return 'english'
  return 'unknown'
}

function detectSet(explicit, title) {
  const ex = String(explicit || '').trim().toUpperCase()
  if (/^[A-J]$/.test(ex)) return ex
  const m = String(title || '').match(/(?:ସେଟ୍|Set)\s*([A-J])\b/i)
  return m ? m[1].toUpperCase() : null
}

function detectTerm(explicit, title) {
  const t = String(title || '')
  // TITLE WINS over the stored term field. Check FULL YEAR first, because
  // "Term 1 & Term 2 (Full Year)" also contains the words "Term 1"/"Term 2".
  if (/term\s*1\s*(?:&|and|\+|ଓ)\s*term\s*2|full\s*year|ଟର୍ମ\s*୧\s*ଓ\s*୨|ପୂରା\s*ବର୍ଷ|ବାର୍ଷିକ/i.test(t)) return 'full'
  if (/term\s*2\b|ch(?:apter)?\.?\s*8\s*[-–—to]+\s*14|ଟର୍ମ\s*୨|ଦ୍ୱିତୀୟ\s*ସମୟ/i.test(t)) return '2'
  if (/term\s*1\b|ch(?:apter)?\.?\s*1\s*[-–—to]+\s*7|ଟର୍ମ\s*୧|ପ୍ରଥମ\s*ସମୟ/i.test(t)) return '1'
  // title said nothing → fall back to the stored term field
  if (explicit === 1 || explicit === '1') return '1'
  if (explicit === 2 || explicit === '2') return '2'
  if (explicit === 'full' || explicit === 'year') return 'full'
  return null
}

// Detect an Odia ordinal class word in a title ("ତୃତୀୟ ଶ୍ରେଣୀ" = Class 3) so a
// set row that names a DIFFERENT class than the one being cleaned can be
// quarantined instead of treated as a keeper.
const ODIA_CLASS_ORD = { 'ପ୍ରଥମ': '1', 'ଦ୍ୱିତୀୟ': '2', 'ତୃତୀୟ': '3', 'ଚତୁର୍ଥ': '4', 'ପଞ୍ଚମ': '5', 'ଷଷ୍ଠ': '6', 'ସପ୍ତମ': '7', 'ଅଷ୍ଟମ': '8' }
export function classNamedInTitle(title) {
  const t = String(title || '')
  for (const [w, n] of Object.entries(ODIA_CLASS_ORD)) {
    if (new RegExp(w + '\\s*ଶ୍ରେଣୀ').test(t)) return n
  }
  const m = t.match(/class\s*([1-8])\b/i)
  return m ? m[1] : null
}

// ch 1-7 belong to Term 1, ch 8-14 to Term 2. Returns true if term disagrees.
export function chapterTermMismatch(chapterNo, term) {
  if (chapterNo == null || !term || term === 'full') return false
  const n = Number(chapterNo)
  if (!Number.isFinite(n)) return false
  if (n >= 1 && n <= 7 && term === '2') return true
  if (n >= 8 && n <= 14 && term === '1') return true
  return false
}

function groupKey(r) {
  const chap = r.kind === 'chapter' ? (r.chapterNo ?? '?') : '-'
  return [r.class || '-', (r.subject || '-'), r.kind || '-', chap, r.set || '-', r.term || '-'].join(' | ')
}

// Strip the volatile bits (self file-id, version/epoch numbers, element ids,
// data-* attributes, comments, whitespace) so two re-imports of the SAME
// source collapse to the same hash, while real text/marks differences survive.
function normalizeHtml(s) {
  return String(s || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/lg-tob\/[a-z]+\/file_[a-z0-9]+\.html/gi, '')
    .replace(/\bfile_[a-z0-9]{4,}\b/gi, '')
    .replace(/\bv?\d{10,}\b/g, '')
    .replace(/\s(id|data-[a-z-]+)=["'][^"']*["']/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)

async function hashRef(ref, timeoutMs = 15000) {
  try {
    const buf = await Promise.race([
      fetchAnyBytes(ref),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ])
    const norm = normalizeHtml(Buffer.from(buf).toString('utf-8'))
    return { hash: sha(norm), len: norm.length }
  } catch (e) {
    return { hash: null, err: e.message || 'fetch failed' }
  }
}

export async function buildDataReport(db, { class: cls, subject, withContent = false } = {}) {
  const rows = []
  const matchCls = cls ? String(cls) : null
  const matchSubj = subject ? String(subject).toUpperCase() : null

  // ---------- 1) tobItems (FREE Teacher Observation content) ----------
  try {
    const q = { status: { $ne: 'trashed' } }
    if (matchCls) q.class = matchCls
    const items = await db.collection('tobItems').find(q).toArray()
    for (const i of items) {
      if (matchSubj && String(i.subject_id || '').toUpperCase() !== matchSubj) continue
      const title = i.title || i.fullTitle || ''
      rows.push({
        source: 'tob', collection: 'tobItems', itemId: i.id,
        class: String(i.class || ''),
        subject: i.subject_printed || i.subject_id || '',
        subjectId: i.subject_id || '',
        kind: i.type === 'set' ? 'set' : (i.type === 'chapter' ? 'chapter' : (i.type || 'item')),
        set: detectSet(i.setCode, title),
        chapterNo: i.chapterNo ?? null,
        term: detectTerm(i.term, title),
        termRaw: i.term === null || i.term === undefined ? 'null' : String(i.term),
        titleLang: titleLang(title),
        title,
        fileKey: i.htmlRef?.publicId || null,
        fileFormat: i.htmlRef?.format || 'html',
        bytes: i.htmlRef?.bytes || null,
        price: null, mrp: null, free: true,
        marks: i.marks?.total ?? null,
        status: i.status || '',
        importedAt: i.createdAt || null,
        updatedAt: i.updatedAt || null,
        _ref: i.htmlRef || null,
      })
    }
  } catch (_) {}

  // ---------- 2) storeProducts that look like Teacher Observation ----------
  try {
    const kwOr = [
      { titleOdia: /ପର୍ଯ୍ୟବେକ୍ଷଣ|ଶିକ୍ଷକ\s*ପର୍ଯ୍ୟ|ପ୍ରକଳ୍ପ\s*କାର୍ଯ୍ୟ|Task\s*&\s*Project/i },
      { titleEnglish: /Teacher\s*Observation|Task\s*&\s*Project|Observation/i },
      { type: /^tob/i },
      { tags: { $in: ['teacher-observation', 'tob', 'tob-set'] } },
    ]
    const q = { $or: kwOr }
    if (matchCls) q.classes = matchCls
    const prods = await db.collection('storeProducts').find(q).limit(5000).toArray()
    const ids = prods.map(p => p.id)
    const files = ids.length
      ? await db.collection('storeProductFiles').find({ productId: { $in: ids } }).toArray()
      : []
    const fileByProd = {}
    for (const f of files) { (fileByProd[f.productId] ||= []).push(f) }
    for (const p of prods) {
      if (matchSubj && String(p.subjectKey || p.subject || '').toUpperCase() !== matchSubj) continue
      const pf = fileByProd[p.id] || []
      const primaryFile = pf.find(f => f.kind === 'pdf') || pf[0] || null
      rows.push({
        source: 'store', collection: 'storeProducts', itemId: p.id,
        class: Array.isArray(p.classes) ? p.classes.join(',') : String(p.classes || ''),
        subject: p.subject || p.subjectKey || '',
        subjectId: (p.subjectKey || '').toUpperCase(),
        kind: p.type || 'product',
        set: detectSet(p.setCode, p.titleOdia || p.titleEnglish),
        chapterNo: p.unitTest?.chapterNo ?? null,
        term: detectTerm(p.term, p.titleOdia || p.titleEnglish),
        termRaw: p.term === null || p.term === undefined ? 'null' : String(p.term),
        titleLang: 'mixed',
        title: p.titleOdia || '',
        titleEnglish: p.titleEnglish || '',
        fileKey: primaryFile?.fileRef?.publicId || null,
        fileFormat: primaryFile?.fileRef?.format || null,
        fileCount: pf.length,
        bytes: primaryFile?.bytes || null,
        price: p.priceInr ?? null, mrp: p.mrpInr ?? null, free: false,
        status: p.status || '',
        slug: p.slug || '',
        importedAt: p.createdAt || null,
        updatedAt: p.updatedAt || null,
        _ref: primaryFile?.fileRef || null,
      })
    }
  } catch (_) {}

  // ---------- 3) assess_documents (no content hashing — different store) ----
  try {
    const q = { doc_type: /observation|Task|Project|ପର୍ଯ୍ୟବେକ୍ଷଣ|ପ୍ରକଳ୍ପ/i }
    if (matchCls) q.class = new RegExp(matchCls)
    const docs = await db.collection('assess_documents').find(q).limit(5000).toArray()
    for (const ddoc of docs) {
      rows.push({
        source: 'assess', collection: 'assess_documents', itemId: ddoc.id,
        class: String(ddoc.class || ''), subject: ddoc.subject || '', subjectId: '',
        kind: ddoc.doc_type || 'doc', set: ddoc.set_b ? 'B' : 'A',
        term: detectTerm(null, ddoc.title_or), termRaw: 'n/a',
        titleLang: titleLang(ddoc.title_or), title: ddoc.title_or || ddoc.file_name || '',
        fileKey: ddoc.file_name || ddoc.id, fileFormat: 'pdf', bytes: ddoc.bytes || null,
        price: null, mrp: null, free: false, status: ddoc.release_at ? 'scheduled' : 'live',
        importedAt: ddoc.created_at || null, updatedAt: ddoc.updated_at || null, _ref: null,
      })
    }
  } catch (_) {}

  // ---------- OPTIONAL: download + hash the file text ----------
  let contentNote = null
  if (withContent) {
    try { configureCloudinary() } catch (_) {}
    const CAP = 300, BUDGET_MS = 45000, CHUNK = 6
    const t0 = Date.now()
    const toHash = rows.filter(r => r._ref).slice(0, CAP)
    let done = 0, skipped = rows.filter(r => r._ref).length - toHash.length
    for (let i = 0; i < toHash.length; i += CHUNK) {
      if (Date.now() - t0 > BUDGET_MS) { skipped += toHash.length - done; break }
      const chunk = toHash.slice(i, i + CHUNK)
      await Promise.all(chunk.map(async (r) => {
        const { hash, len, err } = await hashRef(r._ref)
        r.contentHash = hash; r.contentLen = len ?? null; if (err) r.contentErr = err
        done++
      }))
    }
    contentNote = { hashed: done, skipped, note: skipped ? 'Some files not hashed (cap/budget). Narrow by class+subject and re-run.' : 'All files hashed.' }
  }

  rows.forEach(r => { delete r._ref })

  // ---------- grouping + duplicate analysis ----------
  const groupsMap = {}
  for (const r of rows) {
    const k = groupKey(r)
    ;(groupsMap[k] ||= { key: k, class: r.class, subject: r.subject, kind: r.kind, set: r.set, term: r.term, items: [] }).items.push(r)
  }
  const groups = Object.values(groupsMap).map(g => {
    const fileKeys = g.items.map(i => i.fileKey).filter(Boolean)
    const uniqFiles = [...new Set(fileKeys)]
    let dupFlag = 'unique'
    if (g.items.length > 1) {
      if (uniqFiles.length <= 1 && fileKeys.length > 1) dupFlag = 'duplicate_same_file'
      else if (uniqFiles.length > 1) dupFlag = 'different_files'
      else dupFlag = 'multiple_no_file'
    }
    // content-based verdict (only when hashed)
    const hashed = g.items.map(i => i.contentHash).filter(Boolean)
    const uniqHash = [...new Set(hashed)]
    let contentFlag = null
    if (withContent) {
      if (hashed.length >= 2) contentFlag = uniqHash.length === 1 ? 'same_content' : 'really_different'
      else if (hashed.length === 1) contentFlag = 'single'
      else contentFlag = 'not_hashed'
      // PER-ROW label: for each item, is it unique or a copy of an earlier file?
      const byHash = {}
      for (const it of g.items) { if (it.contentHash) (byHash[it.contentHash] ||= []).push(it) }
      for (const it of g.items) {
        if (!it.contentHash) { it.rowLabel = 'not_hashed'; continue }
        const peers = (byHash[it.contentHash] || []).slice()
          .sort((a, b) => new Date(a.importedAt || 0) - new Date(b.importedAt || 0))
        if (peers.length <= 1) { it.rowLabel = 'unique'; it.copyOf = null }
        else {
          const original = peers[0] // earliest import with this content
          if (it === original) { it.rowLabel = 'original'; it.copyOf = null }
          else { it.rowLabel = 'copy'; it.copyOf = original.fileKey ? String(original.fileKey).split('/').pop() : original.itemId }
        }
      }
    }
    return { ...g, count: g.items.length, uniqueFiles: uniqFiles.length, dupFlag, contentFlag, uniqueContent: uniqHash.length }
  }).sort((a, b) => a.key.localeCompare(b.key))

  // ---------- chapters that appear in BOTH Term 1 and Term 2 (possible wrong term)
  const chapTerms = {}
  for (const r of rows) {
    if (r.kind !== 'chapter' || r.chapterNo == null || !r.term) continue
    const k = `${r.class}|${r.subject}|${r.chapterNo}`
    ;(chapTerms[k] ||= new Set()).add(r.term)
  }
  const chaptersInBothTerms = Object.entries(chapTerms)
    .filter(([, terms]) => terms.has('1') && terms.has('2'))
    .map(([k]) => k)
  const bothSet = new Set(chaptersInBothTerms)
  for (const g of groups) {
    if (g.kind === 'chapter' && g.items[0] && bothSet.has(`${g.class}|${g.subject}|${g.items[0].chapterNo}`)) {
      g.bothTerms = true
    }
  }

  // ---------- cross-language SET comparison (Odia title vs English title) ----
  let crossLang = []
  if (withContent) {
    const setRows = rows.filter(r => r.kind === 'set' && r.set)
    const buckets = {}
    for (const r of setRows) { (buckets[`${r.class}|${r.set}`] ||= []).push(r) }
    for (const [bk, items] of Object.entries(buckets)) {
      const [cl, sc] = bk.split('|')
      const odia = items.filter(i => i.titleLang === 'odia' || i.titleLang === 'mixed')
      const eng = items.filter(i => i.titleLang === 'english')
      if (!odia.length || !eng.length) continue
      for (const o of odia) for (const e of eng) {
        crossLang.push({
          class: cl, set: sc,
          odiaTitle: o.title, odiaTerm: o.term, odiaHash: o.contentHash || null, odiaImportedAt: o.importedAt,
          engTitle: e.titleEnglish || e.title, engTerm: e.term, engHash: e.contentHash || null, engImportedAt: e.importedAt,
          verdict: (o.contentHash && e.contentHash) ? (o.contentHash === e.contentHash ? 'same_content' : 'really_different') : 'not_hashed',
        })
      }
    }
    crossLang.sort((a, b) => (a.class + a.set).localeCompare(b.class + b.set))
  }

  const summary = {
    totalRows: rows.length,
    bySource: rows.reduce((m, r) => { m[r.source] = (m[r.source] || 0) + 1; return m }, {}),
    groups: groups.length,
    duplicateSameFile: groups.filter(g => g.dupFlag === 'duplicate_same_file').length,
    differentFiles: groups.filter(g => g.dupFlag === 'different_files').length,
    sameContentGroups: withContent ? groups.filter(g => g.contentFlag === 'same_content').length : null,
    reallyDifferentGroups: withContent ? groups.filter(g => g.contentFlag === 'really_different').length : null,
    chaptersInBothTerms: chaptersInBothTerms.length,
    classes: [...new Set(rows.map(r => r.class).filter(Boolean))].sort(),
    subjects: [...new Set(rows.map(r => r.subject).filter(Boolean))].sort(),
    content: contentNote,
  }

  return { summary, groups, rows, crossLang }
}
