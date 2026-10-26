// ============================================================================
//  🔐 Assessment Store — server-side personal-copy PDF stamping (Prompt 4-B).
//  The master Cloudinary URL is NEVER sent to the browser. The server fetches
//  the master PDF, stamps EVERY page with a per-user licence footer (Latin, via
//  DejaVu Sans) + an Odia "no sharing" PNG + a faint diagonal watermark +
//  copy_id in metadata & invisible text, then (best-effort) re-encrypts with a
//  server-only owner password so copy/extract/modify is blocked while printing
//  stays allowed. Encryption is a SECONDARY layer — a failure must never block
//  the download; we then deliver the watermarked-but-unencrypted PDF.
// ============================================================================
import fs from 'fs'
import path from 'path'
import os from 'os'
import { PDFDocument, degrees, rgb } from 'pdf-lib'

// Assets live under public/fonts (already whitelisted in next.config.js
// outputFileTracingIncludes → guaranteed shipped in the standalone build).
const ASSET_DIR = path.join(process.cwd(), 'public', 'fonts')
const FONT_DIR = ASSET_DIR

// -- Cached asset bytes (loaded once per process) ---------------------------
let _regular = null, _bold = null, _odiaPng = null
function loadAssets() {
  if (!_regular) _regular = fs.readFileSync(path.join(FONT_DIR, 'DejaVuSans.ttf'))
  if (!_bold) _bold = fs.readFileSync(path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'))
  if (!_odiaPng) { try { _odiaPng = fs.readFileSync(path.join(ASSET_DIR, 'odia_no_sharing_warning.png')) } catch (_) { _odiaPng = null } }
}

// ASCII-only check (used to decide whether an account name is safe for DejaVu).
const isLatin = (s) => /^[\x00-\x7F]*$/.test(String(s || ''))
const digits = (s) => String(s || '').replace(/\D/g, '')

// Mask a mobile number → "XXXXXX" + last 4 digits.
export function maskMobile(mobile) {
  const d = digits(mobile)
  const last4 = d.slice(-4) || '0000'
  return 'XXXXXX' + last4
}

// Resolve the licence identity from the account + teacher profile.
// name  : profile.name_en → account name (if Latin) → "Teacher {last4}"
// school: profile.school_en → profile.school (if Latin) → "—"
export function buildLicenseIdentity(me = {}, prof = {}, { adminTest = false } = {}) {
  const last4 = digits(me.mobile).slice(-4) || '0000'
  let name = (prof?.name_en || '').trim()
  if (!name) { const acct = (me?.name || '').trim(); name = (acct && isLatin(acct)) ? acct : `Teacher ${last4}` }
  let school = (prof?.school_en || '').trim()
  if (!school) { const s = (prof?.school || '').trim(); school = (s && isLatin(s)) ? s : '—' }
  // Sanitise to characters DejaVu can render safely (drop any stray non-Latin).
  const clean = (s, fb) => { const out = String(s || '').replace(/[^\x20-\x7E]/g, '').trim(); return out || fb }
  name = clean(name, `Teacher ${last4}`)
  school = clean(school, '—')
  return { name, school, mobileMasked: maskMobile(me.mobile), adminTest }
}

// Build the single-line footer licence string.
export function buildFooterText({ name, school, mobileMasked, orderId, copyId, dateStr, adminTest }) {
  const order = orderId ? String(orderId).slice(0, 12) : '—'
  const lead = adminTest ? 'ADMIN TEST COPY — Licensed to' : 'Licensed to'
  return `${lead}: ${name} \u2022 ${school} \u2022 Mob ${mobileMasked} \u2022 Order ${order} \u2022 Copy ${copyId} \u2022 ${dateStr}`
}

// Fit a string into `maxWidth` at `size`; shrink font down to `minSize`, then
// truncate with an ellipsis if still too wide. Returns { text, size }.
function fitText(font, text, maxWidth, size, minSize = 4.5) {
  let s = size
  while (s > minSize && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.25
  if (font.widthOfTextAtSize(text, s) <= maxWidth) return { text, size: s }
  let t = text
  while (t.length > 8 && font.widthOfTextAtSize(t + '…', s) > maxWidth) t = t.slice(0, -1)
  return { text: t + '…', size: s }
}

// -- Main stamping routine ---------------------------------------------------
// pdfBuffer : master PDF bytes (fetched server-side, NO Cloudinary transforms)
// info      : identity from buildLicenseIdentity + { orderId, copyId, dateStr }
// returns   : Buffer of the stamped (not-yet-encrypted) PDF
export async function stampAssessPdf(pdfBuffer, info) {
  loadAssets()
  const fontkit = (await import('@pdf-lib/fontkit')).default
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true, updateMetadata: false })
  pdfDoc.registerFontkit(fontkit)

  const reg = await pdfDoc.embedFont(_regular, { subset: true })
  const bold = await pdfDoc.embedFont(_bold, { subset: true })
  let odiaImg = null, odiaDims = null
  if (_odiaPng) { try { odiaImg = await pdfDoc.embedPng(_odiaPng); odiaDims = { w: odiaImg.width, h: odiaImg.height } } catch (_) { odiaImg = null } }

  const copyId = info.copyId
  const footerText = buildFooterText(info)
  const diagText = `LessonGuruOdisha.in \u2022 ${info.name} \u2022 ${copyId}`
  const grey = rgb(0.42, 0.42, 0.42)

  const pages = pdfDoc.getPages()
  for (const page of pages) {
    const { width, height } = page.getSize()

    // --- Footer band: Odia PNG on the right, licence text on the left ---
    const margin = 20
    const imgH = 7
    let imgW = 0
    if (odiaImg && odiaDims) {
      imgW = imgH * (odiaDims.w / odiaDims.h)
      try {
        page.drawImage(odiaImg, { x: width - margin - imgW, y: 11, width: imgW, height: imgH, opacity: 0.9 })
      } catch (_) { imgW = 0 }
    }
    const avail = Math.max(60, width - margin * 2 - (imgW ? imgW + 8 : 0))
    const fit = fitText(reg, footerText, avail, 6.5, 4.5)
    page.drawText(fit.text, { x: margin, y: 13, size: fit.size, font: reg, color: grey })

    // --- Faint diagonal watermark (never dense enough to cover questions) ---
    const dSize = Math.max(14, Math.min(26, width / 26))
    page.drawText(diagText, {
      x: width * 0.10, y: height * 0.32, size: dSize, font: bold,
      color: rgb(0.5, 0.55, 0.7), opacity: 0.08, rotate: degrees(45),
    })

    // --- Invisible copy_id (opacity 0) for leak tracing in the text layer ---
    page.drawText(`copy:${copyId}`, { x: margin, y: 2, size: 4, font: reg, color: rgb(1, 1, 1), opacity: 0 })
  }

  // --- Metadata: embed copy_id so a leaked file can be traced ---------------
  try {
    pdfDoc.setKeywords([`copy_id:${copyId}`, 'LessonGuruOdisha.in', info.mobileMasked])
    pdfDoc.setSubject(`Personal licensed copy ${copyId} — LessonGuruOdisha.in — redistribution prohibited`)
    pdfDoc.setProducer('LessonGuruOdisha.in Assessment Store')
    pdfDoc.setCreator('LessonGuruOdisha.in')
    pdfDoc.setModificationDate(new Date())
  } catch (_) {}

  const out = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false })
  return Buffer.from(out)
}

// -- Optional owner-password permission layer (best-effort) -----------------
// Allows printing; blocks modify/copy/extract/annotate. Never throws upward —
// on any failure it returns the original (watermarked) buffer + logs a warning.
export async function applyPermissions(stampedBuffer) {
  const owner = process.env.ASSESS_PDF_OWNER_PASSWORD
  if (!owner) return stampedBuffer
  let inPath, outPath
  try {
    // Dynamic import so Next.js file-tracing ships muhammara (+ its native
    // binary) into the standalone build; serverComponentsExternalPackages in
    // next.config.js keeps webpack from bundling it.
    const mod = await import('muhammara')
    const muhammara = mod.default || mod
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lgo-perm-'))
    inPath = path.join(dir, 'in.pdf'); outPath = path.join(dir, 'out.pdf')
    fs.writeFileSync(inPath, stampedBuffer)
    // userProtectionFlag = 4 → printing allowed only (modify/copy/extract off).
    muhammara.recrypt(inPath, outPath, {
      password: '', userPassword: '', ownerPassword: owner, userProtectionFlag: 4,
    })
    const buf = fs.readFileSync(outPath)
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch (_) {}
    return buf && buf.length ? buf : stampedBuffer
  } catch (e) {
    console.warn('[assess-stamp] permission encryption skipped:', e?.message)
    try { if (inPath) fs.rmSync(path.dirname(inPath), { recursive: true, force: true }) } catch (_) {}
    return stampedBuffer
  }
}

// Convenience: stamp + apply permissions in one call.
export async function buildPersonalCopy(pdfBuffer, info) {
  const stamped = await stampAssessPdf(pdfBuffer, info)
  return applyPermissions(stamped)
}
