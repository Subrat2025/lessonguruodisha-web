// === ABP === Chapter / year-plan PDF generation.
// Renders the ORIGINAL stored HTML (A4 landscape print CSS) via headless
// Chromium, fixes the wrong toolbar period count + hides the toolbar, then
// stamps a per-teacher watermark (name + masked mobile + doc id) and applies
// owner-password encryption (printing allowed). Base PDF is cached in-memory.
import crypto from 'node:crypto'
import { asciiToOdia } from '@/lib/abp/parse.js'
import { fetchAnyBytes } from '@/lib/store/storage.js'
import { configureCloudinary } from '@/lib/cloudinary.js'
import {
  renderHtmlToPdf, pdfAddWatermark, pdfEncrypt,
  buildWatermarkCaption, maskMobile, firstName, generateUserCode,
} from '@/lib/lesson-plan-security.js'

// In-memory base-PDF cache (un-watermarked). Keyed per chapter + source version.
const BASE_CACHE = new Map()
function cacheKey(chapter) { return `${chapter.id}:${chapter.periodCount}:${new Date(chapter.updatedAt || 0).getTime()}` }
function putCache(k, buf) { BASE_CACHE.set(k, { buf, at: Date.now() }); if (BASE_CACHE.size > 20) { const o = [...BASE_CACHE.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (o) BASE_CACHE.delete(o[0]) } }

// Fix the toolbar: set the real period count + force-hide the toolbar/print bar.
function preprocess(html, realCount) {
  let out = html
  // Replace the #pcount value with the real Odia count.
  out = out.replace(/(<b[^>]*id="pcount"[^>]*>)([\s\S]*?)(<\/b>)/i, `$1${asciiToOdia(realCount)}$3`)
  // Force-hide the toolbar for BOTH screen and print (PDF render uses print media,
  // but this guarantees it never shows even if the print rule is edited later).
  out = out.replace(/<\/head>/i, `<style>.toolbar{display:none!important}</style></head>`)
  return out
}

export async function buildChapterPdf(db, chapter) {
  const key = cacheKey(chapter)
  const hit = BASE_CACHE.get(key)
  if (hit) return hit.buf
  if (!chapter.htmlRef) throw new Error('No source file stored for this chapter')
  configureCloudinary()
  const bytes = await fetchAnyBytes(chapter.htmlRef)
  const html = preprocess(Buffer.from(bytes).toString('utf-8'), chapter.periodCount)
  const pdf = await renderHtmlToPdf(html, { orientation: 'landscape', margin: '6mm' })
  putCache(key, pdf)
  return pdf
}

export async function buildYearPlanPdf(db, yearPlan) {
  const key = `yp:${yearPlan.id}:${new Date(yearPlan.updatedAt || 0).getTime()}`
  const hit = BASE_CACHE.get(key)
  if (hit) return hit.buf
  if (!yearPlan.htmlRef) throw new Error('No source file stored for this year plan')
  configureCloudinary()
  const bytes = await fetchAnyBytes(yearPlan.htmlRef)
  const html = Buffer.from(bytes).toString('utf-8').replace(/<\/head>/i, `<style>.toolbar{display:none!important}</style></head>`)
  const pdf = await renderHtmlToPdf(html, { orientation: 'landscape', margin: '6mm' })
  putCache(key, pdf)
  return pdf
}

// Stamp a per-teacher watermark + encrypt. `title` used for the doc id label.
export async function stampForUser(baseBuf, user, { title = 'ABP' } = {}) {
  const documentId = `LG-ABP-${_ymd()}-${_rand(6)}`
  const footer = `LessonGuru Odisha · ${firstName(user?.name || 'Teacher')} · ${maskMobile(user?.mobile)} · ${documentId} · ${new Date().toISOString().slice(0, 10)}`
  const caption = buildWatermarkCaption({ user, documentId, includeUser: true })
  let out = baseBuf
  try { out = await pdfAddWatermark(baseBuf, { caption, footerCaption: footer, brandOn: true, userOn: true }) } catch (_) {}
  try { out = await pdfEncrypt(out, { allowPrint: true }) } catch (_) {}
  return { buf: out, documentId }
}

function _ymd() { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` }
function _rand(n) { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const b = crypto.randomBytes(n); let s = ''; for (let i = 0; i < n; i++) s += a[b[i] % a.length]; return s }
