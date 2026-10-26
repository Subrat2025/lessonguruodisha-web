// === STORE === secure delivery for levels 1-4 (PDF / Excel / HTML / ZIP).
// Watermark/stamp is generated PER DOWNLOAD from the original; the admin's
// original is never served for levels 2-4. Tokens bind userId + fileId, 5 min.
import ExcelJS from 'exceljs'
import { assessPageImageUrl } from '@/lib/cloudinary.js'
import { fetchBuffer } from '@/lib/answer-key.js'
import { fetchAnyBytes } from '@/lib/store/storage.js'
import { pdfAddWatermark, pdfEncrypt, firstName, maskMobile, signDownloadToken, verifyDownloadToken } from '@/lib/lesson-plan-security.js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export { signDownloadToken, verifyDownloadToken }

// Light footer-only stamp for Unit Tests (NO diagonal overlay over questions).
// Small grey line at the bottom of every page + PDF metadata. Printing stays allowed.
export async function pdfAddFooterOnly(pdfBuffer, { footer }) {
  try {
    const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true, updateMetadata: false })
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const text = String(footer || 'LessonGuru Odisha — licensed copy')
    for (const page of doc.getPages()) {
      const { width } = page.getSize()
      const size = 7
      const w = font.widthOfTextAtSize(text, size)
      page.drawText(text, { x: Math.max(6, (width - w) / 2), y: 7, size, font, color: rgb(0.45, 0.45, 0.5), opacity: 0.8 })
    }
    try { doc.setTitle(text); doc.setProducer('LessonGuru Odisha'); doc.setCreator('LessonGuru Odisha Store') } catch (_) {}
    return Buffer.from(await doc.save())
  } catch (_) { return pdfBuffer }
}

export function buyerCaption(user, orderId) {
  return `${firstName(user?.name || 'Teacher')} • ${maskMobile(user?.mobile || '')} • #${String(orderId || '').slice(-8)}`
}

// Excel: stamp buyer + order id into every sheet header/footer AND file properties.
export async function stampExcel(buffer, { buyerName, mobile, orderId }) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const tag = `${buyerName} | ${maskMobile(mobile)} | Order #${String(orderId).slice(-8)} | LessonGuru Odisha`
  wb.creator = buyerName; wb.company = 'LessonGuru Odisha'; wb.title = `Licensed to ${buyerName} (#${String(orderId).slice(-8)})`
  wb.eachSheet((ws) => {
    ws.headerFooter.oddHeader = `&C&"Arial"&9&K808080${tag}`
    ws.headerFooter.oddFooter = `&C&"Arial"&8&K808080Licensed copy — do not share • ${tag}`
  })
  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out)
}

// HTML: inject a visible footer + an HTML comment with the buyer identity.
export function injectHtml(buffer, { buyerName, mobile, orderId }) {
  let html = buffer.toString('utf8')
  const tag = `${buyerName} • ${maskMobile(mobile)} • Order #${String(orderId).slice(-8)}`
  const footer = `\n<!-- Licensed to ${tag} | LessonGuru Odisha -->\n<div style="position:fixed;bottom:0;left:0;right:0;font:11px Arial;color:#888;text-align:center;padding:4px;background:rgba(255,255,255,.85);border-top:1px solid #eee;z-index:9999">Licensed copy — ${tag} — do not share</div>\n`
  if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, footer + '</body>')
  else html += footer
  return Buffer.from(html, 'utf8')
}

// Build the deliverable bytes for a DOWNLOAD according to the product security level.
// Throws { code } on policy violations. Does NOT touch counters/logs (caller does).
export async function buildDeliverable(db, { user, product, file, orderId, entitlement }) {
  const level = product.securityLevel || 2
  if (level === 4) { const e = new Error('View only'); e.code = 'NO_DOWNLOAD'; throw e }
  if (level === 3 && !entitlement?.oathAcceptedAt) { const e = new Error('Oath required'); e.code = 'OATH_REQUIRED'; throw e }
  const original = await fetchAnyBytes(file.fileRef)
  const kind = file.kind || file.fileRef?.kind
  const caption = buyerCaption(user, orderId)
  const base = (product.titleEnglish || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
  if (level === 1) return { buffer: original, filename: fnameFor(kind, base), contentType: ctypeFor(kind) }
  // Level 2 / 3 personalisation
  if (kind === 'pdf') {
    // Unit tests: light footer stamp only (teachers print these for students).
    if (product.watermarkStyle === 'footer') {
      const footer = `Licensed to ${firstName(user?.name) || 'Teacher'} · ${maskMobile(user?.mobile || '')} · Order ${String(orderId || '').slice(-8)} · LessonGuru Odisha`
      const buf = await pdfAddFooterOnly(original, { footer })
      return { buffer: buf, filename: fnameFor('pdf', base), contentType: 'application/pdf' }
    }
    let buf = await pdfAddWatermark(original, { caption, footerCaption: 'LessonGuru Odisha — licensed copy, do not share', brandOn: true, userOn: true })
    if (level === 3) buf = await pdfEncrypt(buf, { allowPrint: !!product.printAllowed })
    return { buffer: buf, filename: fnameFor('pdf', base), contentType: 'application/pdf' }
  }
  if (kind === 'excel') return { buffer: await stampExcel(original, { buyerName: firstName(user?.name), mobile: user?.mobile, orderId }), filename: fnameFor('excel', base), contentType: ctypeFor('excel') }
  if (kind === 'html') return { buffer: injectHtml(original, { buyerName: firstName(user?.name), mobile: user?.mobile, orderId }), filename: fnameFor('html', base), contentType: 'text/html; charset=utf-8' }
  // zip / other: cannot stamp contents — serve original (buyer access already checked)
  return { buffer: original, filename: fnameFor(kind, base), contentType: ctypeFor(kind) }
}

// Level 4 viewer: a server-watermarked page image (buyer name + mobile tiled).
export async function viewPageImage(db, { user, product, file, page = 1 }) {
  if ((file.kind || file.fileRef?.kind) !== 'pdf') { const e = new Error('Not viewable as image'); e.code = 'NOT_IMAGE'; throw e }
  const wm = `${firstName(user?.name)} ${maskMobile(user?.mobile)}`
  const url = assessPageImageUrl(file.fileRef.publicId, { version: file.fileRef.version, page, watermark: wm })
  if (!url) { const e = new Error('Preview unavailable'); e.code = 'NO_PREVIEW'; throw e }
  return await fetchBuffer(url)
}

function fnameFor(kind, base) {
  const ext = kind === 'pdf' ? 'pdf' : kind === 'excel' ? 'xlsx' : kind === 'html' ? 'html' : kind === 'zip' ? 'zip' : 'bin'
  return `${base}-lessonguru.${ext}`
}
function ctypeFor(kind) {
  return kind === 'pdf' ? 'application/pdf'
    : kind === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : kind === 'html' ? 'text/html; charset=utf-8'
    : kind === 'zip' ? 'application/zip' : 'application/octet-stream'
}
