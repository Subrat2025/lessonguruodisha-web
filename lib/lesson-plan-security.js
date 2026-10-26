/**
 * Lesson Plan Security Layer
 * -----------------------------------------------------------------
 * ADDITIVE security wrapper that applies ONLY to Lesson Plan PDF and
 * DOCX/Word downloads.  Nothing else in the app (Assessments, Question
 * Papers, Worksheets, etc.) is affected.
 *
 * Responsibilities:
 *  • Generate unique Document IDs (LG-LP-YYYYMMDD-XXXXXX)
 *  • Issue/verify short-lived download tokens (single-use option)
 *  • Add full-page diagonal watermark + user identification footer to PDF
 *  • Apply owner-password encryption via qpdf (restricts print/edit/copy,
 *    users can still open+read without a password prompt)
 *  • Build a Word/DOCX with header/footer watermark and read-only
 *    documentProtection so the file remains valid Word
 *  • Track document records + emit audit-log events on every action
 *  • Enforce admin config toggles (per-format + one-time + expiry + revoked)
 *
 * IMPORTANT: This module MUST NOT be imported from any Assessment /
 * Question Paper / Worksheet code path.  It is scoped to Lesson Plans only.
 */

import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'

// ---------------------------------------------------------------------------
// CONFIG — admin toggles, safely-defaulted
// ---------------------------------------------------------------------------

// Default settings (per user's directive on 2026-08-09).
export const LP_SECURITY_DEFAULTS = {
  allowPdf:         true,   // Show PDF button
  allowWord:        true,   // Show Word/DOCX button
  allowPrint:       true,   // Show Print button
  brandWatermark:   true,   // "LessonGuru Odisha" full-page watermark
  userWatermark:   true,    // Teacher name + user id + doc id + date watermark
  pdfPassword:      true,   // qpdf owner-password encrypt PDFs
  wordProtect:      true,   // Add w:documentProtection read-only inside DOCX
  oneTimeDownload:  false,  // If ON, each doc can only be downloaded once
  expiry:           'off',  // one of: off | 1h | 6h | 24h | 7d | 30d | custom
  customExpiryMs:   0,      // Used when expiry === 'custom'
}

const CONFIG_ID = 'lesson_plan_security__global__v1'

/**
 * Fetches (or lazily-creates) the singleton admin config document.
 * Never throws — returns defaults on failure.
 */
export async function getLessonPlanSecurityConfig(db) {
  try {
    const doc = await db.collection('document_security_config').findOne({ id: CONFIG_ID })
    if (!doc) return { ...LP_SECURITY_DEFAULTS }
    return { ...LP_SECURITY_DEFAULTS, ...(doc.settings || {}) }
  } catch (e) {
    return { ...LP_SECURITY_DEFAULTS }
  }
}

export async function saveLessonPlanSecurityConfig(db, patch, adminUser) {
  const merged = { ...LP_SECURITY_DEFAULTS, ...(patch || {}) }
  // Whitelist keys to prevent field pollution
  const clean = {}
  for (const k of Object.keys(LP_SECURITY_DEFAULTS)) {
    if (merged[k] !== undefined) clean[k] = merged[k]
  }
  await db.collection('document_security_config').updateOne(
    { id: CONFIG_ID },
    {
      $set: {
        id: CONFIG_ID,
        settings: clean,
        updatedAt: new Date(),
        updatedBy: adminUser?.id || null,
      },
    },
    { upsert: true },
  )
  return clean
}

// Per-user override — takes priority over global settings
export async function getUserOverride(db, userId) {
  if (!userId) return null
  try {
    return await db.collection('document_security_user_overrides').findOne({ userId })
  } catch (e) { return null }
}

/**
 * Effective permissions for a user (global config + user override).
 * Never throws — returns defaults on any error.
 */
export async function effectivePermissions(db, userId) {
  const cfg = await getLessonPlanSecurityConfig(db)
  const override = await getUserOverride(db, userId)
  if (!override?.settings) return cfg
  // Override only overrides fields explicitly set
  return { ...cfg, ...override.settings }
}

// ---------------------------------------------------------------------------
// DOC IDS + TOKENS
// ---------------------------------------------------------------------------

function _yyyymmdd(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`
}

function _rand(n = 6) {
  // Uppercase A–Z0–9, no ambiguous chars
  const alph = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  const buf = crypto.randomBytes(n)
  for (let i = 0; i < n; i++) s += alph[buf[i] % alph.length]
  return s
}

export function generateDocumentId() {
  return `LG-LP-${_yyyymmdd()}-${_rand(6)}`
}

export function generateUserCode(userId) {
  // Turn a UUID/user-id into a short readable user code.  Stable per user.
  if (!userId) return 'LG-USR-XXXXXX'
  const h = crypto.createHash('sha1').update(String(userId)).digest('hex').toUpperCase()
  return `LG-USR-${h.slice(0, 6)}`
}

function _tokenSecret() {
  return process.env.LP_DOC_TOKEN_SECRET
    || process.env.JWT_SECRET
    || process.env.NEXTAUTH_SECRET
    || 'lg-lp-doc-secret-fallback'
}

/**
 * Signs a compact download token that carries documentId + userId + expiresAt.
 * Format: base64url(payload) + "." + hex(hmac).  Body is small (no DB round-trip).
 */
export function signDownloadToken({ documentId, userId, expiresAt }) {
  const payload = { d: documentId, u: userId, e: expiresAt }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const mac = crypto.createHmac('sha256', _tokenSecret()).update(body).digest('hex')
  return `${body}.${mac}`
}

export function verifyDownloadToken(token) {
  try {
    if (!token || !token.includes('.')) return null
    const [body, mac] = token.split('.')
    const expected = crypto.createHmac('sha256', _tokenSecret()).update(body).digest('hex')
    // Timing-safe compare
    if (mac.length !== expected.length) return null
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (payload.e && Date.now() > payload.e) return { expired: true, payload }
    return { valid: true, payload }
  } catch (e) {
    return null
  }
}

// ---------------------------------------------------------------------------
// EXPIRY
// ---------------------------------------------------------------------------

export function expiryToMs(expiry, customMs = 0) {
  switch (expiry) {
    case 'off': return null
    case '1h': return 60 * 60 * 1000
    case '6h': return 6 * 60 * 60 * 1000
    case '24h': return 24 * 60 * 60 * 1000
    case '7d': return 7 * 24 * 60 * 60 * 1000
    case '30d': return 30 * 24 * 60 * 60 * 1000
    case 'custom': return Number(customMs) > 0 ? Number(customMs) : null
    default: return null
  }
}

// ---------------------------------------------------------------------------
// USER-FRIENDLY DISPLAY HELPERS
// ---------------------------------------------------------------------------

export function firstName(fullName) {
  if (!fullName) return 'Teacher'
  const clean = String(fullName).trim().split(/\s+/)[0]
    .replace(/^(mr|mrs|miss|dr|shri|smt|sri)\.?$/i, '').trim()
  return clean || 'Teacher'
}

// Mask mobile — never expose full digits in watermark
export function maskMobile(m) {
  if (!m) return ''
  const s = String(m).replace(/\D/g, '')
  if (s.length < 4) return '*'.repeat(s.length)
  return s.slice(0, 2) + '*'.repeat(Math.max(0, s.length - 4)) + s.slice(-2)
}

// Watermark caption (single line, for footer + repeating diagonal)
export function buildWatermarkCaption({ user, documentId, includeUser = true }) {
  const parts = []
  parts.push('LESSONGURU ODISHA')
  if (includeUser && user) {
    parts.push(`For ${firstName(user.name || user.userName || user.email || 'Teacher')}`)
    if (user.id) parts.push(generateUserCode(user.id))
  }
  if (documentId) parts.push(documentId)
  return parts.join(' • ')
}

// ---------------------------------------------------------------------------
// PDF: watermark + encrypt
// ---------------------------------------------------------------------------

/**
 * Adds a repeating diagonal watermark on every page + footer stamp.
 * Input:  original PDF buffer (unencrypted)
 * Output: watermarked PDF buffer (unencrypted).  Call qpdfEncrypt() next.
 *
 * The watermark is drawn under the existing content by inserting it on a
 * separate layer using the standard "opacity" trick — content remains fully
 * readable, watermark is diagonally repeated at ~10% alpha.
 */
export async function pdfAddWatermark(pdfBuffer, { caption, footerCaption, brandOn = true, userOn = true }) {
  if (!brandOn && !userOn) return pdfBuffer
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true, updateMetadata: false })
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const pages = pdfDoc.getPages()
  const text = String(caption || 'LESSONGURU ODISHA').toUpperCase()
  const fontSize = 22
  const opacity = 0.09
  for (const page of pages) {
    const { width, height } = page.getSize()
    // Diagonal repeating watermark — draw at a fixed grid, rotated -30°.
    const gapX = 260
    const gapY = 130
    for (let y = -100; y < height + 200; y += gapY) {
      for (let x = -200; x < width + 200; x += gapX) {
        page.drawText(text, {
          x, y,
          size: fontSize,
          font,
          color: rgb(0.25, 0.28, 0.35),
          opacity,
          rotate: degrees(-30),
        })
      }
    }
    // Small footer stamp — always visible, subtle
    if (footerCaption) {
      const footerFontSize = 7
      const stampWidth = font.widthOfTextAtSize(footerCaption, footerFontSize)
      page.drawText(footerCaption, {
        x: Math.max(6, (width - stampWidth) / 2),
        y: 6,
        size: footerFontSize,
        font,
        color: rgb(0.4, 0.4, 0.45),
        opacity: 0.75,
      })
    }
  }
  return Buffer.from(await pdfDoc.save())
}

/**
 * Applies qpdf owner-password encryption.  Users can still OPEN the PDF
 * without any password (no user password prompt), but printing/editing/
 * copying/extracting are restricted at the PDF-viewer level.
 *
 * Returns encrypted buffer.  On qpdf failure, returns the input unchanged
 * (graceful degradation — never breaks the download).
 */
export async function pdfEncrypt(pdfBuffer, { allowPrint = false } = {}) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lg-lp-pdf-'))
  const inFile = path.join(tmpDir, 'in.pdf')
  const outFile = path.join(tmpDir, 'out.pdf')
  try {
    await fs.writeFile(inFile, pdfBuffer)
    // Random 32-byte owner password (never persisted, never shown to users)
    const ownerPass = crypto.randomBytes(24).toString('base64')
    // Use qpdf's --encrypt syntax: user-password="" owner-password=<random>
    // Restrictions:
    //  --print=none     : block printing (or 'low-res' if allowPrint true)
    //  --modify=none    : block edit
    //  --extract=n      : block text/image extraction
    //  --annotate=n     : block adding annotations
    //  128              : 128-bit AES key length (widely supported)
    // Note: qpdf 11+ rejects 128-bit as "weak". Using 256 which is the current
    // recommended default and is supported by all modern PDF viewers.
    const args = [
      '--encrypt', '', ownerPass, '256',
      allowPrint ? '--print=low' : '--print=none',
      '--modify=none',
      '--extract=n',
      '--annotate=n',
      '--',
      inFile,
      outFile,
    ]
    await new Promise((resolve, reject) => {
      execFile('/usr/bin/qpdf', args, { timeout: 20000 }, (err) => (err ? reject(err) : resolve()))
    })
    const encrypted = await fs.readFile(outFile)
    return encrypted
  } catch (e) {
    console.warn('[lesson-plan-security] qpdf encrypt failed, returning unencrypted:', e?.message)
    return pdfBuffer
  } finally {
    try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// PDF: render HTML → PDF via puppeteer (chromium)
// ---------------------------------------------------------------------------

/**
 * Renders the given HTML string into a PDF buffer using headless chromium.
 * Landscape A4 by default (Lesson Plans are landscape).  Returns the raw PDF
 * buffer, unencrypted.  Callers should apply watermark + encrypt afterwards.
 *
 * NOTE: puppeteer/chromium is required.  If unavailable in the current env
 * (e.g. certain production images), this throws — callers should catch and
 * fall back to client-side generation.
 */
export async function renderHtmlToPdf(html, { orientation = 'landscape', margin = '8mm', fitPages = 0, hideSelector = '' } = {}) {
  const puppeteer = (await import('puppeteer')).default
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
    || (await _resolveChromium())
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
  })
  try {
    const page = await browser.newPage()
    // Use 'load' + explicit fonts.ready wait instead of 'networkidle0' —
    // matches the assessment/question-paper pipeline in lib/pdf.js.  Odia
    // fonts are base64-embedded so we don't need to wait for network
    // silence.  60s timeout since long lesson plans with many activities +
    // watermark + full Odia rendering can take 15-25s on prod.
    page.setDefaultNavigationTimeout(60000)
    page.setDefaultTimeout(60000)
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 })
    // Wait for all @font-face declarations (embedded base64 + Google Fonts)
    // to finish loading so Odia glyphs render as proper script, not tofu.
    try {
      await Promise.race([
        page.evaluate(() => document.fonts && document.fonts.ready),
        new Promise(res => setTimeout(res, 5000)), // 5s hard cap on fonts.ready
      ])
    } catch (_err) { /* older chromium — skip */ }
    const render = (p) => p.pdf({
      format: 'A4',
      landscape: orientation === 'landscape',
      printBackground: true,
      margin: { top: margin, right: margin, bottom: margin, left: margin },
      preferCSSPageSize: true,
    })
    // fitPages > 0: shrink until the document uses exactly that many pages (1 lesson plan = 1 page)
    if (fitPages > 0) {
      const { renderFitted } = await import('./pdf-fit.js')
      return await renderFitted(page, render, fitPages, { hideSelector })
    }
    return Buffer.from(await render(page))
  } finally {
    try { await browser.close() } catch (_) {}
  }
}

async function _resolveChromium() {
  const candidates = ['/root/bin/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome']
  for (const p of candidates) {
    try { await fs.access(p); return p } catch (_) {}
  }
  return undefined
}

// ---------------------------------------------------------------------------
// DOCX / Word: assemble a Word file with watermark header/footer +
// documentProtection ("Read-Only" recommended).  Uses the safe "Word HTML"
// (application/msword MHTML) form the app already uses, but wraps it with
// a proper cover header showing Doc ID + Teacher + Date, plus footer credit.
// We inject Word field code for a diagonal WordArt watermark.
// ---------------------------------------------------------------------------

/**
 * Builds the final DOCX/Word MHTML output.  Prepends a small "Document Info"
 * table (Teacher, User ID, Doc ID, Generated) and adds a repeating diagonal
 * WordArt watermark via Word's mso-wm-* fields.  The existing lesson-plan
 * content is untouched — we simply wrap it.
 *
 * IMPORTANT: This function DOES NOT change the existing lesson content or
 * layout.  It only wraps it with header, footer, and background watermark
 * pieces that Microsoft Word understands.  Google Docs / LibreOffice will
 * still open the file cleanly.
 */
export function wrapLessonPlanWord(innerHtml, {
  documentId,
  user,
  brandOn = true,
  userOn = true,
  wordProtect = true,
  generatedAt = new Date(),
}) {
  const teacher = firstName(user?.name || user?.userName || 'Teacher')
  const userCode = generateUserCode(user?.id)
  const genDate = generatedAt.toISOString().slice(0, 10)
  const wmText = brandOn ? `LESSONGURU ODISHA${userOn ? ' — ' + teacher : ''}` : ''
  // documentProtection: read-only (edit=readOnly, enforcement=1)
  // Placed inside the settings.xml section for compatibility.
  const protection = wordProtect
    ? `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DocumentProtection><w:Enforcement w:val="1"/><w:Formatting w:val="0"/><w:Edit w:val="readOnly"/></w:DocumentProtection></w:WordDocument></xml><![endif]-->`
    : ''
  // Diagonal WordArt watermark (Word's older printable-header-watermark)
  const watermark = wmText
    ? `<v:background id="_x0000_s1025" o:bwmode="white" fillcolor="#e8e8e8">
         <v:fill color2="#ffffff" focussize="0,0" focusposition="0,0" type="gradient"/>
       </v:background>
       <div style="mso-element:header" id="wh">
         <p><v:shape id="Watermark" style="position:absolute;left:0;top:0;width:600pt;height:80pt;z-index:-1;visibility:visible;mso-position-horizontal-relative:margin;mso-position-vertical-relative:margin;rotation:-30" allowincell="t" type="#_x0000_t136" fillcolor="#dddddd" strokecolor="#dddddd">
           <v:textpath style="font-family:&quot;Calibri&quot;;font-weight:bold;font-size:1" string="${wmText.replace(/"/g, '&quot;')}"/>
         </v:shape></p>
       </div>`
    : ''
  const header = `
    <table style="width:100%;border-collapse:collapse;font-size:9pt;color:#334155;margin-bottom:6pt;border:1pt solid #cbd5e1;background:#f8fafc">
      <tr>
        <td style="padding:4pt 8pt;font-weight:700;border-right:1pt solid #cbd5e1;width:15%">LessonGuru Odisha</td>
        <td style="padding:4pt 8pt"><b>Generated for:</b> ${teacher}</td>
        <td style="padding:4pt 8pt"><b>User ID:</b> ${userCode}</td>
        <td style="padding:4pt 8pt"><b>Document ID:</b> ${documentId}</td>
        <td style="padding:4pt 8pt"><b>Date:</b> ${genDate}</td>
      </tr>
    </table>
  `
  const footer = `
    <p style="margin-top:16pt;font-size:8pt;color:#64748b;text-align:center;border-top:1pt solid #cbd5e1;padding-top:6pt">
      Generated by LessonGuru Odisha for authorized educational use.
      Unauthorized redistribution or commercial sharing is prohibited.
      &nbsp;&nbsp;<b>${documentId}</b>
    </p>
  `
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>Lesson Plan · ${documentId}</title>
  ${protection}
  <style>
    @page { size: A4 landscape; margin: 8mm; mso-page-orientation: landscape; }
    body { font-family: 'Calibri', 'Noto Sans Oriya', sans-serif; font-size: 11pt; color: #000; }
    table { border-collapse: collapse; width: 100%; }
    td, th { word-break: normal; overflow-wrap: break-word; }
  </style>
</head>
<body>
${watermark}
${header}
${innerHtml}
${footer}
</body>
</html>`
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

const COLL_DOCS = 'lesson_plan_documents'
const COLL_LOGS = 'lesson_plan_download_logs'

/**
 * Creates a new secure Lesson Plan document record.  Returns the record
 * (including a short-lived signed download token) but does NOT return the
 * generated file itself.
 */
export async function createLessonPlanDocument(db, {
  userId, userName, userMobile,
  format,            // 'pdf' | 'docx'
  lessonMeta,        // { classId, className, bookId, bookName, chapterId, chapterName, period, title }
  cfg,               // effective permissions (see effectivePermissions())
}) {
  const documentId = generateDocumentId()
  const now = Date.now()
  const expiryMs = expiryToMs(cfg.expiry, cfg.customExpiryMs)
  const expiresAt = expiryMs ? now + expiryMs : null

  const token = signDownloadToken({ documentId, userId, expiresAt: expiresAt || (now + 60 * 60 * 1000) })
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const doc = {
    id: documentId,
    userId,
    resourceType: 'lesson_plan',
    format,
    lesson: lessonMeta || null,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    oneTimeDownload: !!cfg.oneTimeDownload,
    downloadStatus: 'active',     // active | used | expired | revoked
    downloadedAt: null,
    downloadCount: 0,
    revokedAt: null,
    revokedBy: null,
    watermarkOn: !!(cfg.brandWatermark || cfg.userWatermark),
    pdfPassword: !!cfg.pdfPassword,
    wordProtect: !!cfg.wordProtect,
    userSnapshot: {
      userName: firstName(userName || ''),
      userCode: generateUserCode(userId),
      mobileMasked: maskMobile(userMobile),
    },
    tokenHash,   // stored for revocation audit; token itself never persisted
  }
  await db.collection(COLL_DOCS).insertOne(doc)
  await logDownload(db, { userId, documentId, format, action: 'GENERATED' })
  // Idempotent indexes
  if (!global.__lgLpDocIdx) {
    global.__lgLpDocIdx = true
    Promise.allSettled([
      db.collection(COLL_DOCS).createIndex({ id: 1 }, { unique: true, name: 'id_1' }),
      db.collection(COLL_DOCS).createIndex({ userId: 1, createdAt: -1 }, { name: 'user_recent' }),
      db.collection(COLL_DOCS).createIndex({ downloadStatus: 1, expiresAt: 1 }, { name: 'status_exp' }),
      db.collection(COLL_LOGS).createIndex({ documentId: 1, timestamp: -1 }, { name: 'doc_time' }),
      db.collection(COLL_LOGS).createIndex({ userId: 1, timestamp: -1 }, { name: 'user_time' }),
    ]).catch(() => {})
  }
  return { document: doc, token }
}

export async function findLessonPlanDocument(db, documentId) {
  return db.collection(COLL_DOCS).findOne({ id: documentId })
}

/**
 * Returns { ok: true, doc } if the document can be downloaded by the caller,
 * else { ok: false, code, message, doc? } — the caller should map code to
 * the correct HTTP status (403/410/etc.).
 */
export async function checkDownloadEligibility(db, {
  documentId, callerUserId, format,
}) {
  const doc = await findLessonPlanDocument(db, documentId)
  if (!doc) return { ok: false, code: 'NOT_FOUND', status: 404, message: 'Document not found' }
  if (doc.userId !== callerUserId) return { ok: false, code: 'FORBIDDEN', status: 403, message: 'This document belongs to another user', doc }
  if (doc.format !== format) return { ok: false, code: 'FORMAT_MISMATCH', status: 400, message: `Requested ${format} but document is ${doc.format}`, doc }
  if (doc.downloadStatus === 'revoked') return { ok: false, code: 'REVOKED', status: 403, message: '🔒 This document has been revoked by the administrator.', doc }
  if (doc.expiresAt && new Date(doc.expiresAt).getTime() < Date.now()) {
    return { ok: false, code: 'EXPIRED', status: 410, message: '🔒 This Lesson Plan download link has expired. Please generate a new copy.', doc }
  }
  if (doc.oneTimeDownload && doc.downloadStatus === 'used') {
    return { ok: false, code: 'ALREADY_USED', status: 410, message: '🔒 This Lesson Plan download has already been used. Please generate a new copy.', doc }
  }
  return { ok: true, doc }
}

export async function markLessonPlanDownloaded(db, documentId, { action = 'DOWNLOAD_SUCCESS' } = {}) {
  const doc = await findLessonPlanDocument(db, documentId)
  if (!doc) return null
  const update = {
    $set: {
      downloadedAt: doc.downloadedAt || new Date(),
      updatedAt: new Date(),
      ...(doc.oneTimeDownload ? { downloadStatus: 'used' } : {}),
    },
    $inc: { downloadCount: 1 },
  }
  await db.collection(COLL_DOCS).updateOne({ id: documentId }, update)
  await logDownload(db, {
    userId: doc.userId,
    documentId,
    format: doc.format,
    action,
  })
  return doc
}

export async function revokeLessonPlanDocument(db, documentId, adminUser, reason = '') {
  const doc = await findLessonPlanDocument(db, documentId)
  if (!doc) return null
  await db.collection(COLL_DOCS).updateOne(
    { id: documentId },
    {
      $set: {
        downloadStatus: 'revoked',
        revokedAt: new Date(),
        revokedBy: adminUser?.id || null,
        revokedReason: reason || null,
        updatedAt: new Date(),
      },
    },
  )
  await logDownload(db, {
    userId: doc.userId,
    documentId,
    format: doc.format,
    action: 'ADMIN_REVOKED',
    meta: { by: adminUser?.id, reason },
  })
  return true
}

export async function logDownload(db, { userId, documentId, format, action, meta, ip, userAgent }) {
  try {
    await db.collection(COLL_LOGS).insertOne({
      id: crypto.randomUUID(),
      userId: userId || null,
      documentId: documentId || null,
      resourceType: 'lesson_plan',
      format: format || null,
      action,       // GENERATED | DOWNLOAD_SUCCESS | DOWNLOAD_BLOCKED | EXPIRED | ALREADY_USED | ADMIN_REVOKED | TOKEN_INVALID
      timestamp: new Date(),
      ip: ip || null,
      userAgent: userAgent || null,
      meta: meta || null,
    })
  } catch (e) {
    console.warn('[lesson-plan-security] log failed:', e?.message)
  }
}

// ---------------------------------------------------------------------------
// EMBEDDED ODIA FONT — loaded once at module init and reused for every
// printable HTML render.  Without embedding, mobile browsers that lack
// Noto Sans Oriya (default on many Android devices) render every Odia
// glyph as a tofu □ box in the browser-generated fallback PDF.
// The base64-encoded TTF is inlined via @font-face so both native browser
// print AND html2canvas capture (mobile client-side fallback) get correct
// glyphs.  Same pattern already proven in worksheet-html.js + question-paper-html.js.
// ---------------------------------------------------------------------------
let _odiaFontCSSCache = null
export function loadOdiaFontCSS() {
  if (_odiaFontCSSCache !== null) return _odiaFontCSSCache
  // Try many roots — in a Next.js standalone deploy, /app is repackaged
  // and the public/ directory may sit alongside the compiled server
  // rather than under /app.  These candidates cover: dev, standalone,
  // and a system-installed Noto font fallback.
  const cwd = (() => { try { return process.cwd() } catch (_) { return '' } })()
  const fontDirs = [
    '/app/public/fonts',
    cwd ? path.join(cwd, 'public/fonts') : '',
    cwd ? path.join(cwd, '.next/standalone/public/fonts') : '',
    cwd ? path.join(cwd, '../public/fonts') : '',                  // when cwd is .next/standalone
    '/usr/share/fonts/truetype/noto',
  ].filter(Boolean)
  const loadWeight = (dirs, names) => {
    for (const dir of dirs) {
      for (const name of names) {
        try {
          const p = path.join(dir, name)
          const b64 = readFileSync(p).toString('base64')
          if (b64 && b64.length > 1000) {
            console.log('[lesson-plan-security] loaded Odia font:', p, '(base64 kB:', Math.round(b64.length / 1024), ')')
            return b64
          }
        } catch (_) { /* try next */ }
      }
    }
    return null
  }
  const regular = loadWeight(fontDirs, ['NotoSansOriya-Regular.ttf', 'NotoSansOriyaUI-Regular.ttf'])
  const bold    = loadWeight(fontDirs, ['NotoSansOriya-Bold.ttf',    'NotoSansOriyaUI-Bold.ttf'])
  // ALSO embed Devanagari so Hindi lesson plans (स्वर वर्ण पहचान …) render
  // real glyphs instead of tofu boxes (□□□□).  Optional — if the Devanagari
  // TTFs are missing we still emit the Odia faces.
  const devRegular = loadWeight(fontDirs, ['NotoSansDevanagari-Regular.ttf'])
  const devBold    = loadWeight(fontDirs, ['NotoSansDevanagari-Bold.ttf'])
  if (!regular && !bold && !devRegular && !devBold) {
    console.warn('[lesson-plan-security] Odia/Devanagari fonts NOT FOUND in any of:', fontDirs.join(', '), '— Indic text will render as tofu on devices without Noto fonts installed')
    _odiaFontCSSCache = ''
    return ''
  }
  const face = (family, w, b64) => b64
    ? `@font-face { font-family: '${family}'; font-weight: ${w}; font-style: normal; font-display: block; src: url(data:font/ttf;base64,${b64}) format('truetype'); }`
    : ''
  _odiaFontCSSCache = [
    face('Noto Sans Oriya Embedded', 400, regular),
    face('Noto Sans Oriya Embedded', 700, bold || regular),
    face('Noto Sans Devanagari Embedded', 400, devRegular),
    face('Noto Sans Devanagari Embedded', 700, devBold || devRegular),
  ].filter(Boolean).join('\n')
  return _odiaFontCSSCache
}

// ---------------------------------------------------------------------------
// FALLBACK PRINTABLE HTML  —  used when server-side puppeteer/qpdf is
// unavailable (e.g. certain production images).  We build a self-contained
// HTML document that renders IDENTICALLY to the secure PDF: full-page
// diagonal watermark drawn with CSS + user identification header + footer.
// The browser prints it to PDF via window.print(), which is triggered
// automatically by the frontend fallback path.
// ---------------------------------------------------------------------------
export function wrapLessonPlanPrintableHtml(innerHtml, {
  documentId,
  user,
  brandOn = true,
  userOn = true,
  generatedAt = new Date(),
  autoPrint = true,
  orientation = 'landscape',
} = {}) {
  const teacher = firstName(user?.name || user?.userName || 'Teacher')
  const userCode = generateUserCode(user?.id)
  const genDate = generatedAt.toISOString().slice(0, 10)
  const wmText = brandOn
    ? `LESSONGURU ODISHA${userOn ? ' • ' + teacher + ' • ' + userCode : ''}${documentId ? ' • ' + documentId : ''}`
    : ''
  const showWatermark = !!wmText
  const footerCaption = `LessonGuru Odisha · Generated for ${teacher} · ${userCode} · ${documentId} · ${genDate} — For authorized educational use only.`

  // Build a data-URL SVG watermark that repeats via CSS `background-image`.
  // This approach tiles across every printed page AND is captured correctly
  // by html2canvas (used by the mobile client-side PDF fallback).
  // A pure `position:fixed` div only shows on the first page in html2canvas.
  const svgWm = showWatermark
    ? (() => {
        const t = wmText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='560' height='280'>
          <g transform='rotate(-30 280 140)' fill='rgba(15,23,60,0.075)' font-family='Inter, Arial, sans-serif' font-weight='700' font-size='20' letter-spacing='1.2'>
            <text x='0' y='90'>${t}</text>
            <text x='0' y='220'>${t}</text>
          </g>
        </svg>`
        return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
      })()
    : 'none'

  // CSS-based repeating diagonal watermark using a fixed pseudo-element on
  // <body>.  Works in Chrome/Safari/Firefox print.  We render text into a
  // rotated flex grid that tiles the whole page.
  const wmBlock = showWatermark
    ? `<div class="lg-wm" aria-hidden="true">
         ${Array.from({ length: 60 }).map(() => `<span>${wmText.replace(/</g, '&lt;')}</span>`).join('')}
       </div>`
    : ''
  const printScript = autoPrint
    ? `<script>
        window.addEventListener('load', function(){
          setTimeout(function(){ try { window.focus(); window.print(); } catch(_){} }, 250);
        });
        window.addEventListener('afterprint', function(){
          try { window.close(); } catch(_){}
        });
      </script>`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Lesson Plan · ${documentId || ''}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    ${loadOdiaFontCSS()}
    @page { size: A4 ${orientation}; margin: 8mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'Noto Sans Oriya Embedded', 'Noto Sans Devanagari Embedded', 'Inter', 'Noto Sans Oriya UI', 'Noto Sans Oriya', 'Noto Sans Devanagari', 'Kalinga', 'Lohit Odia', 'Nirmala UI', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', system-ui, -apple-system, 'Segoe UI', sans-serif;
      color: #000; font-size: 11pt; background-color: #fff;
      background-image: ${svgWm};
      background-repeat: repeat;
      background-position: 0 0;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
      position: relative;
      text-rendering: optimizeLegibility;
      font-feature-settings: "liga" 1, "kern" 1;
    }
    .lg-page { padding: 6mm 4mm; position: relative; z-index: 1; }
    .lg-sec-header {
      display: flex; align-items: center; gap: 8px; padding: 6px 10px;
      border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 6px;
      font-size: 10pt; margin-bottom: 8px;
    }
    .lg-sec-header b { color: #0f172a; }
    .lg-sec-header .sep { color: #94a3b8; }
    .lg-footer {
      margin-top: 14pt; padding-top: 6pt;
      border-top: 1px solid #cbd5e1;
      font-size: 8pt; color: #64748b; text-align: center;
    }
    .lg-footer b { color: #334155; }
    /* Diagonal repeating watermark tiled across the whole page */
    .lg-wm {
      position: fixed; inset: -20% -10%; z-index: 0; pointer-events: none;
      transform: rotate(-30deg); transform-origin: center center;
      display: flex; flex-wrap: wrap; gap: 30px 60px;
      justify-content: space-around; align-content: space-around;
      overflow: hidden;
    }
    .lg-wm span {
      font-family: 'Inter', system-ui, sans-serif;
      font-weight: 800; font-size: 18pt; color: rgba(20, 30, 60, 0.09);
      white-space: nowrap; letter-spacing: 1.2px;
      user-select: none;
    }
    /* Ensure the watermark also prints */
    @media print {
      .lg-wm { position: fixed; }
      .lg-noprint { display: none !important; }
    }
    table { border-collapse: collapse; }
  </style>
</head>
<body>
${wmBlock}
<div class="lg-page">
  <div class="lg-sec-header">
    <b>LessonGuru Odisha</b>
    <span class="sep">•</span>
    <span><b>Teacher:</b> ${teacher}</span>
    <span class="sep">•</span>
    <span><b>User ID:</b> ${userCode}</span>
    <span class="sep">•</span>
    <span><b>Document ID:</b> ${documentId || ''}</span>
    <span class="sep">•</span>
    <span><b>Date:</b> ${genDate}</span>
  </div>
  ${innerHtml}
  <div class="lg-footer">${footerCaption}</div>
</div>
${printScript}
</body>
</html>`
}

// Export collection names so route handlers can query directly for admin lists
export const LP_COLLECTIONS = { docs: COLL_DOCS, logs: COLL_LOGS }
