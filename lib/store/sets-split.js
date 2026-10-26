// === STORE · UNIT TEST SETS === split each chapter PDF into per-page SET products.
// Additive only: creates new type 'unit_test_set' products (hidden by default)
// + their private files/previews. Never edits orders, payments, users or any
// non-store data. Reuses the existing private Cloudinary storage + preview helper.
import { v4 as uuidv4 } from 'uuid'
import { STORE_COLL } from '@/lib/store/security.js'
import * as StoreStorage from '@/lib/store/storage.js'
import { ensureUniqueSlug } from '@/lib/store/catalog.js'
import { toOdiaNum, generateHeaderPreview, UT, getReference, ADMIN_ALERT_WHATSAPP } from '@/lib/store/unit-tests-import.js'
import { sendWhatsApp } from '@/lib/ultramsg.js'

const RETRY_DELAYS = [5000, 15000, 30000]
async function withRetry(fn, onRetry) {
  let lastErr
  for (let a = 0; a <= RETRY_DELAYS.length; a++) {
    try { return await fn() } catch (e) { lastErr = e; if (a < RETRY_DELAYS.length) { if (onRetry) { try { await onRetry(a + 1, e) } catch (_) {} } await new Promise(r => setTimeout(r, RETRY_DELAYS[a])) } }
  }
  throw lastErr
}

const SET_PRICE = 2
const SET_MRP = 5
const CHAPTER_PRICE = 10 // default bundle price for a 5-set chapter (= pages × SET_PRICE)

function roundEndingIn9(n) { const p = Math.max(9, Math.round(n)); return Math.max(9, Math.round((p + 1) / 10) * 10 - 1) }

async function subjectFor(db, cls, subjectKey, cache) {
  if (cache && cache[subjectKey]) return cache[subjectKey]
  const doc = await db.collection(UT.subjects).findOne({ class: String(cls), subjectKey })
    || { nameOdia: subjectKey, nameEnglish: subjectKey, subjectKey }
  if (cache) cache[subjectKey] = doc
  return doc
}

async function insertSetProduct(db, { chapter, subj, setNo, fileRef, previewRef, bytes, hidden }) {
  const now = new Date(); const cls = chapter.unitTest.class
  const titleOdia = `ଶ୍ରେଣୀ ${toOdiaNum(cls)} · ${subj.nameOdia} · ${chapter.unitTest.chapterTitle} — ସେଟ୍ ${toOdiaNum(setNo)}`
  const titleEnglish = `Class ${cls} · ${subj.nameEnglish} · ${chapter.unitTest.chapterTitle} — Set ${setNo}`
  const slug = await ensureUniqueSlug(db, `class${cls}-${subj.subjectKey}-set${setNo}-${uuidv4().slice(0, 6)}`)
  const id = uuidv4()
  const doc = {
    id, slug, type: 'unit_test_set', categoryId: chapter.categoryId, parentChapterId: chapter.id, setNo,
    titleOdia, titleEnglish, shortDesc: '', fullDesc: '',
    whatsInside: ['୧ଟି ଅଧ୍ୟାୟଭିତ୍ତିକ ପରୀକ୍ଷା', `${toOdiaNum(25)} ନମ୍ବର`, 'A4 ପ୍ରିଣ୍ଟ ପାଇଁ ପ୍ରସ୍ତୁତ'],
    classes: [String(cls)], subject: subj.nameEnglish, subjectKey: subj.subjectKey, paper: '', exam: '',
    language: chapter.language || 'odia', tags: ['unit-test-set', subj.subjectKey, `class-${cls}`],
    coverUrl: null, coverAuto: true, previewMode: 'blurred', previewRefs: previewRef ? [previewRef] : [],
    securityLevel: 2, watermarkStyle: 'footer', downloadLimit: 5, printAllowed: true,
    mrpInr: SET_MRP, priceInr: SET_PRICE, launchPriceInr: null, launchStart: null, launchEnd: null, premiumPriceInr: null,
    status: 'published', publishAt: null, visibility: hidden ? 'hidden' : 'public',
    featured: false, sortOrder: setNo, maxPerUser: 1, bundleItems: [],
    unitTest: { class: String(cls), subjectKey: subj.subjectKey, chapterTitle: chapter.unitTest.chapterTitle, setNo, assessmentsCount: 1, fullMarks: 25, pageCount: 1 },
    salesCount: 0, ratingAvg: 0, ratingCount: 0, createdAt: now, updatedAt: now,
  }
  await db.collection(STORE_COLL.products).insertOne(doc)
  await db.collection(STORE_COLL.files).insertOne({ id: uuidv4(), productId: id, kind: 'pdf', name: `set-${setNo}.pdf`, fileRef, bytes, pages: 1, createdAt: now })
  return doc
}

export async function splitChapter(db, chapter, { hidden = true, mode = 'skip', subjCache } = {}) {
  const file = await db.collection(STORE_COLL.files).findOne({ productId: chapter.id, kind: 'pdf' })
  if (!file) throw new Error('no source file')
  const bytes = await StoreStorage.fetchAnyBytes(file.fileRef)
  const { PDFDocument } = await import('pdf-lib')
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const n = src.getPageCount()
  const subj = await subjectFor(db, chapter.unitTest.class, chapter.unitTest.subjectKey, subjCache)
  let created = 0
  for (let i = 0; i < n; i++) {
    const setNo = i + 1
    const exists = await db.collection(STORE_COLL.products).findOne({ type: 'unit_test_set', parentChapterId: chapter.id, setNo })
    if (exists && mode === 'skip') continue
    const out = await PDFDocument.create()
    const [pg] = await out.copyPages(src, [i]); out.addPage(pg)
    const buf = Buffer.from(await out.save())
    const ref = await StoreStorage.storeAnyFile(buf, { kind: 'pdf', folder: `lessonguru/store/unit-tests/class-${chapter.unitTest.class}/${subj.subjectKey}/sets`, tags: ['unit-test-set', `class-${chapter.unitTest.class}`, subj.subjectKey] })
    let previewRef = null; try { previewRef = await generateHeaderPreview(ref) } catch (_) {}
    if (exists && mode === 'replace') {
      const old = await db.collection(STORE_COLL.files).find({ productId: exists.id }).toArray()
      for (const o of old) { try { await StoreStorage.deleteAnyFile(o.fileRef) } catch (_) {}; await db.collection(STORE_COLL.files).deleteOne({ id: o.id }) }
      await db.collection(STORE_COLL.files).insertOne({ id: uuidv4(), productId: exists.id, kind: 'pdf', name: `set-${setNo}.pdf`, fileRef: ref, bytes: buf.length, pages: 1, createdAt: new Date() })
      await db.collection(STORE_COLL.products).updateOne({ id: exists.id }, { $set: { previewRefs: previewRef ? [previewRef] : [], updatedAt: new Date() } })
    } else {
      await insertSetProduct(db, { chapter, subj, setNo, fileRef: ref, previewRef, bytes: buf.length, hidden })
    }
    created++
  }
  return { created, pages: n }
}

export async function createSplitJob(db, { adminId, scope }) {
  const job = { id: uuidv4(), type: 'sets_split', scope: scope || 'all', status: 'running', total: 0, done: 0, created: 0, warnings: [], errors: [], adminId: adminId || null, createdAt: new Date(), updatedAt: new Date() }
  await db.collection(UT.jobs).insertOne(job)
  return job
}

// Fire-and-forget; HTTP returns immediately with the jobId.
export async function runSplitJob(db, { jobId, filter, hidden = true, mode = 'skip', adminId }) {
  try {
    const chapters = await db.collection(STORE_COLL.products).find({ type: 'unit_test', status: { $ne: 'archived' }, ...(filter || {}) }).toArray()
    await db.collection(UT.jobs).updateOne({ id: jobId }, { $set: { total: chapters.length } })
    const subjCache = {}
    for (const ch of chapters) {
      try {
        const r = await withRetry(() => splitChapter(db, ch, { hidden, mode, subjCache }),
          (n, e) => db.collection(UT.jobs).updateOne({ id: jobId }, { $push: { retries: { chapter: ch?.unitTest?.chapterTitle, attempt: n, reason: String(e?.message || e) } } }))
        if (r.pages !== 5) await db.collection(UT.jobs).updateOne({ id: jobId }, { $push: { warnings: { chapter: ch.unitTest.chapterTitle, class: ch.unitTest.class, subject: ch.subject, pages: r.pages, sets: r.pages } } })
        await db.collection(UT.jobs).updateOne({ id: jobId }, { $inc: { done: 1, created: r.created } })
      } catch (e) {
        await db.collection(UT.jobs).updateOne({ id: jobId }, { $inc: { done: 1 }, $push: { errors: { fileName: ch?.unitTest?.chapterTitle, chapter: ch?.unitTest?.chapterTitle, class: ch?.unitTest?.class, subject: ch?.subject, reason: String(e?.message || e), attempts: RETRY_DELAYS.length + 1 } } })
      }
    }
    // Expected vs imported (sets) per class.
    const ref = await getReference(db)
    const bySetClass = await db.collection(STORE_COLL.products).aggregate([
      { $match: { type: 'unit_test_set', status: { $ne: 'archived' } } },
      { $group: { _id: '$unitTest.class', count: { $sum: 1 } } },
    ]).toArray()
    const setsByClass = {}; let setsTotal = 0
    for (const r of bySetClass) { setsByClass[r._id] = r.count; setsTotal += r.count }
    const jobDoc = await db.collection(UT.jobs).findOne({ id: jobId })
    await db.collection(UT.jobs).updateOne({ id: jobId }, { $set: { status: 'done', expected: { setsByClass, setsTotal, reference: ref.setsTotal, mismatch: setsTotal !== ref.setsTotal }, updatedAt: new Date() } })
    if ((jobDoc?.errors || []).length) { const n = jobDoc.errors.length; try { await sendWhatsApp({ to: ADMIN_ALERT_WHATSAPP, body: `⚠️ LessonGuru Set-split: ${n} ଟି ଅଧ୍ୟାୟ ବିଫଳ ହେଲା — report ଦେଖନ୍ତୁ (job ${String(jobId).slice(0, 8)})` }) } catch (_) {}; try { await db.collection('adminNotifications').insertOne({ id: uuidv4(), type: 'store_split_failure', jobId, failedCount: n, message: `Set-split: ${n} chapters failed — see report`, read: false, createdAt: new Date() }) } catch (_) {} }
  } catch (e) {
    await db.collection(UT.jobs).updateOne({ id: jobId }, { $set: { status: 'error', fatalError: String(e?.message || e) } })
  }
}

// Compute (do NOT apply) the full new-price table for admin approval.
export async function computePricingPlan(db, { chapterPrice = CHAPTER_PRICE } = {}) {
  const plan = []
  for (const cls of ['1', '2', '3', '4', '5', '6', '7']) {
    const tests = await db.collection(STORE_COLL.products).find({ type: 'unit_test', 'unitTest.class': cls, status: { $ne: 'archived' } }).project({ 'unitTest.subjectKey': 1, 'unitTest.pageCount': 1 }).toArray()
    const total = tests.length; if (!total) continue
    const bySubj = {}
    for (const t of tests) { (bySubj[t.unitTest.subjectKey] ||= []).push(t) }
    const subjects = Object.entries(bySubj).map(([k, arr]) => ({ subjectKey: k, chapters: arr.length, packPrice: Math.max(5, Math.round(arr.length * chapterPrice * 0.75)), separately: arr.length * chapterPrice }))
    plan.push({ class: cls, totalChapters: total, chapterPrice, setPrice: SET_PRICE, setMrp: SET_MRP, classPackPrice: roundEndingIn9(total * chapterPrice * 0.6), classSeparately: total * chapterPrice, subjects })
  }
  return plan
}

// Apply the new pricing: chapter bundle = pages×SET_PRICE (MRP pages×SET_MRP),
// sets ₹2/₹5, and recompute pack prices (subject ×0.75, class ×0.6 ending-in-9).
// Logs every price change in storePriceHistory. New orders only.
export async function applyPricing(db, { chapterPrice = CHAPTER_PRICE, adminId } = {}) {
  const now = new Date()
  const changes = []
  // Admin overrides for class-pack prices (exact values, win over the formula).
  const ovDoc = await db.collection('storePricingOverrides').findOne({ id: 'default' })
  const classPackOverride = ovDoc?.classPacks || {}
  const logPrice = async (p, newPrice, newMrp) => {
    if (p.priceInr === newPrice && p.mrpInr === newMrp) return
    await db.collection('storePriceHistory').insertOne({ id: uuidv4(), productId: p.id, oldPrice: p.priceInr, newPrice, oldMrp: p.mrpInr, newMrp, at: now, by: adminId || null, reason: 'sets-rollout' })
    await db.collection(STORE_COLL.products).updateOne({ id: p.id }, { $set: { priceInr: newPrice, mrpInr: newMrp, updatedAt: now } })
    changes.push({ id: p.id, type: p.type, from: p.priceInr, to: newPrice })
  }
  // Chapter bundles
  const chapters = await db.collection(STORE_COLL.products).find({ type: 'unit_test', status: { $ne: 'archived' } }).toArray()
  for (const ch of chapters) {
    const pages = ch.unitTest?.pageCount || 5
    await logPrice(ch, pages * SET_PRICE, pages * SET_MRP)
  }
  // Sets
  const sets = await db.collection(STORE_COLL.products).find({ type: 'unit_test_set', status: { $ne: 'archived' } }).toArray()
  for (const s of sets) await logPrice(s, SET_PRICE, SET_MRP)
  // Packs (respect admin-customised prices)
  const packs = await db.collection(STORE_COLL.products).find({ type: 'unit_test_pack', status: { $ne: 'archived' } }).toArray()
  for (const pk of packs) {
    if (pk.priceCustomized) continue
    const cls = pk.packScope?.class
    const q = { type: 'unit_test', 'unitTest.class': cls, status: { $ne: 'archived' } }
    if (pk.packScope?.kind === 'subject') q['unitTest.subjectKey'] = pk.packScope.subjectKey
    const cnt = await db.collection(STORE_COLL.products).countDocuments(q)
    let price = pk.packScope?.kind === 'class' ? roundEndingIn9(cnt * chapterPrice * 0.6) : Math.max(5, Math.round(cnt * chapterPrice * 0.75))
    // Exact admin override for class packs (per-class), if set.
    if (pk.packScope?.kind === 'class' && classPackOverride[String(cls)]) price = Number(classPackOverride[String(cls)])
    await logPrice(pk, price, cnt * chapterPrice)
    const packSet = { 'packMeta.chapters': cnt, 'packMeta.separately': cnt * chapterPrice }
    if (pk.packScope?.kind === 'class' && classPackOverride[String(cls)]) packSet.priceCustomized = true
    await db.collection(STORE_COLL.products).updateOne({ id: pk.id }, { $set: packSet })
  }
  return { changed: changes.length, sampleChanges: changes.slice(0, 10) }
}
