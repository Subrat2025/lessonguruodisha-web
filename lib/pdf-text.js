// ============================================================================
//  pdf-text.js — server-side PDF-to-text extraction used by chapter uploads.
//  ---------------------------------------------------------------------------
//  Small wrapper around `pdf-parse` v2 (PDFParse class API) that:
//    • Accepts a Buffer of PDF bytes.
//    • Returns a plain text string, size-capped so a single chapter PDF
//      can never bloat prompt tokens beyond ~30 KB (roughly ~10k tokens).
//    • Swallows internal parser errors and returns '' — text extraction
//      is best-effort and MUST NOT block the upload flow.
//    • Normalises whitespace so the text is compact for LLM ingestion.
//
//  Callers:
//    • Chapter PDF upload  (POST /api/admin/chapters/:id/pdf)
//    • Bulk PDF upload     (POST /api/admin/pdfs/bulk-upload)
//    • Backfill endpoint   (POST /api/admin/chapters/:id/pdf/extract)
// ============================================================================

const MAX_CHARS = 30_000

// Compact multiple whitespace runs, trim, and drop obvious noise (form-feeds,
// zero-width chars). Keeps Odia / Devanagari / English scripts intact.
function normalize(raw) {
  if (!raw) return ''
  return String(raw)
    // Drop control chars (except newline).
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ')
    // Collapse runs of whitespace/newlines to a single space.
    .replace(/[\r\n\t\f\v]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    // Strip zero-width characters.
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
}

/**
 * Extract text content from a PDF buffer.
 * Returns { text, chars, pages, ok, error? } — never throws.
 */
export async function extractPdfText(buffer) {
  if (!buffer || !buffer.length) return { text: '', chars: 0, pages: 0, ok: false, error: 'empty buffer' }
  try {
    // Lazy-load so serverless cold-starts don't pay the price when no PDF is uploaded.
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    // v2 returns { text, numpages, info, metadata }; earlier docs said string.
    const rawText = typeof result === 'string' ? result : (result?.text || '')
    // pdf-parse v2 returns `pages` as an array of { text, num } objects.
    // Legacy pdf-parse (v1) returned `numpages` as an integer. Support both.
    let pages = 0
    if (result && typeof result === 'object') {
      if (typeof result.numpages === 'number') pages = result.numpages
      else if (Array.isArray(result.pages)) pages = result.pages.length
    }
    const cleaned = normalize(rawText).slice(0, MAX_CHARS)
    try { await parser.destroy?.() } catch { /* ignore */ }
    return { text: cleaned, chars: cleaned.length, pages, ok: cleaned.length > 20 }
  } catch (e) {
    return { text: '', chars: 0, pages: 0, ok: false, error: e?.message || String(e) }
  }
}

/**
 * Convenience: returns just the extracted text string (or '' on failure).
 * Useful for callers that don't need diagnostic metadata.
 */
export async function extractPdfTextString(buffer) {
  const r = await extractPdfText(buffer)
  return r.text
}
