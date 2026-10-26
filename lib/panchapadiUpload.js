// ============================================================
//  Panchapadi HTML Lesson Uploads · parser + storage helpers
// ------------------------------------------------------------
//  Parses <meta em-*> tags from a teacher-filled Panchapadi HTML
//  template and stores the raw HTML + extracted metadata in Mongo.
//  Rendered separately from the built-in lesson pipeline as a new
//  "Panchapadi HTML Lessons" tool.  Nothing here touches existing
//  chapter/lesson data.
// ============================================================

// Extract <meta name="em-X" content="Y"> pairs from raw HTML.
// Regex-based (no DOM) so it runs in Node without jsdom.
//
// Special-case: when a key appears multiple times (typical for
// `em-period` in a multi-period bundle: 1, 2, 3, … 20), we collect
// ALL values into `<key>List` alongside preserving the last-value
// behaviour on the base key for backwards compatibility.
export function extractEmMeta(html) {
  const out = {}
  const lists = {}
  if (!html || typeof html !== 'string') return out
  const push = (key, val) => {
    if (!(key in out)) out[key] = val
    if (!lists[key]) lists[key] = []
    lists[key].push(val)
  }
  const rx = /<meta[^>]*name\s*=\s*["']em-([a-z-]+)["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/gi
  let m
  while ((m = rx.exec(html))) push(m[1], String(m[2] || '').trim())
  // Also handle the reversed order (content before name).
  const rx2 = /<meta[^>]*content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']em-([a-z-]+)["'][^>]*>/gi
  while ((m = rx2.exec(html))) push(m[2], String(m[1] || '').trim())

  // Expose the multi-value lists as `<key>List`.  Callers that need to
  // know EVERY period declared in the file (1, 2, 3, …, 20) should read
  // `em.periodList`.  The single-value `em.period` still returns the
  // FIRST declared value for back-compat.
  for (const [k, arr] of Object.entries(lists)) {
    if (arr.length > 1) out[`${k}List`] = arr
  }
  // For period, also parse compact-range form ("1-24") into an
  // expanded list on periodList when no explicit list exists.
  if (!out.periodList && typeof out.period === 'string') {
    const rangeMatch = out.period.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/)
    if (rangeMatch) {
      const lo = Number(rangeMatch[1]), hi = Number(rangeMatch[2])
      if (lo > 0 && hi >= lo && hi - lo < 200) {
        out.periodList = []
        for (let n = lo; n <= hi; n++) out.periodList.push(String(n))
      }
    }
  }
  return out
}

// Detect Panchapadi multi-period bundles.  Supports THREE shapes:
//   1) `<!-- PERIOD N -->` HTML-comment markers (Gemini-style)
//   2) `<div class="page">…</div>` blocks (Odisha official template)
//   3) `<section data-period="N">…</section>` / `<article data-period="N">`
//
// Splits the file into an array of per-period documents, each wrapped in
// the original `<head>…</head>` so styles carry over.  Returns [] if no
// bundle markers are found (i.e. a single-period file).
export function splitPeriodBundle(html) {
  if (!html || typeof html !== 'string') return []

  // ── Shape 1 · HTML comment markers ───────────────────────────
  const markerRx = /<!--\s*PERIOD\s+(\d+)[^>]*-->/gi
  const markers = []
  let m
  while ((m = markerRx.exec(html))) markers.push({ period: Number(m[1]), start: m.index, endOfMarker: m.index + m[0].length })
  if (markers.length >= 2) {
    return _splitByRanges(html, markers.map(x => ({ period: x.period, start: x.endOfMarker, end: null })))
  }

  // ── Shape 2 · `<div class="page">…</div>` blocks ────────────
  // Odisha official template puts every period inside a `.page` div
  // with body text like "Period 3 of 20" or "Period 3/20" (English +
  // Odia digits supported).
  //
  // Multi-period bundles often begin with a chapter-overview "front-
  // matter" `.page` block that has NO period marker (contains a
  // curriculum molist, LO alignment map, etc.).  We MUST skip those
  // blocks — otherwise the front-matter falls back to `period=1` and
  // its huge body wins the de-dup vs. the real Period 1 block.
  const pageBlocks = _findBalancedBlocks(html, /<div\b[^>]*class\s*=\s*["'][^"']*\bpage\b[^"']*["'][^>]*>/gi, '</div>')
  if (pageBlocks.length >= 2) {
    // Extract the period number from each block's text.  Blocks that
    // do NOT carry an explicit "Period N …" / "ପିରିୟଡ୍ N …" marker are
    // treated as chapter-level front-matter and dropped.
    const withPeriods = pageBlocks.map((blk) => {
      const body = html.slice(blk.contentStart, blk.contentEnd)
      const num = _detectPeriodNumber(body, null)  // ← null when no marker
      return { period: num, start: blk.start, end: blk.end, body }
    }).filter(b => b.period != null && b.period > 0)
    // De-duplicate: if two blocks got the same period #, treat as
    // separate ranges by index (front-matter page + real period 1).
    const seen = new Map()
    const uniq = []
    for (const b of withPeriods) {
      const key = b.period
      if (seen.has(key)) {
        // Prefer the block with more content (real period usually longer).
        const prev = uniq[seen.get(key)]
        if ((b.body?.length || 0) > (prev.body?.length || 0)) uniq[seen.get(key)] = b
        continue
      }
      seen.set(key, uniq.length)
      uniq.push(b)
    }
    if (uniq.length >= 2) {
      // Preserve <head>…</head> so per-period documents inherit CSS + fonts.
      const headMatch = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)
      const headInner = headMatch ? headMatch[1] : '<meta charset="utf-8" />'
      return uniq.map(b => ({
        period: b.period,
        html: `<!doctype html>\n<html lang="or">\n<head>${headInner}</head>\n<body>${b.body}\n</body>\n</html>`,
        subject: '',
      }))
    }
  }

  // ── Shape 3 · `data-period="N"` blocks ──────────────────────
  const dpRx = /<(?:section|article|div)\b[^>]*data-period\s*=\s*["'](\d+)["'][^>]*>/gi
  const dpMatches = []
  while ((m = dpRx.exec(html))) dpMatches.push({ period: Number(m[1]), start: m.index, endOfOpenTag: m.index + m[0].length })
  if (dpMatches.length >= 2) {
    return _splitByRanges(html, dpMatches.map(x => ({ period: x.period, start: x.endOfOpenTag, end: null })))
  }

  return []
}

// Split HTML by start/end ranges, preserving <head> in each per-period doc.
function _splitByRanges(html, ranges) {
  const headMatch = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)
  const headInner = headMatch ? headMatch[1] : '<meta charset="utf-8" />'
  const out = []
  for (let i = 0; i < ranges.length; i++) {
    const cur = ranges[i]
    const next = ranges[i + 1]
    const bodyChunk = html.slice(cur.start, next ? next.start : html.length).trim()
    const heroMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(bodyChunk)
    let subject = ''
    if (heroMatch) {
      const parts = stripHtml(heroMatch[1]).split(/[•|·]/).map(s => s.trim())
      subject = parts[0] || ''
    }
    const doc = `<!doctype html>\n<html lang="or">\n<head>${headInner}</head>\n<body>\n${bodyChunk}\n</body>\n</html>`
    out.push({ period: cur.period, html: doc, subject })
  }
  return out
}

// Find balanced <div>…</div> blocks matching an opening-tag regex.
// Returns [{ start, end, contentStart, contentEnd }].  Handles nested
// <div> tags by counting depth.  Used to extract .page blocks.
function _findBalancedBlocks(html, openRx, closeTag) {
  const blocks = []
  let mm
  const rx = new RegExp(openRx.source, openRx.flags.includes('g') ? openRx.flags : openRx.flags + 'g')
  while ((mm = rx.exec(html))) {
    const start = mm.index
    const contentStart = mm.index + mm[0].length
    // Walk forward counting <div> depth.
    let depth = 1
    let i = contentStart
    while (i < html.length && depth > 0) {
      const nextOpen = html.indexOf('<div', i)
      const nextClose = html.indexOf(closeTag, i)
      if (nextClose < 0) { i = html.length; break }
      if (nextOpen >= 0 && nextOpen < nextClose) { depth += 1; i = nextOpen + 4 }
      else { depth -= 1; i = nextClose + closeTag.length; if (depth === 0) { blocks.push({ start, end: i, contentStart, contentEnd: nextClose }); break } }
    }
  }
  return blocks
}

// Detect the period number from a chunk of text.  Matches:
//   "Period 3 of 20", "Period 3/20", "Period 3 / 20", "P3", "ପିରିୟଡ୍ ୩",
//   Odia digit sequences (୦-୯) and English digits.  Falls back to
//   the provided default if nothing found.
function _detectPeriodNumber(text, fallback) {
  const t = String(text || '').slice(0, 6000)  // scan hero region only
  // Odia digit map.
  const odDigits = '୦୧୨୩୪୫୬୭୮୯'
  const odNorm = t.replace(/[୦-୯]/g, ch => String(odDigits.indexOf(ch)))
  // Try patterns in priority order — most specific first.
  const patterns = [
    /Period\s+(\d+)\s+of\s+\d+/i,
    /Period\s+(\d+)\s*\/\s*\d+/i,
    /ପିରିୟଡ୍\s*(\d+)\s*\/\s*\d+/i,
    /ପିରିୟଡ୍\s*(\d+)/i,
    /Period\s+(\d+)/i,
    /\bP\s*[.\-]?\s*(\d+)\b/,
  ]
  for (const rx of patterns) {
    const m = odNorm.match(rx)
    if (m) {
      const n = Number(m[1])
      if (n > 0 && n < 500) return n
    }
  }
  return fallback
}

const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

// ------------------------------------------------------------
// Filename sniffer — best-effort parse of common patterns like:
//   class-1-math-ch-1-anything.html
//   class-3-odia-ch-5.html
//   class1-english-chapter-2-bundle.html
//   ashtha-shishu-2.html   (falls back to no match)
//
// Returns { classHint, subjectHint, chapterOrderHint }.  All fields are
// optional strings — the caller matches these against the real
// curriculum before committing.
// ------------------------------------------------------------
export function sniffFilename(name) {
  const out = { classHint: '', subjectHint: '', subjectAliases: [], chapterOrderHint: null }
  if (!name) return out
  const base = String(name).toLowerCase().replace(/\.(html?|zip)$/i, '')
  const clsMatch = base.match(/\bclass[-_ ]?(\d{1,2})\b/) || base.match(/\bc(\d{1,2})[-_ ]/)
  if (clsMatch) out.classHint = `Class ${clsMatch[1]}`
  const chMatch = base.match(/\b(?:ch(?:apter)?|ପାଠ|adhyaya)[-_ ]?(\d{1,2})\b/) || base.match(/\bch(\d{1,2})\b/)
  if (chMatch) out.chapterOrderHint = Number(chMatch[1])
  // Subject dictionary — extend as needed.  `aliases` gives Odia/English
  // synonyms so the DB matcher can find a book named "ଗଣିତ (ଖୁସିଖୁସିଆ ଗଣିତ)"
  // from an English filename token "math".
  const SUBJECT_TOKENS = [
    { rx: /\b(math|maths|mathematics|ganita|ganit|ଗଣିତ)\b/, name: 'Math', aliases: ['ଗଣିତ', 'Math', 'Mathematics', 'Ganit', 'Ganita'] },
    { rx: /\b(odia|oriya|ଓଡ଼ିଆ|bhasa|bhasha|ଭାଷା)\b/, name: 'Odia', aliases: ['ଓଡ଼ିଆ', 'ଭାଷା', 'Odia', 'Oriya', 'Bhasha', 'ଭାଷା ମହକ'] },
    { rx: /\b(english|pallavi|angreji)\b/, name: 'English', aliases: ['English', 'Pallavi', 'ଇଂରାଜୀ'] },
    { rx: /\b(hindi)\b/, name: 'Hindi', aliases: ['Hindi', 'ହିନ୍ଦୀ'] },
    { rx: /\b(sanskrit)\b/, name: 'Sanskrit', aliases: ['Sanskrit', 'ସଂସ୍କୃତ'] },
    { rx: /\b(science|vigyan)\b/, name: 'Science', aliases: ['Science', 'ବିଜ୍ଞାନ', 'Vigyan'] },
    { rx: /\b(evs|environment)\b/, name: 'EVS', aliases: ['EVS', 'Environment', 'ପରିବେଶ'] },
    { rx: /\b(ss|social|history|geography)\b/, name: 'Social Studies', aliases: ['Social Studies', 'ସାମାଜିକ ଅଧ୍ୟୟନ', 'SS'] },
  ]
  for (const t of SUBJECT_TOKENS) if (t.rx.test(base)) { out.subjectHint = t.name; out.subjectAliases = t.aliases; break }
  return out
}

// Best-effort title extraction (<title> or first <h1>).  Non-fatal.
export function extractTitle(html) {
  if (!html) return ''
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (t && t[1]) return t[1].trim().slice(0, 200)
  const h = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
  if (h && h[1]) return h[1].replace(/<[^>]+>/g, '').trim().slice(0, 200)
  return ''
}

// Normalise the parsed metadata into a document ready for insertion.
// classId / bookId / chapterId are resolved by the caller against the
// existing curriculum collections — this helper only shapes the raw
// values (Class 5 → { name, order }) etc.
export function normalizeUpload({ html, filename, meta, uploadedBy }) {
  const em = meta || {}
  const title = extractTitle(html)
  const classLabel = em.class || ''
  const classOrderMatch = classLabel.match(/(\d+)/)
  const period = Number(em.period || 0) || 0
  const chapterOrder = Number(em['chapter-order'] || 0) || 0
  return {
    filename: filename || 'panchapadi.html',
    title: title || em.chapter || '',
    classLabel,
    classOrder: classOrderMatch ? Number(classOrderMatch[1]) : null,
    bookLabel: em.book || '',
    chapterLabel: em.chapter || '',
    chapterOrder,
    period,
    rawMeta: em,
    htmlSize: html?.length || 0,
    uploadedBy: uploadedBy || null,
  }
}
