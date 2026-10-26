#!/usr/bin/env node
/**
 * One-time import: Sishuvatika Workbook → Balvatika class
 *   Source data is a `const rawData` JS string in the artifact HTML.
 *   Steps 1-4 of Panchapadi are templated per type (M/L/A/E); step 5 + HW is uniform.
 *
 * Idempotent: drops existing "Sishuvatika Workbook" book + cascading children before re-import.
 *
 * Run:  node /app/scripts/import-sishuvatika.mjs
 */
import { MongoClient } from 'mongodb'
import { randomUUID } from 'crypto'

const HTML_URL  = 'https://customer-assets.emergentagent.com/job_odisha-learning-pro/artifacts/z7hvvhk6_gemini-code-1782055920045.html'
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017'
const DB_NAME   = process.env.DB_NAME   || 'edumaster_odisha'
const BOOK_NAME = 'Sishuvatika Workbook'
const CHAPTER_NAME = 'ବାଲବାଟିକା ସିଲାବସ୍ — Developmental Activities'

const log = (...a) => console.log('[import]', ...a)

// Replicates generateSteps() from the artifact HTML to produce the exact Panchapadi content.
function generateSteps({ title, tlm, type: t }) {
  const s5_hw_text = `HW (ଗୃହକାର୍ଯ୍ୟ): ଘରେ ପିତାମାତାଙ୍କ ସହ ମିଶି '${title}' ଉପରେ କାର୍ଯ୍ୟ-ଫର୍ଦ୍ଦ ପୂରଣ କରିବେ ଏବଂ ଅଭ୍ୟାସ କରିବେ।`
  let s1_t, s1_s, s2_t, s2_s, s3_t, s3_s, s4_t, s4_s

  if (t === 'M') {
    s1_t = `"ପିଲାମାନେ, ଆଜି ଆମେ ଏକ ନୂଆ ମଜାଦାର ଖେଳ ଖେଳିବା! ତୁମେମାନେ କେବେ ${title} ଦେଖିଛ କି?" ଗୀତ ବା ମଜା କଥା କହି ପୂର୍ବଜ୍ଞାନ ଆହରଣ କରିବେ।`
    s1_s = `"ହଁ ସାର୍/ଗୁରୁମା! ଆମେ ଦେଖିଛୁ..." ଆଗ୍ରହର ସହ ପୂର୍ବଜ୍ଞାନ ପ୍ରକାଶ କରିବେ।`
    s2_t = `${tlm} ବ୍ୟବହାର କରି କଳାପଟାରେ କିମ୍ବା ଶ୍ରେଣୀରେ '${title}' ର ମୁଖ୍ୟ ଧାରଣା ବୁଝାଇବେ ଏବଂ ବାସ୍ତବ ଉଦାହରଣ ଦେବେ।`
    s2_s = `ଶିକ୍ଷକଙ୍କ କଥା ମନଦେଇ ଶୁଣିବେ ଏବଂ ସାମଗ୍ରୀ (TLM) ଦେଖି ଧାରଣା ସ୍ପଷ୍ଟ କରିବେ।`
    s3_t = `"ଏବେ ଆସ ଦଳରେ ବସି କାମ କରିବା।" ପିଲାମାନଙ୍କୁ ଛୋଟ ଦଳରେ ବାଣ୍ଟି ସାମଗ୍ରୀ ବ୍ୟବହାର କରି ଗଣିବା ବା ସଜାଇବାକୁ କହିବେ।`
    s3_s = `ନିଜ ସାଙ୍ଗମାନଙ୍କ ସହ ମିଶି ବସ୍ତୁଗୁଡ଼ିକୁ ସଜାଇବେ ବା ଗଣି ଶିକ୍ଷକଙ୍କୁ ଦେଖାଇବେ।`
    s4_t = `କାର୍ଯ୍ୟ-ଫର୍ଦ୍ଦ ଦେଇ '${title}' ସମ୍ବନ୍ଧୀୟ ପ୍ରଶ୍ନର ସମାଧାନ କିମ୍ବା ମେଳନ କରିବାକୁ ନିର୍ଦ୍ଦେଶ ଦେବେ।`
    s4_s = `କାର୍ଯ୍ୟଫର୍ଦ୍ଦରେ ଚିତ୍ର ଚିହ୍ନିବେ କିମ୍ବା ସଠିକ୍ ଉତ୍ତରରେ ଠିକ୍ ଚିହ୍ନ (✓) ଦେବେ।`
  } else if (t === 'L') {
    s1_t = `"ପିଲାମାନେ, ଏହି କବିତା/ଗଳ୍ପଟିକୁ ଶୁଣ। ଏଥିରେ କେଉଁ ଶବ୍ଦ ବାରମ୍ବାର ଆସୁଛି?" ଅଭିନୟ ସହ ଆବୃତ୍ତି କରିବେ।`
    s1_s = `"ସାର୍, ଏଥିରେ '${title}' ର ଶବ୍ଦ ବାରମ୍ବାର ଆସୁଛି!" ଆନନ୍ଦରେ ଉତ୍ତର ଦେବେ।`
    s2_t = `${tlm} ଦେଖାଇ ଧ୍ୱନି, ଅକ୍ଷର କିମ୍ବା କାହାଣୀର ଘଟଣାକ୍ରମକୁ ସ୍ପଷ୍ଟ ଭାବେ ବର୍ଣ୍ଣନା କରିବେ।`
    s2_s = `ଚିତ୍ର କାର୍ଡ ଦେଖିବେ ଏବଂ ଶବ୍ଦର ପ୍ରଥମ ଅକ୍ଷର କିମ୍ବା ଗଳ୍ପର ଚରିତ୍ରକୁ ଚିହ୍ନଟ କରିବେ।`
    s3_t = `"ଚାଲ ଏକ ଖେଳ ଖେଳିବା!" ଅକ୍ଷର କାର୍ଡ ଓ ଚିତ୍ର କାର୍ଡ ମେଳନ କରିବା ପାଇଁ ଦଳଗତ ଖେଳ କରାଇବେ।`
    s3_s = `ଗୋଟିଏ ଦଳ ଚିତ୍ର ଦେଖାଇଲେ ଆମ ଦଳ ଅକ୍ଷର ଦେଖାଇବୁ, ଏପରି ଆନନ୍ଦର ସହ ଖେଳିବେ।`
    s4_t = `"ଏବେ ବିନ୍ଦୁ ଥିବା ଅକ୍ଷର ଫର୍ଦ୍ଦରେ ଗାର ଟାଣି ଅକ୍ଷର ଲେଖ ଓ ଚିତ୍ରରେ ରଙ୍ଗ ଦିଅ।"`
    s4_s = `ବିନ୍ଦୁ ଯୋଡ଼ି ସୁନ୍ଦର ଭାବେ ଅକ୍ଷର ଲେଖିବେ ଏବଂ ନିର୍ଦ୍ଦିଷ୍ଟ ରଙ୍ଗ ଭରିବେ।`
  } else if (t === 'A') {
    s1_t = `"ପିଲାମାନେ, ଆଜି ଆମେ ରଙ୍ଗ, କାଗଜ କିମ୍ବା ମାଟି ନେଇ ଏକ ସୁନ୍ଦର କାମ କରିବା। ପ୍ରସ୍ତୁତ ଅଛ ତ?"`
    s1_s = `"ହଁ ଗୁରୁମା/ସାର୍! ଆମେ ମାଟିରେ ଖେଳିବୁ ବା ଚିତ୍ର କରିବୁ।"`
    s2_t = `${tlm} ବ୍ୟବହାର କରି ଶିକ୍ଷକ ନିଜେ ଏକ କଳାକୃତିର (Art) ନମୁନା ପ୍ରସ୍ତୁତ କରି ପ୍ରଦର୍ଶନ କରିବେ।`
    s2_s = `ଧ୍ୟାନର ସହ ଶିକ୍ଷକଙ୍କ ହାତର କାମକୁ ନିରୀକ୍ଷଣ କରିବେ ଏବଂ ଶିଖିବେ।`
    s3_t = `ପିଲାମାନଙ୍କୁ ସାମଗ୍ରୀ ବାଣ୍ଟି ନିଜ କଳ୍ପନାରେ ଚିତ୍ର/ଗଠନ କରିବାକୁ ଉତ୍ସାହିତ କରିବେ।`
    s3_s = `ନିଜ ହାତରେ ସୃଜନାତ୍ମକ କାର୍ଯ୍ୟ (ଯଥା: ବିନ୍ଦୁ ଯୋଡିବା ବା ରଙ୍ଗ ଦେବା) କରିବେ।`
    s4_t = `"ଏବେ ତୁମ ଡ୍ରଇଂ ସିଟ୍‌ରେ ଥିବା ଅସମ୍ପୂର୍ଣ୍ଣ ଚିତ୍ରକୁ ପୂରଣ କରି ସଠିକ୍ ରଙ୍ଗ ଦିଅ।"`
    s4_s = `ନିଜସ୍ୱ କଳ୍ପନା ପ୍ରୟୋଗ କରି ଚିତ୍ର ସମ୍ପୂର୍ଣ୍ଣ କରିବେ ଏବଂ ନିଜ ସାଙ୍ଗମାନଙ୍କୁ ଦେଖାଇବେ।`
  } else { // 'E' Environment / default
    s1_t = `"ପିଲାମାନେ, ତୁମେମାନେ ଘରେ କିମ୍ବା ରାସ୍ତାରେ ଯିବା ବେଳେ କ'ଣ ସବୁ ଦେଖୁଛ? କୁହ ତ!" ପରିବେଶ ସମ୍ବନ୍ଧୀୟ ପ୍ରଶ୍ନ ପଚାରିବେ।`
    s1_s = `"ଆମେ ଗାଡ଼ିମୋଟର, ପରିବାର ଲୋକ ଓ ବିଭିନ୍ନ ପରିବେଶ ଦେଖୁଛୁ।"`
    s2_t = `ଦୃଶ୍ୟଚାର୍ଟ ବା ${tlm} ମାଧ୍ୟମରେ ଭଲ ଅଭ୍ୟାସ, ସୁରକ୍ଷା ନିୟମ କିମ୍ବା ପରିବେଶର ଉପାଦାନ ବୁଝାଇବେ।`
    s2_s = `ଚାର୍ଟ ଦେଖିବେ ଏବଂ 'କଣ କରିବା ଉଚିତ' ଓ 'କଣ ଅନୁଚିତ' ତାହା ଭଲଭାବେ ବୁଝିବେ।`
    s3_t = `"ଆସ ଆମେ ସମସ୍ତେ ମିଶି ଏକ ଛୋଟ ଅଭିନୟ (Role play) କରିବା।" ଦଳଗତ ଆଲୋଚନା କରାଇବେ।`
    s3_s = `ସାଙ୍ଗମାନଙ୍କ ସହ ମିଶି ପୋଲିସ/ଡାକ୍ତର/ସ୍ୱଚ୍ଛତା କର୍ମୀ କିମ୍ବା ଭଲ ଅଭ୍ୟାସର ଅଭିନୟ କରିବେ।`
    s4_t = `"ତୁମ କାର୍ଯ୍ୟଫର୍ଦ୍ଦରେ ଥିବା ଠିକ୍ କାର୍ଯ୍ୟକୁ ଚିହ୍ନଟ କରି ଗୋଲ ବୁଲାଅ।"`
    s4_s = `ଠିକ୍ କାର୍ଯ୍ୟରେ ଠିକ୍ ଚିହ୍ନ (✓) ଓ ଭୁଲରେ (✗) ଚିହ୍ନ ପ୍ରଦାନ କରିବେ।`
  }

  const s5_t = `"ଆଜି ଆମେ କ'ଣ ଶିଖିଲେ ତାହାର ପୁନରାଲୋଚନା କରିବା।" କ୍ଲାସ ଶେଷ କରି ଘରପାଠ ପ୍ରଦାନ କରିବେ। ${s5_hw_text}`
  const s5_s = `"ଆମେ ${title} ବିଷୟରେ ଜାଣିଲୁ!" ଉତ୍ତର ଦେବେ ଏବଂ ଗୃହକାର୍ଯ୍ୟ ଟିପିନେବେ।`

  return {
    prastabana: { teacherActivityText: s1_t, studentActivityText: s1_s, timing: '୫ ମିନିଟ୍' },   // ୧. ଅଧୀତି
    anweshana:  { teacherActivityText: s2_t, studentActivityText: s2_s, timing: '୧୫ ମିନିଟ୍' },  // ୨. ବୋଧ
    alochana:   { teacherActivityText: s3_t, studentActivityText: s3_s, timing: '୧୦ ମିନିଟ୍' },  // ୩. ଅଭ୍ୟାସ
    prayoga:    { teacherActivityText: s4_t, studentActivityText: s4_s, timing: '୧୦ ମିନିଟ୍' },  // ୪. ପ୍ରୟୋଗ
    mulyayana:  { teacherActivityText: s5_t, studentActivityText: s5_s, timing: '୫ ମିନିଟ୍' },   // ୫. ପ୍ରସାର
  }
}

async function main() {
  log('Downloading HTML…')
  const res = await fetch(HTML_URL)
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const html = await res.text()
  log('Downloaded', html.length, 'bytes')

  // Extract the rawData backticked string
  const m = html.match(/const\s+rawData\s*=\s*`([\s\S]+?)`/)
  if (!m) throw new Error('Could not find rawData in HTML')
  const rawData = m[1]
  const lines = rawData.split('\n').map(s => s.trim()).filter(Boolean)
  log('Parsed', lines.length, 'period rows')

  // Map to lesson objects
  const lessons = lines.map(line => {
    const [k, title, lo, tlm, type] = line.split('|')
    const period = parseInt(k, 10)
    const loCodes = (lo || '').split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
    const learningOutcomes = title
      ? [`ପିଲାମାନେ '${title}' ସମ୍ପର୍କରେ ସ୍ପଷ୍ଟ ଧାରଣା ପାଇବେ ଏବଂ ବାସ୍ତବ ଜୀବନରେ ପ୍ରୟୋଗ କରିବେ।`]
      : []
    const tlmList = (tlm || '').split(/[,।]/).map(s => s.trim()).filter(Boolean)
    const panchapadi = generateSteps({ title: title || '', tlm: tlm || '', type: type || 'E' })
    return {
      period,
      title: title || `Period ${period}`,
      topic: title || '',
      type: type || 'E',
      loCodes,
      learningOutcomes,
      tlm: tlmList,
      homework: `ଘରେ ପିତାମାତାଙ୍କ ସହ ମିଶି '${title}' ଉପରେ କାର୍ଯ୍ୟ-ଫର୍ଦ୍ଦ ପୂରଣ କରିବେ ଏବଂ ଅଭ୍ୟାସ କରିବେ।`,
      panchapadi,
    }
  })
  log('Built', lessons.length, 'lesson objects')

  // ---- Mongo ----
  const client = new MongoClient(MONGO_URL)
  await client.connect()
  const db = client.db(DB_NAME)

  const cls = await db.collection('classes').findOne({
    $or: [{ name: 'Balvatika' }, { name: /balvatika/i }, { name: /ବାଲବାଟିକା/ }],
  })
  if (!cls) throw new Error('Balvatika class not found')
  log('Balvatika class:', cls.id, cls.name)

  // Clean re-import: drop the existing book + cascading children
  const existingBook = await db.collection('books').findOne({ classId: cls.id, name: BOOK_NAME })
  if (existingBook) {
    log('Existing book found → removing for clean reimport:', existingBook.id)
    const oldChapters = await db.collection('chapters').find({ bookId: existingBook.id }).toArray()
    const oldChapterIds = oldChapters.map(c => c.id)
    if (oldChapterIds.length) {
      const delLessons = await db.collection('lessons').deleteMany({ chapterId: { $in: oldChapterIds } })
      log('  Removed', delLessons.deletedCount, 'old lessons')
      await db.collection('chapters').deleteMany({ id: { $in: oldChapterIds } })
    }
    await db.collection('books').deleteOne({ id: existingBook.id })
  }

  // Create book
  const bookId = randomUUID()
  await db.collection('books').insertOne({
    id: bookId,
    classId: cls.id,
    name: BOOK_NAME,
    description: 'Balvatika 109-period developmental curriculum in Panchapadi format.',
    order: 999,
    createdAt: new Date(), updatedAt: new Date(),
  })
  log('Created book:', bookId)

  // Create one chapter
  const chapterId = randomUUID()
  await db.collection('chapters').insertOne({
    id: chapterId,
    classId: cls.id,
    bookId,
    name: CHAPTER_NAME,
    order: 1,
    createdAt: new Date(), updatedAt: new Date(),
  })
  log('Created chapter:', chapterId)

  // Insert lessons
  const docs = lessons.map(l => ({
    id: randomUUID(),
    classId: cls.id,
    bookId,
    chapterId,
    period: l.period,
    title: l.title,
    topic: l.topic,
    content: '',
    learningOutcomes: l.learningOutcomes,
    loCodes: l.loCodes,
    tlm: l.tlm,
    homework: l.homework,
    panchapadi: l.panchapadi,
    activities: [],
    assessmentQuestions: [],
    teacherNotes: '',
    panchapadiSopana: '',
    worksheet: '',
    createdAt: new Date(), updatedAt: new Date(),
  }))
  if (docs.length) {
    await db.collection('lessons').insertMany(docs)
  }
  log('✅ Inserted', docs.length, 'lessons')

  const finalCount = await db.collection('lessons').countDocuments({ bookId })
  log('Final lesson count under new book:', finalCount)
  await client.close()
  log('Done.')
}

main().catch(e => { console.error('IMPORT FAILED:', e); process.exit(1) })
