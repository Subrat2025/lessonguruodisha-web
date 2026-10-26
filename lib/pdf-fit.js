// Fit a rendered document onto an exact number of PDF pages (e.g. one lesson plan = one A4 page).
// Works with any @page size / margins: it renders, counts the pages, shrinks the content with CSS
// zoom and renders again until the page count matches (or the content would become unreadable).
import { PDFDocument } from 'pdf-lib'

export const MIN_ZOOM = 0.42 // below this Odia text is too small to read; we stop shrinking

/** Number of lesson plans in an HTML document (each one ends with the headmaster's signature). */
export function countLessonSheets(html) {
  const n = (String(html).match(/ପ୍ରଧାନ ଶିକ୍ଷକଙ୍କ ସ୍ୱାକ୍ଷର/g) || []).length
  return Math.max(1, n)
}

/**
 * @param {import('puppeteer').Page} page  page with the content already loaded
 * @param {(page) => Promise<Uint8Array>} renderPdf  renders the page to PDF bytes (page.pdf({...}))
 * @param {number} targetPages
 * @param {object} [o] { hideSelector: CSS selector to hide while fitting (e.g. extra pages) }
 */
export async function renderFitted(page, renderPdf, targetPages = 1, o = {}) {
  const css = [
    // keep each lesson's own page breaks, but nothing may force extra pages inside it
    'tr, td, th, p, li, div { break-inside: auto !important; page-break-inside: auto !important; }',
    o.hideSelector ? `${o.hideSelector} { display: none !important; }` : '',
  ].join('\n')
  await page.addStyleTag({ content: css })
  const tryZoom = async (z) => {
    await page.evaluate((v) => { document.body.style.zoom = String(v) }, z)
    const buf = await renderPdf(page)
    return { buf, pages: (await PDFDocument.load(buf, { ignoreEncryption: true })).getPageCount() }
  }
  // 1) full size first; most lesson plans already fit
  let r = await tryZoom(1)
  if (r.pages <= targetPages) return Buffer.from(r.buf)
  // 2) shrink until it fits (or would become unreadable)
  let hi = 1, lo = 1, best = r
  for (let i = 0; i < 5; i++) {
    lo = Math.max(MIN_ZOOM, lo * Math.min(0.92, (targetPages / r.pages) * 1.15))
    r = await tryZoom(lo)
    if (r.pages <= targetPages) { best = r; break }
    hi = lo; best = r
    if (lo <= MIN_ZOOM) return Buffer.from(best.buf)
  }
  // 3) grow back as large as possible while it still fits (binary search, ~1% precision)
  for (let i = 0; i < 6 && hi - lo > 0.01; i++) {
    const mid = (lo + hi) / 2
    const m = await tryZoom(mid)
    if (m.pages <= targetPages) { lo = mid; best = m } else hi = mid
  }
  await page.evaluate((v) => { document.body.style.zoom = String(v) }, lo)
  return Buffer.from(best.buf)
}
