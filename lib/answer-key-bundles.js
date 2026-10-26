// ============================================================================
// === ANSWER KEY BUNDLES === Phase F service (extends admin-prepared answer keys)
// Class-wise / multi-class bundles. Upfront payment, then free submissions per
// exam paper. All prices/savings computed on the SERVER. No AI.
// ============================================================================
import { v4 as uuidv4 } from 'uuid'
import { getAKSettings } from '@/lib/answer-key.js'

export const AKB_COLL = {
  papers: 'answerKeyPapers',
  products: 'answerKeyBundleProducts',
  exams: 'answerKeyExams',
  bundles: 'answerKeyBundles',
  priceLog: 'answerKeyPriceLog',
}

// ---------------------------------------------------------------------------
// Seed data — exact names from the Phase F spec (admin can edit later).
// paperType: 'normal' | 'long'
// ---------------------------------------------------------------------------
const P = (cls, order, nameOdia, nameEnglish, books, paperType) => ({
  id: `c${cls}-${order}`, class: String(cls), nameOdia, nameEnglish, books, paperType, sortOrder: order, active: true,
})

export const SEED_PAPERS = [
  // Class 1
  P(1, 1, 'ଓଡ଼ିଆ — ଝୁଲଣା ଶ୍ରେଣୀ ୧', 'Odia', ['ଝୁଲଣା ଶ୍ରେଣୀ ୧'], 'normal'),
  P(1, 2, 'ଗଣିତ — Ganita Khela', 'Math', ['Ganita Khela'], 'long'),
  // Class 2
  P(2, 1, 'ଓଡ଼ିଆ — ଝୁଲଣା ଦ୍ବିତୀୟ ଶ୍ରେଣୀ', 'Odia', ['ଝୁଲଣା ଦ୍ବିତୀୟ ଶ୍ରେଣୀ'], 'normal'),
  P(2, 2, 'ଗଣିତ — Majare Majare Ganita', 'Math', ['Majare Majare Ganita'], 'long'),
  // Class 3
  P(3, 1, 'ଓଡ଼ିଆ — ଭାଷା ମହକ 1', 'Odia', ['ଭାଷା ମହକ 1'], 'normal'),
  P(3, 2, 'ଇଂରାଜୀ — Pallavi', 'English', ['Pallavi'], 'normal'),
  P(3, 3, 'ଗଣିତ — ଗଣିତ ମେଳା', 'Math', ['ଗଣିତ ମେଳା'], 'long'),
  P(3, 4, 'EVS — ଆମ ବିଚିତ୍ର ପୃଥିବୀ', 'EVS', ['ଆମ ବିଚିତ୍ର ପୃଥିବୀ'], 'long'),
  P(3, 5, 'ଇନ୍ଦ୍ରଧନୁ', 'Indradhanu', ['ଇନ୍ଦ୍ରଧନୁ'], 'normal'),
  // Class 4
  P(4, 1, 'ଓଡ଼ିଆ — ଭାଷା ମହକ 2', 'Odia', ['ଭାଷା ମହକ 2'], 'normal'),
  P(4, 2, 'ଇଂରାଜୀ — ପଲ୍ଲବୀ', 'English', ['ପଲ୍ଲବୀ'], 'normal'),
  P(4, 3, 'ଗଣିତ — ଗଣିତ ମେଳା', 'Math', ['ଗଣିତ ମେଳା'], 'long'),
  P(4, 4, 'EVS — ଆମ ବିଚିତ୍ର ବିଶ୍ୱ', 'EVS', ['ଆମ ବିଚିତ୍ର ବିଶ୍ୱ'], 'long'),
  P(4, 5, 'ଇନ୍ଦ୍ରଧନୁ', 'Indradhanu', ['ଇନ୍ଦ୍ରଧନୁ'], 'normal'),
  // Class 5
  P(5, 1, 'ଓଡ଼ିଆ — ଭାଷା ମହକ 3', 'Odia', ['ଭାଷା ମହକ 3'], 'normal'),
  P(5, 2, 'ଇଂରାଜୀ — ପଲ୍ଲବୀ', 'English', ['ପଲ୍ଲବୀ'], 'normal'),
  P(5, 3, 'ଗଣିତ — ଗଣିତ ମେଳା', 'Math', ['ଗଣିତ ମେଳା'], 'long'),
  P(5, 4, 'EVS — ଆମ ବିଚିତ୍ର ବିଶ୍ୱ', 'EVS', ['ଆମ ବିଚିତ୍ର ବିଶ୍ୱ'], 'long'),
  P(5, 5, 'ନବରସ', 'Nabarasa', ['ନବରସ'], 'normal'),
  // Class 6
  P(6, 1, 'ଓଡ଼ିଆ — ସାହିତ୍ୟ ସୁଧା', 'Odia', ['ସାହିତ୍ୟ ସୁଧା'], 'normal'),
  P(6, 2, 'ଇଂରାଜୀ — Jasmine', 'English', ['Jasmine'], 'normal'),
  P(6, 3, 'ହିନ୍ଦୀ — ହିନ୍ଦୀ କଳିକା', 'Hindi', ['ହିନ୍ଦୀ କଳିକା'], 'normal'),
  P(6, 4, 'ସଂସ୍କୃତ — ସଂସ୍କୃତ କଳିକା 1', 'Sanskrit', ['ସଂସ୍କୃତ କଳିକା 1'], 'normal'),
  P(6, 5, 'ଗଣିତ — ଗଣିତ ପ୍ରକାଶ', 'Math', ['ଗଣିତ ପ୍ରକାଶ'], 'long'),
  P(6, 6, 'ବିଜ୍ଞାନ — ଜିଜ୍ଞାସା', 'Science', ['ଜିଜ୍ଞାସା'], 'long'),
  P(6, 7, 'ସାମାଜିକ ବିଜ୍ଞାନ — Bharat O Ama Pruthibi', 'Social Science', ['ସାମାଜିକ ବିଜ୍ଞାନ'], 'long'),
  P(6, 8, 'ତଲାସ୍ (Tallash)', 'Tallash', ['ତଲାସ୍'], 'normal'),
  // Class 7
  P(7, 1, 'ଓଡ଼ିଆ — ସାହିତ୍ୟ ସୁମନ', 'Odia', ['ସାହିତ୍ୟ ସୁମନ'], 'normal'),
  P(7, 2, 'ଇଂରାଜୀ — Jasmine', 'English', ['Jasmine'], 'normal'),
  P(7, 3, 'ହିନ୍ଦୀ — ହିନ୍ଦୀ କଳିକା', 'Hindi', ['ହିନ୍ଦୀ କଳିକା'], 'normal'),
  P(7, 4, 'ସଂସ୍କୃତ — ସଂସ୍କୃତ କଳିକା 2', 'Sanskrit', ['ସଂସ୍କୃତ କଳିକା 2'], 'normal'),
  P(7, 5, 'ଗଣିତ — ଗଣିତ ପ୍ରକାଶ', 'Math', ['ଗଣିତ ପ୍ରକାଶ'], 'long'),
  P(7, 6, 'ବିଜ୍ଞାନ — ଜିଜ୍ଞାସା', 'Science', ['ଜିଜ୍ଞାସା'], 'long'),
  P(7, 7, 'ସାମାଜିକ ବିଜ୍ଞାନ — Bharat O Ama Pruthibi', 'Social Science', ['ସାମାଜିକ ବିଜ୍ଞାନ'], 'long'),
  P(7, 8, 'ତଲାସ୍ (Tallash)', 'Tallash', ['ତଲାସ୍'], 'normal'),
  // Class 8
  P(8, 1, 'ଓଡ଼ିଆ — ସାହିତ୍ୟ ସୁରଭି', 'Odia', ['ସାହିତ୍ୟ ସୁରଭି'], 'normal'),
  P(8, 2, 'ଇଂରାଜୀ — Jasmine', 'English', ['Jasmine'], 'normal'),
  P(8, 3, 'ହିନ୍ଦୀ — ହିନ୍ଦୀ କଳିକା', 'Hindi', ['ହିନ୍ଦୀ କଳିକା'], 'normal'),
  P(8, 4, 'ସଂସ୍କୃତ — ସଂସ୍କୃତ କଳିକା 3', 'Sanskrit', ['ସଂସ୍କୃତ କଳିକା 3'], 'normal'),
  P(8, 5, 'ଗଣିତ — ଗଣିତ ପ୍ରକାଶ', 'Math', ['ଗଣିତ ପ୍ରକାଶ'], 'long'),
  P(8, 6, 'ବିଜ୍ଞାନ — ଜିଜ୍ଞାସା', 'Science', ['ଜିଜ୍ଞାସା'], 'long'),
  P(8, 7, 'ସାମାଜିକ ବିଜ୍ଞାନ', 'Social Science', ['ସାମାଜିକ ବିଜ୍ଞାନ'], 'long'),
  P(8, 8, 'ତଲାସ୍ (Tallash)', 'Tallash', ['ତଲାସ୍'], 'normal'),
  // Class 9
  P(9, 1, 'ଓଡ଼ିଆ — ସାହିତ୍ୟ ଧାରା + ମାଧ୍ୟମିକ ବ୍ୟାକରଣ', 'Odia', ['ସାହିତ୍ୟ ଧାରା', 'ମାଧ୍ୟମିକ ବ୍ୟାକରଣ'], 'normal'),
  P(9, 2, 'ଇଂରାଜୀ — Skills of Communicative English + Learn & Practice Grammar', 'English', ['Skills of Communicative English', 'Learn & Practice Grammar'], 'normal'),
  P(9, 3, 'ସଂସ୍କୃତ — Sanskruta Ballari + ସଂସ୍କୃତ ବ୍ୟାକରଣ ପ୍ରଦୀପ', 'Sanskrit', ['Sanskruta Ballari', 'ସଂସ୍କୃତ ବ୍ୟାକରଣ ପ୍ରଦୀପ'], 'normal'),
  P(9, 4, 'ହିନ୍ଦୀ — Hindi Manjari + Hindi Byakaran aur Prayog', 'Hindi', ['Hindi Manjari', 'Hindi Byakaran aur Prayog'], 'normal'),
  P(9, 5, 'ବୀଜଗଣିତ — ମାଧ୍ୟମିକ ବୀଜଗଣିତ', 'Algebra', ['ମାଧ୍ୟମିକ ବୀଜଗଣିତ'], 'long'),
  P(9, 6, 'ଜ୍ୟାମିତି — ମାଧ୍ୟମିକ ଜ୍ୟାମିତି', 'Geometry', ['ମାଧ୍ୟମିକ ଜ୍ୟାମିତି'], 'long'),
  P(9, 7, 'ଭୌତିକ ବିଜ୍ଞାନ', 'Physical Science', ['ଭୌତିକ ବିଜ୍ଞାନ'], 'long'),
  P(9, 8, 'ଜୀବ ବିଜ୍ଞାନ', 'Life Science', ['ଜୀବ ବିଜ୍ଞାନ'], 'long'),
  P(9, 9, 'ଇତିହାସ ଓ ରାଜନୀତି ବିଜ୍ଞାନ', 'History & Political Science', ['ଇତିହାସ ଓ ରାଜନୀତି ବିଜ୍ଞାନ'], 'long'),
  P(9, 10, 'ଭୂଗୋଳ ଓ ଅର୍ଥନୀତି', 'Geography & Economics', ['ଭୂଗୋଳ ଓ ଅର୍ଥନୀତି'], 'long'),
  // Class 10
  P(10, 1, 'ଓଡ଼ିଆ — ସାହିତ୍ୟ ସିନ୍ଧୁ + ମାଧ୍ୟମିକ ବ୍ୟାକରଣ', 'Odia', ['ସାହିତ୍ୟ ସିନ୍ଧୁ', 'ମାଧ୍ୟମିକ ବ୍ୟାକରଣ'], 'normal'),
  P(10, 2, 'ଇଂରାଜୀ — Skills of Communicative English + Learn & Practice Grammar', 'English', ['Skills of Communicative English', 'Learn & Practice Grammar'], 'normal'),
  P(10, 3, 'ସଂସ୍କୃତ — Sanskruta Sahitya Manjari + ସଂସ୍କୃତ ବ୍ୟାକରଣ ପ୍ରକାଶ', 'Sanskrit', ['Sanskruta Sahitya Manjari', 'ସଂସ୍କୃତ ବ୍ୟାକରଣ ପ୍ରକାଶ'], 'normal'),
  P(10, 4, 'ହିନ୍ଦୀ — Hindi Saurav + Madhyamika Hindi Byakaran', 'Hindi', ['Hindi Saurav', 'Madhyamika Hindi Byakaran'], 'normal'),
  P(10, 5, 'ବୀଜଗଣିତ — ମାଧ୍ୟମିକ ବୀଜଗଣିତ', 'Algebra', ['ମାଧ୍ୟମିକ ବୀଜଗଣିତ'], 'long'),
  P(10, 6, 'ଜ୍ୟାମିତି — ମାଧ୍ୟମିକ ଜ୍ୟାମିତି', 'Geometry', ['ମାଧ୍ୟମିକ ଜ୍ୟାମିତି'], 'long'),
  P(10, 7, 'ଭୌତିକ ବିଜ୍ଞାନ', 'Physical Science', ['ଭୌତିକ ବିଜ୍ଞାନ'], 'long'),
  P(10, 8, 'ଜୀବ ବିଜ୍ଞାନ', 'Life Science', ['ଜୀବ ବିଜ୍ଞାନ'], 'long'),
  P(10, 9, 'ଇତିହାସ ଓ ରାଜନୀତି ବିଜ୍ଞାନ', 'History & Political Science', ['ଇତିହାସ ଓ ରାଜନୀତି ବିଜ୍ଞାନ'], 'long'),
  P(10, 10, 'ଭୂଗୋଳ ଓ ଅର୍ଥନୀତି (incl. Additional Chapters)', 'Geography & Economics', ['ଭୂଗୋଳ ଓ ଅର୍ଥନୀତି'], 'long'),
]

export const SEED_PRODUCTS = [
  { id: 'c1', nameOdia: 'ପ୍ରଥମ ଶ୍ରେଣୀ', nameEnglish: 'Class 1', classes: ['1'], priceInr: 39, sortOrder: 1 },
  { id: 'c2', nameOdia: 'ଦ୍ୱିତୀୟ ଶ୍ରେଣୀ', nameEnglish: 'Class 2', classes: ['2'], priceInr: 45, sortOrder: 2 },
  { id: 'c3', nameOdia: 'ତୃତୀୟ ଶ୍ରେଣୀ', nameEnglish: 'Class 3', classes: ['3'], priceInr: 79, sortOrder: 3 },
  { id: 'c4', nameOdia: 'ଚତୁର୍ଥ ଶ୍ରେଣୀ', nameEnglish: 'Class 4', classes: ['4'], priceInr: 85, sortOrder: 4 },
  { id: 'c5', nameOdia: 'ପଞ୍ଚମ ଶ୍ରେଣୀ', nameEnglish: 'Class 5', classes: ['5'], priceInr: 89, sortOrder: 5 },
  { id: 'c6', nameOdia: 'ଷଷ୍ଠ ଶ୍ରେଣୀ', nameEnglish: 'Class 6', classes: ['6'], priceInr: 129, sortOrder: 6 },
  { id: 'c7', nameOdia: 'ସପ୍ତମ ଶ୍ରେଣୀ', nameEnglish: 'Class 7', classes: ['7'], priceInr: 139, sortOrder: 7 },
  { id: 'c8', nameOdia: 'ଅଷ୍ଟମ ଶ୍ରେଣୀ', nameEnglish: 'Class 8', classes: ['8'], priceInr: 149, sortOrder: 8 },
  { id: 'c9', nameOdia: 'ନବମ ଶ୍ରେଣୀ', nameEnglish: 'Class 9', classes: ['9'], priceInr: 199, sortOrder: 9 },
  { id: 'c10', nameOdia: 'ଦଶମ ଶ୍ରେଣୀ', nameEnglish: 'Class 10', classes: ['10'], priceInr: 219, sortOrder: 10 },
  { id: 'primary', nameOdia: 'ପ୍ରାଥମିକ (୧-୫)', nameEnglish: 'Primary (Classes 1-5)', classes: ['1', '2', '3', '4', '5'], priceInr: 249, sortOrder: 11 },
  { id: 'upper', nameOdia: 'ଉଚ୍ଚ ପ୍ରାଥମିକ (୬-୮)', nameEnglish: 'Upper Primary (Classes 6-8)', classes: ['6', '7', '8'], priceInr: 319, sortOrder: 12 },
  { id: 'secondary', nameOdia: 'ମାଧ୍ୟମିକ (୯-୧୦)', nameEnglish: 'Secondary (Classes 9-10)', classes: ['9', '10'], priceInr: 349, sortOrder: 13 },
]

export async function ensureAKBIndexes(db) {
  try {
    await db.collection(AKB_COLL.papers).createIndex({ id: 1 }, { unique: true })
    await db.collection(AKB_COLL.papers).createIndex({ class: 1, sortOrder: 1 })
    await db.collection(AKB_COLL.products).createIndex({ id: 1 }, { unique: true })
    await db.collection(AKB_COLL.exams).createIndex({ id: 1 }, { unique: true })
    await db.collection(AKB_COLL.bundles).createIndex({ ownerId: 1, purchasedAt: -1 })
    await db.collection(AKB_COLL.bundles).createIndex({ id: 1 }, { unique: true })
    await db.collection(AKB_COLL.bundles).createIndex({ razorpayOrderId: 1 }, { unique: true, sparse: true })
  } catch (_) {}
}

// Idempotent seed — inserts only missing papers/products (never overwrites admin edits).
export async function seedAKB(db) {
  for (const p of SEED_PAPERS) {
    await db.collection(AKB_COLL.papers).updateOne({ id: p.id }, { $setOnInsert: p }, { upsert: true })
  }
  for (const pr of SEED_PRODUCTS) {
    await db.collection(AKB_COLL.products).updateOne({ id: pr.id }, { $setOnInsert: { ...pr, active: true } }, { upsert: true })
  }
}

// Active papers for a set of classes (sorted).
export async function papersForClasses(db, classes) {
  return await db.collection(AKB_COLL.papers).find({ class: { $in: classes.map(String) }, active: true }).sort({ class: 1, sortOrder: 1 }).toArray()
}

// Server-computed "bought separately" value using CURRENT single prices.
export async function computeSavings(db, classes) {
  const s = await getAKSettings(db)
  const papers = await papersForClasses(db, classes)
  let total = 0
  for (const p of papers) total += (p.paperType === 'long' ? Number(s.longPriceInr || 49) : Number(s.standardPriceInr || 29))
  return { separately: total, paperCount: papers.length }
}

// Record a price change in the audit log.
export async function logPriceChange(db, { kind, refId, field, oldValue, newValue, adminId }) {
  await db.collection(AKB_COLL.priceLog).insertOne({ id: uuidv4(), kind, refId, field, oldValue, newValue, adminId: adminId || null, at: new Date() })
}

export function bundleExpired(b) { return !b?.expiresAt || new Date(b.expiresAt) < new Date() }

// Create a bundle (with slots) from a verified payment. Idempotent via the
// sparse-unique razorpayOrderId index — a duplicate insert is swallowed.
export async function createAnswerKeyBundle(db, payment, razorpayPaymentId) {
  const prod = await db.collection(AKB_COLL.products).findOne({ id: payment.bundleProductId })
  const exam = await db.collection(AKB_COLL.exams).findOne({ id: payment.examId })
  if (!prod || !exam) return null
  const papers = await papersForClasses(db, prod.classes)
  const slots = papers.map(p => ({ class: p.class, paperId: p.id, requestId: null, usedAt: null }))
  const now = new Date()
  const rec = {
    id: uuidv4(), ownerId: payment.userId, bundleProductId: prod.id, examId: exam.id,
    classes: prod.classes, slots, priceInr: payment.amount,
    razorpayOrderId: payment.razorpay_order_id, razorpayPaymentId: razorpayPaymentId || null,
    purchasedAt: now, expiresAt: new Date(exam.endDate), status: 'active', updatedAt: now,
  }
  try { await db.collection(AKB_COLL.bundles).insertOne(rec); return rec }
  catch (e) { // duplicate (race) — return the one that won
    const existing = await db.collection(AKB_COLL.bundles).findOne({ razorpayOrderId: payment.razorpay_order_id })
    return existing || null
  }
}

// Mark bundles past expiry as 'expired' (called by the daily cron).
export async function expireBundles(db) {
  const res = await db.collection(AKB_COLL.bundles).updateMany({ status: 'active', expiresAt: { $lt: new Date() } }, { $set: { status: 'expired', updatedAt: new Date() } })
  return res.modifiedCount || 0
}

// Public-safe bundle view.
export function bundleView(b) {
  return {
    id: b.id, bundleProductId: b.bundleProductId, examId: b.examId, classes: b.classes,
    priceInr: b.priceInr, status: b.status, purchasedAt: b.purchasedAt, expiresAt: b.expiresAt,
    slots: (b.slots || []).map(s => ({ class: s.class, paperId: s.paperId, used: !!s.requestId, requestId: s.requestId || null, usedAt: s.usedAt || null })),
    slotsTotal: (b.slots || []).length,
    slotsUsed: (b.slots || []).filter(s => s.requestId).length,
  }
}
