// One-off: generate sample blurred answer-key previews (Odia + English) exactly
// like lib/answer-key-preview.js does, and empirically test Cloudinary strict
// transformations. Output JPGs go to /app/public so the user can view them.
import fs from 'fs'
import os from 'os'
import path from 'path'
import https from 'https'
import 'regenerator-runtime/runtime.js'
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { v2 as cloudinary } from 'cloudinary'
import { NOTO_ORIYA_400_B64 } from '../lib/odia-fonts.js'

// ---- load .env ----
const env = fs.readFileSync('/app/.env', 'utf8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2] })
cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true })

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (r) => {
      if (r.statusCode !== 200) { r.resume(); return reject(new Error(`fetch ${r.statusCode}`)) }
      const c = []; r.on('data', d => c.push(d)); r.on('end', () => resolve(Buffer.concat(c)))
    }).on('error', reject)
  })
}
function statusOf(url) {
  return new Promise((resolve) => { https.get(url, (r) => { r.resume(); resolve(r.statusCode) }).on('error', () => resolve(0)) })
}

async function makePdf(title, lines, font) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const f = await pdf.embedFont(Buffer.from(font, 'base64'), { subset: true })
  const page = pdf.addPage([595, 842]) // A4
  let y = 790
  page.drawText(title, { x: 40, y, size: 22, font: f }); y -= 44
  for (const ln of lines) { page.drawText(ln, { x: 40, y, size: 16, font: f }); y -= 30 }
  return Buffer.from(await pdf.save())
}

async function uploadAuth(buf, ext, folder) {
  const fp = path.join(os.tmpdir(), `s_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`)
  fs.writeFileSync(fp, buf)
  try {
    return await new Promise((res, rej) => cloudinary.uploader.upload(fp, { folder, resource_type: ext === 'pdf' ? 'image' : 'image', type: 'authenticated', format: ext === 'pdf' ? undefined : 'jpg', unique_filename: true, use_filename: true, overwrite: false }, (e, r) => e ? rej(e) : res(r)))
  } finally { try { fs.unlinkSync(fp) } catch (_) {} }
}

// Replicate lib/answer-key-preview.js generateBlurredPreview
async function blurPreview(answerRef) {
  const url = cloudinary.url(answerRef.public_id, {
    resource_type: 'image', type: 'authenticated', sign_url: true, secure: true,
    format: 'jpg', page: 1, version: answerRef.version,
    transformation: [{ width: 500, crop: 'fit' }, { effect: 'blur:2000' }, { quality: 30 }],
  })
  return await fetchBuffer(url)
}

async function run() {
  const odiaLines = [
    'ପ୍ରଶ୍ନ ୧:  ଓଡ଼ିଶାର ରାଜଧାନୀ କ’ଣ?',
    'ଉତ୍ତର:  ଭୁବନେଶ୍ୱର ଓଡ଼ିଶାର ରାଜଧାନୀ ଅଟେ।',
    'ପ୍ରଶ୍ନ ୨:  ୨ + ୩ = କେତେ?',
    'ଉତ୍ତର:  ୨ + ୩ = ୫',
    'ପ୍ରଶ୍ନ ୩:  ସୂର୍ଯ୍ୟ କେଉଁ ଦିଗରୁ ଉଦୟ ହୁଏ?',
    'ଉତ୍ତର:  ସୂର୍ଯ୍ୟ ପୂର୍ବ ଦିଗରୁ ଉଦୟ ହୁଏ।',
  ]
  const engLines = [
    'Q1.  What is the capital of Odisha?',
    'Ans:  Bhubaneswar is the capital of Odisha.',
    'Q2.  What is 2 + 3 ?',
    'Ans:  2 + 3 = 5',
    'Q3.  In which direction does the sun rise?',
    'Ans:  The sun rises in the east.',
  ]

  console.log('Building source PDFs...')
  const odiaPdf = await makePdf('ଉତ୍ତର ସୂଚୀ — ଗଣିତ / ସାଧାରଣ ଜ୍ଞାନ', odiaLines, NOTO_ORIYA_400_B64)
  const engPdf = await makePdf('Answer Key — General Knowledge', engLines, NOTO_ORIYA_400_B64)

  console.log('Uploading authenticated source PDFs...')
  const odiaRef = await uploadAuth(odiaPdf, 'pdf', 'lg-answer-key/_sample')
  const engRef = await uploadAuth(engPdf, 'pdf', 'lg-answer-key/_sample')

  console.log('Generating heavily-blurred previews (e_blur:2000,w_500,q_30)...')
  const odiaBlur = await blurPreview(odiaRef)
  const engBlur = await blurPreview(engRef)
  fs.mkdirSync('/app/public', { recursive: true })
  fs.writeFileSync('/app/public/sample-odia-blur.jpg', odiaBlur)
  fs.writeFileSync('/app/public/sample-english-blur.jpg', engBlur)
  console.log('WROTE /app/public/sample-odia-blur.jpg', odiaBlur.length, 'bytes')
  console.log('WROTE /app/public/sample-english-blur.jpg', engBlur.length, 'bytes')

  // Also save a NON-blurred page-1 render for side-by-side (signed) so the user
  // can confirm the source really contained readable text.
  const clearUrl = cloudinary.url(odiaRef.public_id, { resource_type: 'image', type: 'authenticated', sign_url: true, secure: true, format: 'jpg', page: 1, version: odiaRef.version, transformation: [{ width: 500, crop: 'fit' }] })
  fs.writeFileSync('/app/public/sample-odia-clear.jpg', await fetchBuffer(clearUrl))
  const clearUrlE = cloudinary.url(engRef.public_id, { resource_type: 'image', type: 'authenticated', sign_url: true, secure: true, format: 'jpg', page: 1, version: engRef.version, transformation: [{ width: 500, crop: 'fit' }] })
  fs.writeFileSync('/app/public/sample-english-clear.jpg', await fetchBuffer(clearUrlE))
  console.log('WROTE clear reference renders too.')

  // ---- Strict transformations empirical test (PUBLIC asset) ----
  console.log('\n=== Strict transformations test ===')
  const pub = await new Promise((res, rej) => {
    const fp = path.join(os.tmpdir(), `pub_${Date.now()}.jpg`); fs.writeFileSync(fp, odiaBlur)
    cloudinary.uploader.upload(fp, { folder: 'lg-answer-key/_sample', type: 'upload', format: 'jpg', unique_filename: true }, (e, r) => { try { fs.unlinkSync(fp) } catch (_) {}; e ? rej(e) : res(r) })
  })
  // Unsigned transformation URL on a PUBLIC asset. If strict transformations is
  // ON, Cloudinary rejects on-the-fly unsigned transforms (401/400).
  const unsigned = cloudinary.url(pub.public_id, { type: 'upload', secure: true, format: 'jpg', transformation: [{ width: 123, effect: 'blur:50' }] })
  const st = await statusOf(unsigned)
  console.log('unsigned transform URL:', unsigned)
  console.log('HTTP status:', st, st === 200 ? '=> STRICT TRANSFORMATIONS APPEARS OFF (unsigned transform delivered)' : '=> STRICT TRANSFORMATIONS APPEARS ON (unsigned transform blocked)')
  // Cleanup public test asset
  await cloudinary.uploader.destroy(pub.public_id, { type: 'upload', resource_type: 'image' }).catch(() => {})
  console.log('done.')
}
run().catch(e => { console.error('ERROR', e); process.exit(1) })
