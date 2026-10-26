// === STORE · UNIT TESTS === bulk zip import engine (NEW, additive only).
// Writes ONLY to store* collections + a new storeImportJobs / storeUnitSubjects.
// Reuses existing private Cloudinary storage + blurred-preview helpers.
import { v4 as uuidv4 } from 'uuid'
import AdmZip from 'adm-zip'
import { v2 as cloudinary } from 'cloudinary'
import { cloudinaryEnabled } from '@/lib/cloudinary.js'
import { STORE_COLL, STORE_MAX_FILE_BYTES } from '@/lib/store/security.js'
import * as StoreStorage from '@/lib/store/storage.js'
import { ensureUniqueSlug, effectivePrice } from '@/lib/store/catalog.js'
import { generateBlurredPreview } from '@/lib/answer-key-preview.js'
import { fetchBuffer } from '@/lib/answer-key.js'
import { sendWhatsApp } from '@/lib/ultramsg.js'

// Admin alert WhatsApp number for import/split failures (Phase C · Addition 1).
export const ADMIN_ALERT_WHATSAPP = '8093414633'
// Fixed catalogue reference (admin-editable via settings 'store_sets_reference').
export const REF_CHAPTERS = { 1: 16, 2: 37, 3: 84, 4: 75, 5: 77, 6: 138, 7: 86 }
export const REF_SETS_TOTAL = 2563
export async function getReference(db) {
  const doc = await db.collection('settings').findOne({ key: 'store_sets_reference' })
  return { chapters: { ...REF_CHAPTERS, ...(doc?.value?.chapters || {}) }, setsTotal: doc?.value?.setsTotal || REF_SETS_TOTAL }
}
// In-process zip cache so "Resume" / "Retry failed only" can re-run without a re-upload.
const ZIP_CACHE = new Map() // jobId -> { buffer, className, mode, adminId, at }
export function cacheZip(jobId, data) { ZIP_CACHE.set(jobId, { ...data, at: Date.now() }); if (ZIP_CACHE.size > 8) { const oldest = [...ZIP_CACHE.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (oldest) ZIP_CACHE.delete(oldest[0]) } }
export function getCachedZip(jobId) { return ZIP_CACHE.get(jobId) || null }

// Retry a flaky async op up to 3 times with 5s / 15s / 30s backoff.
const RETRY_DELAYS = [5000, 15000, 30000]
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

// Send one WhatsApp + in-app admin alert when a job ends with failures.
// Send one WhatsApp + in-app admin alert when a job ends with failures.
export async function notifyCoverFailures(db, jobId, failedCount) {
  if (!failedCount) return
  try { await sendWhatsApp({ to: ADMIN_ALERT_WHATSAPP, body: `⚠️ LessonGuru Covers: ${failedCount} ଟି କଭର୍ ବିଫଳ ହେଲା — report ଦେଖନ୍ତୁ (job ${String(jobId).slice(0, 8)})` }) } catch (_) {}
  try { await db.collection('adminNotifications').insertOne({ id: uuidv4(), type: 'store_cover_failure', jobId, failedCount, message: `Covers: ${failedCount} failed — see report`, read: false, createdAt: new Date() }) } catch (_) {}
}
async function alertFailures(db, { kind, jobId, failedCount, className }) {
  if (!failedCount) return
  const msg = `⚠️ LessonGuru ${kind}: ${failedCount} ଟି ଫାଇଲ୍ ବିଫଳ ହେଲା${className ? ` (ଶ୍ରେଣୀ ${className})` : ''} — report ଦେଖନ୍ତୁ (job ${String(jobId).slice(0, 8)})`
  try { await sendWhatsApp({ to: ADMIN_ALERT_WHATSAPP, body: msg }) } catch (_) {}
  try { await db.collection('adminNotifications').insertOne({ id: uuidv4(), type: 'store_import_failure', kind, jobId, failedCount, className: className || null, message: `Import: ${failedCount} files failed — see report`, read: false, createdAt: new Date() }) } catch (_) {}
}

export const UT = {
  type: 'unit_test',
  packType: 'unit_test_pack',
  jobs: 'storeImportJobs',
  subjects: 'storeUnitSubjects',
  catSlug: 'unit-tests',
}
const ASSESSMENTS_PER_FILE = 5
const FULL_MARKS = 25
const DEFAULT_PRICE = 10   // ₹ per chapterwise test — matches Class 6/7 (was wrongly 2 for Class 8)
const DEFAULT_MRP = 25
// A pack must never be cheaper than this per chapter; admin sees a warning below it.
export const MIN_PACK_PRICE_PER_CHAPTER = 5

// ---------------- helpers ----------------
const OD = '୦୧୨୩୪୫୬୭୮୯'
export function toOdiaNum(n) { return String(n).replace(/[0-9]/g, (d) => OD[+d]) }

export function detectScript(str = '', subjectKey = '') {
  const s = String(str)
  if (/[\u0B00-\u0B7F]/.test(s)) return 'odia'            // Odia block
  if (/[\u0900-\u097F]/.test(s)) return subjectKey === 'sanskrit' ? 'sanskrit' : 'hindi' // Devanagari
  if (subjectKey === 'sanskrit') return 'sanskrit'
  if (subjectKey === 'hindi') return 'hindi'
  if (subjectKey === 'english') return 'english'
  return 'odia'
}

// Parse a subject folder like "Math (ଗଣିତ)" or "English (Pallavi)" → {key, nameEnglish, nameOdia}
// Patterns match Class 8 folder names too (jasmin, jigyasa, samajika bigyana, kaousal badho, kruti, mil ...).
const SUBJECT_KEY_MAP = [
  [/math|ଗଣିତ|गणित/i, 'math'],
  [/samajika|social|ସାମାଜିକ/i, 'social'],
  [/jigyasa|science|ଜିଜ୍ଞାସା|ବିଜ୍ଞାନ/i, 'science'],
  [/sanskrit|ସଂସ୍କୃତ|संस्कृत/i, 'sanskrit'],
  [/jasmin|english|pallavi/i, 'english'],
  [/\bmil\b/i, 'mil'],
  [/hindi|ହିନ୍ଦୀ/i, 'hindi'],
  [/evs|ପୃଥିବୀ|ବିଶ୍ୱ/i, 'evs'],
  [/indradhanu|ଇନ୍ଦ୍ରଧନୁ/i, 'indradhanu'],
  [/nabarasa|ନବରସ/i, 'nabarasa'],
  [/khela|sports|ଖେଳ/i, 'sports'],
  [/kruti|\bart\b|କଳାକୁଞ୍ଜ|କଳା/i, 'art'],
  [/kaousal|kaushal|କୌଶଳ/i, 'kaushal'],
  [/sahitya|surabhi|odia|ଓଡ଼ିଆ|ସାହିତ୍ୟ/i, 'odia'],
]
const SUBJECT_STYLE = {
  math: { color: '#2563eb', icon: '🔢' }, odia: { color: '#e8452c', icon: '📖' },
  mil: { color: '#c2410c', icon: '📖' },
  english: { color: '#7c3aed', icon: '🔤' }, evs: { color: '#059669', icon: '🌍' },
  science: { color: '#0891b2', icon: '🔬' }, social: { color: '#d97706', icon: '🗺️' },
  hindi: { color: '#db2777', icon: '📝' }, sanskrit: { color: '#9333ea', icon: '🕉️' },
  indradhanu: { color: '#ef4444', icon: '🌈' }, nabarasa: { color: '#f59e0b', icon: '🎭' },
  sports: { color: '#16a34a', icon: '⚽' }, art: { color: '#db2777', icon: '🎨' },
  kaushal: { color: '#0d9488', icon: '🛠️' },
}
// Display names for known subject keys (English, Odia).
const SUBJECT_DISPLAY = {
  math: ['Math', 'ଗଣିତ'], odia: ['Odia', 'ଓଡ଼ିଆ'], mil: ['Odia (MIL)', 'ଓଡ଼ିଆ (MIL)'],
  english: ['English', 'ଇଂରାଜୀ'], science: ['Science', 'ବିଜ୍ଞାନ'], social: ['Social Science', 'ସାମାଜିକ ବିଜ୍ଞାନ'],
  sanskrit: ['Sanskrit', 'ସଂସ୍କୃତ'], hindi: ['Hindi', 'ହିନ୍ଦୀ'], sports: ['Sports', 'ଖେଳ ଶିକ୍ଷା'],
  art: ['Art', 'କଳା'], kaushal: ['Vocational / Skill', 'କୌଶଳ'], evs: ['EVS', 'ପରିବେଶ'],
  indradhanu: ['Indradhanu', 'ଇନ୍ଦ୍ରଧନୁ'], nabarasa: ['Nabarasa', 'ନବରସ'],
}
export function parseSubjectFolder(folder) {
  const raw = String(folder || '').trim()
  const m = raw.match(/^(.*?)\s*\((.+)\)\s*$/)
  let key = null
  for (const [rx, k] of SUBJECT_KEY_MAP) { if (rx.test(raw)) { key = k; break } }
  if (key && SUBJECT_DISPLAY[key]) {
    const [en, od] = SUBJECT_DISPLAY[key]
    return { key, nameEnglish: en, nameOdia: od, style: SUBJECT_STYLE[key] || { color: '#241a5e', icon: '📚' } }
  }
  // Unknown folder → keep it as its OWN subject (NEVER collapse many folders into one shared 'other').
  const nameEnglish = (m ? m[1] : raw).trim() || raw
  const inParen = m ? m[2].trim() : ''
  const nameOdia = /[\u0B00-\u0B7F]/.test(inParen) ? inParen : (/[\u0B00-\u0B7F]/.test(nameEnglish) ? nameEnglish : inParen || nameEnglish)
  const slug = raw.toLowerCase().replace(/[^a-z0-9\u0B00-\u0B7F]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  const uniqueKey = 'sub-' + (slug || 'other')
  return { key: uniqueKey, nameEnglish, nameOdia, style: { color: '#241a5e', icon: '📚' } }
}

// ---------------- scan (preview before import) ----------------
const SCAN_CACHE = new Map() // scanId -> { buffer, at }
export function cacheScan(id, buffer) { SCAN_CACHE.set(id, { buffer, at: Date.now() }); if (SCAN_CACHE.size > 8) { const o = [...SCAN_CACHE.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (o) SCAN_CACHE.delete(o[0]) } }
export function getScan(id) { return SCAN_CACHE.get(id) || null }

// Detect class from a zip/file name. Accepts Balvatika / BV and numbers 1–10.
export function detectClassName(name = '') {
  if (/balvatika|bal[-_\s]*vatika|\bbv\b/i.test(name)) return 'BV'
  const m = String(name).match(/class[-_\s]*(10|[1-9])/i) || String(name).match(/\b(10|[1-9])\b/)
  return m ? m[1] : ''
}

// Inspect a zip WITHOUT importing: per subject folder → files + suggested catalog subject.
export function scanZip(zipBuffer) {
  const zip = new AdmZip(zipBuffer)
  const all = zip.getEntries()
  const junk = (n) => /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/i.test(n)
  const pdfs = all.filter(e => !e.isDirectory && /\.pdf$/i.test(e.entryName) && !junk(e.entryName))
  const skipped = all.filter(e => !e.isDirectory && !/\.pdf$/i.test(e.entryName) && !junk(e.entryName))
    .map(e => ({ name: e.entryName.split('/').filter(Boolean).pop(), reason: 'not a .pdf file' }))
  const byFolder = {}
  for (const e of pdfs) {
    const parts = e.entryName.split('/').filter(Boolean)
    const folder = parts.length >= 2 ? parts[parts.length - 2] : 'Other'
    const chapter = parts[parts.length - 1].replace(/\.pdf$/i, '').trim()
    ;(byFolder[folder] ||= []).push(chapter)
  }
  const folders = Object.entries(byFolder).map(([folder, chapters]) => {
    const s = parseSubjectFolder(folder)
    return { folder, count: chapters.length, chapters, suggestedKey: s.key, suggestedName: s.nameEnglish, suggestedNameOdia: s.nameOdia }
  }).sort((a, b) => a.folder.localeCompare(b.folder))
  return { total: pdfs.length, folders, skipped }
}

export async function ensureUnitTestCategory(db) {
  const coll = db.collection(STORE_COLL.categories)
  let cat = await coll.findOne({ slug: UT.catSlug })
  if (!cat) {
    cat = {
      id: uuidv4(), slug: UT.catSlug, nameEnglish: 'Unit Tests', nameOdia: 'ଅଧ୍ୟାୟଭିତ୍ତିକ ମୂଲ୍ୟାୟନ',
      icon: '📑', color: '#f7b32b', sortOrder: 0, active: true, createdAt: new Date(), updatedAt: new Date(),
    }
    await coll.insertOne(cat)
  }
  return cat
}

export async function ensureSubject(db, { cls, key, nameEnglish, nameOdia, style }) {
  const coll = db.collection(UT.subjects)
  let doc = await coll.findOne({ class: String(cls), subjectKey: key })
  if (doc) return doc
  const count = await coll.countDocuments({ class: String(cls) })
  doc = {
    id: uuidv4(), class: String(cls), subjectKey: key,
    nameEnglish, nameOdia, color: style.color, icon: style.icon,
    sortOrder: count, createdAt: new Date(), updatedAt: new Date(),
  }
  await coll.insertOne(doc)
  return doc
}

// Header-visible blurred preview: top 18% clear, rest heavily blurred.
// Falls back to full-page blur if region transform fails.
export async function generateHeaderPreview(fileRef) {
  try {
    if (!cloudinaryEnabled() || !fileRef?.publicId) throw new Error('no cloudinary')
    const url = cloudinary.url(fileRef.publicId, {
      resource_type: 'image', type: 'authenticated', sign_url: true, secure: true,
      format: 'jpg', page: 1, version: fileRef.version,
      transformation: [
        { width: 620, crop: 'fit' },
        { effect: 'blur_region:1800', gravity: 'south', width: '1.0', height: '0.82', flags: 'region_relative' },
        { quality: 40 },
      ],
    })
    const jpg = await fetchBuffer(url)
    const os = await import('os'); const fs = await import('fs'); const path = await import('path')
    const fp = path.join(os.tmpdir(), `utprev_${uuidv4()}.jpg`)
    fs.writeFileSync(fp, jpg)
    try {
      const res = await new Promise((resolve, reject) => cloudinary.uploader.upload(fp, {
        folder: 'lessonguru/store/unit-tests/preview', resource_type: 'image', type: 'authenticated',
        format: 'jpg', unique_filename: true, use_filename: true, overwrite: false, tags: ['lg-store', 'unit-test', 'preview'],
      }, (e, r) => e ? reject(e) : resolve(r)))
      return { publicId: res.public_id, resourceType: 'image', deliveryType: 'authenticated', version: res.version, format: 'jpg', bytes: res.bytes }
    } finally { try { fs.unlinkSync(fp) } catch (_) {} }
  } catch (_) {
    // Fallback: existing full-blur preview
    return await generateBlurredPreview(fileRef)
  }
}

// ---------------- product builders ----------------
function unitTestTitles({ cls, subj, chapterTitle }) {
  const titleOdia = `ଶ୍ରେଣୀ ${toOdiaNum(cls)} · ${subj.nameOdia} · ${chapterTitle} — ଅଧ୍ୟାୟଭିତ୍ତିକ ମୂଲ୍ୟାୟନ (${toOdiaNum(ASSESSMENTS_PER_FILE)}ଟି)`
  const titleEnglish = `Class ${cls} · ${subj.nameEnglish} · ${chapterTitle} — ${ASSESSMENTS_PER_FILE} Chapterwise Tests`
  return { titleOdia, titleEnglish }
}

async function insertUnitTestProduct(db, { cls, subj, chapterTitle, language, categoryId, fileRef, pages, bytes, fileName, previewRef, sortOrder, adminId, status }) {
  const now = new Date()
  const { titleOdia, titleEnglish } = unitTestTitles({ cls, subj, chapterTitle })
  const slug = await ensureUniqueSlug(db, `class${cls}-${subj.subjectKey}-${uuidv4().slice(0, 6)}`)
  const productId = uuidv4()
  const doc = {
    id: productId, slug, type: UT.type, categoryId,
    titleOdia, titleEnglish, shortDesc: '', fullDesc: '',
    whatsInside: [`${toOdiaNum(ASSESSMENTS_PER_FILE)}ଟି ଅଧ୍ୟାୟଭିତ୍ତିକ ପରୀକ୍ଷା`, `ପ୍ରତି ପରୀକ୍ଷା ${toOdiaNum(FULL_MARKS)} ନମ୍ବର`, 'A4 ପ୍ରିଣ୍ଟ ପାଇଁ ପ୍ରସ୍ତୁତ'],
    classes: [String(cls)], subject: subj.nameEnglish, subjectKey: subj.subjectKey, paper: '', exam: '',
    language, tags: ['unit-test', subj.subjectKey, `class-${cls}`],
    coverUrl: null, coverAuto: true, previewMode: 'blurred', previewRefs: previewRef ? [previewRef] : [],
    securityLevel: 2, watermarkStyle: 'footer', downloadLimit: 5, printAllowed: true,
    mrpInr: DEFAULT_MRP, priceInr: DEFAULT_PRICE, launchPriceInr: null, launchStart: null, launchEnd: null, premiumPriceInr: null,
    status: status || 'published', publishAt: null, visibility: 'public', featured: false, sortOrder: sortOrder || 0, maxPerUser: 1,
    bundleItems: [],
    unitTest: { class: String(cls), subjectKey: subj.subjectKey, chapterTitle, assessmentsCount: ASSESSMENTS_PER_FILE, fullMarks: FULL_MARKS, pageCount: pages },
    salesCount: 0, ratingAvg: 0, ratingCount: 0, createdAt: now, updatedAt: now, createdBy: adminId || null,
  }
  await db.collection(STORE_COLL.products).insertOne(doc)
  const fileDoc = { id: uuidv4(), productId, kind: 'pdf', name: fileName, fileRef, bytes, pages, createdAt: now }
  await db.collection(STORE_COLL.files).insertOne(fileDoc)
  return doc
}

// ---------------- packs (dynamic membership by class/subject) ----------------
function roundEndingIn9(n) { const p = Math.max(9, Math.round(n)); return Math.max(9, Math.round((p + 1) / 10) * 10 - 1) }

export async function rebuildPacks(db, cls, { adminId, publish = true } = {}) {
  const C = db.collection(STORE_COLL.products)
  const cat = await ensureUnitTestCategory(db)
  const tests = await C.find({ type: UT.type, 'unitTest.class': String(cls), status: { $ne: 'archived' } }).toArray()
  const subjects = await db.collection(UT.subjects).find({ class: String(cls) }).sort({ sortOrder: 1 }).toArray()
  const bySubj = {}
  for (const t of tests) { (bySubj[t.unitTest.subjectKey] ||= []).push(t) }

  // Subject packs
  for (const subj of subjects) {
    const list = bySubj[subj.subjectKey] || []
    if (list.length === 0) continue
    const chapters = list.length
    const separately = chapters * DEFAULT_PRICE
    const defPrice = Math.max(5, Math.round(chapters * DEFAULT_PRICE * 0.75))
    await upsertPack(db, {
      cls, cat, scope: { kind: 'subject', class: String(cls), subjectKey: subj.subjectKey },
      titleOdia: `ଶ୍ରେଣୀ ${toOdiaNum(cls)} · ${subj.nameOdia} — ସବୁ ${toOdiaNum(chapters)} ଅଧ୍ୟାୟ`,
      titleEnglish: `Class ${cls} · ${subj.nameEnglish} — All ${chapters} Chapters Pack`,
      chapters, separately, price: defPrice, mrp: separately, adminId, publish,
    })
  }
  // Class pack
  if (tests.length > 0) {
    const total = tests.length
    const separately = total * DEFAULT_PRICE
    const defPrice = roundEndingIn9(total * DEFAULT_PRICE * 0.6)
    await upsertPack(db, {
      cls, cat, scope: { kind: 'class', class: String(cls), subjectKey: null },
      titleOdia: `ଶ୍ରେଣୀ ${toOdiaNum(cls)} — ସବୁ ବିଷୟର ${toOdiaNum(total)}ଟି ଅଧ୍ୟାୟ`,
      titleEnglish: `Class ${cls} — All Subjects · ${total} Chapterwise Tests (Combo)`,
      chapters: total, separately, price: defPrice, mrp: separately, adminId, publish,
    })
  }
}

async function upsertPack(db, { cls, cat, scope, titleOdia, titleEnglish, chapters, separately, price, mrp, adminId, publish = true }) {
  const C = db.collection(STORE_COLL.products)
  const existing = await C.findOne({ type: UT.packType, 'packScope.kind': scope.kind, 'packScope.class': scope.class, 'packScope.subjectKey': scope.subjectKey })
  const now = new Date()
  const base = {
    titleOdia, titleEnglish, categoryId: cat.id, classes: [String(cls)],
    subject: scope.subjectKey || 'all', subjectKey: scope.subjectKey || 'all',
    packScope: scope, packMeta: { chapters, separately }, updatedAt: now,
  }
  if (existing) {
    const set = { ...base }
    // Respect admin price customisation
    if (!existing.priceCustomized) { set.priceInr = price; set.mrpInr = mrp }
    await C.updateOne({ id: existing.id }, { $set: set })
    return existing.id
  }
  const slug = await ensureUniqueSlug(db, `class${cls}-${scope.kind}-${scope.subjectKey || 'all'}-pack`)
  const doc = {
    id: uuidv4(), slug, type: UT.packType, ...base,
    language: 'odia', tags: ['unit-test-pack', `class-${cls}`, scope.kind],
    whatsInside: [], shortDesc: '', fullDesc: '', paper: '', exam: '',
    coverUrl: null, coverAuto: true, previewMode: 'blurred', previewRefs: [],
    securityLevel: 2, watermarkStyle: 'footer', downloadLimit: 5, printAllowed: true,
    mrpInr: mrp, priceInr: price, launchPriceInr: null, launchStart: null, launchEnd: null, premiumPriceInr: null,
    priceCustomized: false, status: publish ? 'published' : 'draft', publishAt: null, visibility: 'public',
    featured: false, sortOrder: scope.kind === 'class' ? -1 : 0, maxPerUser: 1, bundleItems: [],
    salesCount: 0, ratingAvg: 0, ratingCount: 0, createdAt: now, createdBy: adminId || null,
  }
  await C.insertOne(doc)
  return doc.id
}

// Resolve all unit_test product ids that a pack grants (dynamic).
export async function packMemberIds(db, pack) {
  const scope = pack?.packScope; if (!scope) return []
  const q = { type: UT.type, 'unitTest.class': scope.class, status: { $ne: 'archived' } }
  if (scope.kind === 'subject') q['unitTest.subjectKey'] = scope.subjectKey
  const rows = await db.collection(STORE_COLL.products).find(q).project({ id: 1 }).toArray()
  return rows.map(r => r.id)
}

// ---------------- buyers report (who already bought this class) ----------------
export async function classBuyers(db, cls) {
  cls = String(cls)
  const prods = await db.collection(STORE_COLL.products).find({ $or: [{ type: UT.type, 'unitTest.class': cls }, { type: UT.packType, 'packScope.class': cls }] }).project({ id: 1, titleEnglish: 1, type: 1 }).toArray()
  const idSet = new Set(prods.map(p => p.id))
  const titleRx = new RegExp('^class\\s*' + cls + '\\b', 'i')
  const odRx = new RegExp('ଶ୍ରେଣୀ\\s*' + toOdiaNum(cls) + '(?![୦-୯])')
  const buyers = {}
  const orders = await db.collection('storeOrders').find({ status: 'paid' }).toArray()
  for (const o of orders) {
    const matched = (o.items || []).filter(it => idSet.has(it.productId) || titleRx.test(it.title || '') || odRx.test(it.titleOdia || ''))
    if (!matched.length) continue
    const b = (buyers[o.userId] ||= { userId: o.userId, mobile: o.userMobile, name: o.userName, amount: 0, orders: 0, items: [] })
    b.orders++
    for (const it of matched) { b.amount += (it.price || 0); b.items.push({ title: it.title, type: it.type, price: it.price, orderId: o.id, date: o.paidAt || o.createdAt }) }
  }
  const ents = await db.collection('storeEntitlements').find({ productId: { $in: [...idSet] }, revokedAt: null }).toArray()
  for (const e of ents) {
    if (buyers[e.userId]) continue
    const u = await db.collection('users').findOne({ id: e.userId })
    const prod = prods.find(p => p.id === e.productId)
    const b = (buyers[e.userId] ||= { userId: e.userId, mobile: u?.mobile, name: u?.name, amount: 0, orders: 0, items: [], grantOnly: true })
    b.items.push({ title: prod?.titleEnglish || e.productId, type: 'grant', price: 0, orderId: e.orderId, date: e.grantedAt })
  }
  const list = Object.values(buyers).sort((a, b) => b.amount - a.amount)
  return { class: cls, buyers: list, totals: { buyers: list.length, paidBuyers: list.filter(b => !b.grantOnly).length, grantOnly: list.filter(b => b.grantOnly).length, orders: list.reduce((a, b) => a + b.orders, 0), amount: list.reduce((a, b) => a + b.amount, 0) } }
}

// ---------------- replace whole class (safe cleanup before a fresh import) ----------------
// Products WITH buyers (salesCount>0) are ARCHIVED (buyers keep access); the rest
// are deleted along with their files. Subjects are cleared so the fresh import rebuilds them.
export async function clearClass(db, cls, { adminId } = {}) {
  cls = String(cls)
  const prods = await db.collection(STORE_COLL.products).find({ $or: [{ type: UT.type, 'unitTest.class': cls }, { type: UT.packType, 'packScope.class': cls }] }).toArray()
  let archived = 0, deleted = 0
  const now = new Date()
  for (const p of prods) {
    if ((p.salesCount || 0) > 0) {
      if (p.status !== 'archived') { await db.collection(STORE_COLL.products).updateOne({ id: p.id }, { $set: { status: 'archived', updatedAt: now } }); archived++ }
    } else {
      const files = await db.collection(STORE_COLL.files).find({ productId: p.id }).toArray()
      for (const f of files) { try { await StoreStorage.deleteAnyFile(f.fileRef) } catch (_) {} }
      await db.collection(STORE_COLL.files).deleteMany({ productId: p.id })
      await db.collection(STORE_COLL.products).deleteOne({ id: p.id })
      deleted++
    }
  }
  await db.collection(UT.subjects).deleteMany({ class: cls })
  return { archived, deleted }
}

// ---------------- import job ----------------
export async function createImportJob(db, { className, mode, adminId, zipName }) {
  const job = {
    id: uuidv4(), type: 'unit_tests_zip', className: String(className), zipName: zipName || '', mode: mode || 'skip',
    status: 'running', total: 0, done: 0, imported: 0, skipped: 0, replaced: 0,
    errors: [], warnings: [], report: [], adminId: adminId || null,
    createdAt: new Date(), updatedAt: new Date(),
  }
  await db.collection(UT.jobs).insertOne(job)
  return job
}

async function patchJob(db, id, patch) {
  await db.collection(UT.jobs).updateOne({ id }, { $set: { ...patch, updatedAt: new Date() } })
}
async function pushJob(db, id, arrayField, value, incField) {
  const upd = { $push: { [arrayField]: value }, $set: { updatedAt: new Date() } }
  if (incField) upd.$inc = { [incField]: 1 }
  await db.collection(UT.jobs).updateOne({ id }, upd)
}

// Process ONE pdf entry (idempotent in 'skip' mode). Returns {action}. Throws on failure.
async function processEntry(db, { cls, cat, mode, adminId, order, mapping, publish }, entry) {
  const parts = entry.entryName.split('/').filter(Boolean)
  const fileName = parts[parts.length - 1]
  const subjectFolder = parts.length >= 2 ? parts[parts.length - 2] : 'Other'
  const chapterTitle = fileName.replace(/\.pdf$/i, '').trim()
  const mapped = mapping && mapping[subjectFolder]
  const subjInfo = mapped
    ? { key: mapped.subjectKey, nameEnglish: mapped.nameEnglish, nameOdia: mapped.nameOdia || mapped.nameEnglish, style: SUBJECT_STYLE[mapped.subjectKey] || { color: '#241a5e', icon: '📚' } }
    : parseSubjectFolder(subjectFolder)
  const subj = await ensureSubject(db, { cls, ...subjInfo })
  const dup = await db.collection(STORE_COLL.products).findOne({ type: UT.type, 'unitTest.class': cls, 'unitTest.subjectKey': subj.subjectKey, 'unitTest.chapterTitle': chapterTitle })
  if (dup && mode === 'skip') return { action: 'skipped', subject: subj.nameEnglish, chapter: chapterTitle }
  const buf = entry.getData()
  if (buf.length > STORE_MAX_FILE_BYTES) throw new Error('file too large')
  const ref = await StoreStorage.storeAnyFile(buf, { kind: 'pdf', folder: `lessonguru/store/unit-tests/class-${cls}/${subj.subjectKey}`, tags: ['unit-test', `class-${cls}`, subj.subjectKey] })
  let pages = 0; try { pages = await StoreStorage.pdfPageCount(buf) } catch (_) {}
  const language = detectScript(chapterTitle, subj.subjectKey)
  let previewRef = null; try { previewRef = await generateHeaderPreview(ref) } catch (_) {}
  if (dup && mode === 'replace') {
    const oldFiles = await db.collection(STORE_COLL.files).find({ productId: dup.id }).toArray()
    for (const of of oldFiles) { try { await StoreStorage.deleteAnyFile(of.fileRef) } catch (_) {}; await db.collection(STORE_COLL.files).deleteOne({ id: of.id }) }
    await db.collection(STORE_COLL.files).insertOne({ id: uuidv4(), productId: dup.id, kind: 'pdf', name: fileName, fileRef: ref, bytes: buf.length, pages, createdAt: new Date() })
    await db.collection(STORE_COLL.products).updateOne({ id: dup.id }, { $set: { previewRefs: previewRef ? [previewRef] : [], language, 'unitTest.pageCount': pages, updatedAt: new Date() } })
    return { action: 'replaced', subject: subj.nameEnglish, chapter: chapterTitle, pages }
  }
  await insertUnitTestProduct(db, { cls, subj, chapterTitle, language, categoryId: cat.id, fileRef: ref, pages, bytes: buf.length, fileName, previewRef, sortOrder: order, adminId, status: publish ? 'published' : 'draft' })
  return { action: 'imported', subject: subj.nameEnglish, chapter: chapterTitle, pages }
}

// Runs the whole import for one zip (fire-and-forget). `onlyNames` (optional) =
// re-run just these file names (Retry failed only / Resume).
export async function runZipImport(db, { jobId, className, zipBuffer, mode = 'skip', adminId, onlyNames = null, mapping = null, publish = true, replaceClass = false }) {
  try {
    const cls = String(className)
    const cat = await ensureUnitTestCategory(db)
    if (replaceClass && !onlyNames) { try { const cleared = await clearClass(db, cls, { adminId }); await patchJob(db, jobId, { cleared }) } catch (e) { await pushJob(db, jobId, 'errors', { reason: 'replace-class: ' + String(e?.message || e) }, null) } }
    const zip = new AdmZip(zipBuffer)
    let entries = zip.getEntries().filter(e => !e.isDirectory && /\.pdf$/i.test(e.entryName) && !/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/i.test(e.entryName))
    // Expected-from-zip, per subject folder.
    const zipBySubject = {}
    for (const e of entries) { const p = e.entryName.split('/').filter(Boolean); const sf = p.length >= 2 ? p[p.length - 2] : 'Other'; zipBySubject[sf] = (zipBySubject[sf] || 0) + 1 }
    const nameSet = onlyNames ? new Set(onlyNames) : null
    if (nameSet) entries = entries.filter(e => nameSet.has(e.entryName.split('/').filter(Boolean).pop()))
    await patchJob(db, jobId, { total: entries.length, status: 'running' })
    if (onlyNames) await patchJob(db, jobId, { errors: [] }) // clear prior failures before retry
    let order = 0
    for (const entry of entries) {
      order++
      const parts = entry.entryName.split('/').filter(Boolean)
      const fileName = parts[parts.length - 1]
      const subjectFolder = parts.length >= 2 ? parts[parts.length - 2] : 'Other'
      const chapterTitle = fileName.replace(/\.pdf$/i, '').trim()
      try {
        const res = await withRetry(() => processEntry(db, { cls, cat, mode, adminId, order, mapping, publish }, entry),
          { onRetry: (n, e) => patchJob(db, jobId, {}).then(() => db.collection(UT.jobs).updateOne({ id: jobId }, { $push: { retries: { file: fileName, attempt: n, reason: String(e?.message || e) } } })) })
        if (res.action === 'skipped') await pushJob(db, jobId, 'report', { chapter: chapterTitle, subject: res.subject, action: 'skipped' }, 'skipped')
        else {
          if (res.pages && res.pages !== ASSESSMENTS_PER_FILE) await pushJob(db, jobId, 'warnings', { chapter: chapterTitle, subject: res.subject, pages: res.pages }, null)
          await pushJob(db, jobId, 'report', { chapter: chapterTitle, subject: res.subject, action: res.action }, res.action)
        }
      } catch (e) {
        // Final failure after 3 retries → red report entry with full context.
        await pushJob(db, jobId, 'errors', { fileName, chapter: chapterTitle, class: cls, subject: subjectFolder, reason: String(e?.message || e), attempts: RETRY_DELAYS.length + 1 }, null)
      }
      await db.collection(UT.jobs).updateOne({ id: jobId }, { $inc: { done: 1 } })
    }
    try { await rebuildPacks(db, cls, { adminId, publish }) } catch (e) { await pushJob(db, jobId, 'errors', { reason: 'pack rebuild: ' + String(e?.message || e) }, null) }
    // Expected vs imported per class.
    const ref = await getReference(db)
    const importedCount = await db.collection(STORE_COLL.products).countDocuments({ type: UT.type, 'unitTest.class': cls, status: { $ne: 'archived' } })
    const zipTotal = Object.values(zipBySubject).reduce((a, n) => a + n, 0)
    const refCount = ref.chapters[cls] || null
    const expected = { class: cls, zip: zipTotal, zipBySubject, imported: importedCount, reference: refCount, mismatchZip: importedCount < zipTotal, mismatchRef: refCount != null && zipTotal !== refCount }
    const fresh = await db.collection(UT.jobs).findOne({ id: jobId })
    await patchJob(db, jobId, { status: 'done', expected })
    await alertFailures(db, { kind: 'Import', jobId, failedCount: (fresh?.errors || []).length, className: cls })
  } catch (e) {
    await patchJob(db, jobId, { status: 'error', fatalError: String(e?.message || e) })
    await alertFailures(db, { kind: 'Import', jobId, failedCount: 1, className: String(className) })
  }
}
