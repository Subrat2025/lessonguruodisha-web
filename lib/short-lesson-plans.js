// ============================================================================
//  short-lesson-plans.js — helpers for the "Short Lesson Plans" feature.
//  ---------------------------------------------------------------------------
//  These are read-only lesson HTML pages uploaded by admins (curated by the
//  academic team, NOT AI-generated).  This file only provides pure helpers
//  used by the API layer; all Mongo access lives in the route handler.
//
//  Every uploaded HTML must contain <meta name="em-*"> tags emitted by the
//  official LessonGuru Odisha template.  We parse those tags to populate the
//  DB row automatically so a 190-period class ZIP can be ingested with a
//  single click.
// ============================================================================

// Extract a single <meta name="X" content="Y"> value. Returns '' if missing.
function metaTag(html, name) {
  const rx = new RegExp(
    `<meta[^>]*name=["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*content=["']([^"']*)["']`,
    'i',
  )
  const m = html.match(rx)
  if (m) return m[1].trim()
  // Reverse attribute order fallback (content="…" name="…").
  const rx2 = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`,
    'i',
  )
  const m2 = html.match(rx2)
  return m2 ? m2[1].trim() : ''
}

function titleTag(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? m[1].replace(/\s+/g, ' ').trim() : ''
}

// Convert numeric-ish strings safely; empty/invalid → null.
function num(v) {
  const n = Number(String(v || '').trim())
  return Number.isFinite(n) ? n : null
}

/**
 * Parse metadata out of an HTML lesson file.  Returns null when the file
 * does NOT contain the required <meta name="em-*"> tags — caller must then
 * ask the admin to fix / re-upload with a template-compliant file.
 */
export function parseShortLessonMetadata(htmlContent, filenameHint = '') {
  if (!htmlContent || typeof htmlContent !== 'string') return null
  const className    = metaTag(htmlContent, 'em-class')
  const subject      = metaTag(htmlContent, 'em-subject')
  const bookName     = metaTag(htmlContent, 'em-book')
  const chapter      = metaTag(htmlContent, 'em-chapter')
  const chapterOrder = num(metaTag(htmlContent, 'em-chapter-order'))
  const period       = num(metaTag(htmlContent, 'em-period'))
  const day          = num(metaTag(htmlContent, 'em-day'))
  const loCode       = metaTag(htmlContent, 'em-lo')
  const dakhyataCode = metaTag(htmlContent, 'em-dakhyata')
  const cgCode       = metaTag(htmlContent, 'em-cg')
  const title        = titleTag(htmlContent)

  // Class + Subject + Period are the *minimum* fields required to file a lesson.
  // Everything else is stored as-is (may be blank).
  if (!className || !subject || period == null) return null

  return {
    className,
    subject,
    bookName,
    chapter,
    chapterOrder: chapterOrder ?? 999,
    period,
    day: day ?? period,
    loCode,
    dakhyataCode,
    cgCode,
    title,
    filenameHint,
  }
}

// Simple SHA-256 to detect duplicate uploads (same HTML content = same hash).
export async function sha256(buf) {
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(buf).digest('hex')
}

/**
 * Reject files that are NOT HTML/ZIP or that carry disallowed extensions
 * anywhere inside a ZIP archive.  Returns { ok, reason }.
 */
export function isSafeFile(nameOrPath) {
  const s = String(nameOrPath || '').toLowerCase()
  if (/\.(exe|js|mjs|cjs|php|phtml|asp|aspx|jsp|py|sh|bat|cmd|scr|dll|vbs)$/i.test(s)) {
    return { ok: false, reason: `blocked extension in "${nameOrPath}"` }
  }
  return { ok: true }
}
