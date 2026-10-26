// ============================================================
//  loCodeMapParser.js
//  Parse a "Period Code Map" HTML (Chapter-wise LO) into structured
//  per-period records for the cascading search:
//    Class → Subject → Topic (Patha/lesson) → Period → codes+details
//
//  Handles BOTH source formats:
//   A) raw upload:  <span class="ch cg" title="EXPL">CODE</span>
//   B) transformed: <details class="ch cg"><summary>CODE</summary>
//                     <span class="ch-exp">EXPL</span></details>
// ============================================================

const ODIA_DIGITS = { '୦': 0, '୧': 1, '୨': 2, '୩': 3, '୪': 4, '୫': 5, '୬': 6, '୭': 7, '୮': 8, '୯': 9 }

function odiaToInt(s) {
  const str = String(s || '').trim()
  let out = ''
  for (const ch of str) {
    if (ODIA_DIGITS[ch] != null) out += ODIA_DIGITS[ch]
    else if (/[0-9]/.test(ch)) out += ch
  }
  return out ? parseInt(out, 10) : null
}

const stripTags = (s) => String(s || '').replace(/<[^>]*>/g, ' ')
const decode = (s) => String(s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
const clean = (s) => decode(stripTags(s)).replace(/\s+/g, ' ').trim()

// Does a class attribute string contain the exact category token?
function classHasCat(attrs, cat) {
  const m = /\bclass="([^"]*)"/.exec(attrs || '')
  if (!m) return false
  const tokens = m[1].split(/\s+/)
  return tokens.includes('ch') && tokens.includes(cat)
}

// Some maps carry a JS dictionary  var D={"CG-9":{text,label,...}, ...}
// with the full explanations. Parse it so button/data-code layouts (whose
// text is delivered via JS) still get their descriptions.
export function parseCodeDictionary(html) {
  const m = /var\s+D\s*=\s*(\{[\s\S]*?\})\s*;?\s*(?:<\/script>|function|var |const |let |document\.)/.exec(String(html || ''))
  if (!m) return {}
  try {
    const dict = JSON.parse(m[1])
    const out = {}
    for (const k of Object.keys(dict)) {
      const v = dict[k] || {}
      out[String(k).trim()] = { text: v.text || '', label: v.label || '' }
    }
    return out
  } catch { return {} }
}

// Extract { code, text } for a category from a single <td> cell.
// Attribute-order INDEPENDENT and tolerant of sanitiser rewrites — handles:
//   A) <span class="ch cg" title="EXPL">CODE</span>   (any attr order)
//   B) <details class="ch cg"><summary>CODE</summary><span class="ch-exp">EXPL</span></details>
//   C) <span class="ch cg">CODE</span>                (no title → code only)
//   D) <button class="ch cg" data-code="CG-9">CG-9</button>  (text from dict)
function extractCode(cell, cat, dict) {
  if (!cell) return null
  const withText = (code, text) => {
    code = clean(code)
    if (!text && dict && dict[code]) text = dict[code].text
    return { code, text: clean(text || '') }
  }
  // B) details / summary
  const detRe = /<details([^>]*)>\s*<summary>([\s\S]*?)<\/summary>\s*<span[^>]*class="ch-exp"[^>]*>([\s\S]*?)<\/span>/g
  let dm
  while ((dm = detRe.exec(cell))) {
    if (classHasCat(dm[1], cat)) return withText(dm[2], dm[3])
  }
  // D) button (with optional data-code) — text comes from the D dictionary
  const btnRe = /<button([^>]*)>([\s\S]*?)<\/button>/g
  let bm
  while ((bm = btnRe.exec(cell))) {
    if (!classHasCat(bm[1], cat)) continue
    const dc = /\bdata-code="([^"]*)"/.exec(bm[1])
    return withText(dc ? dc[1] : bm[2], '')
  }
  // A/C) span (with or without title), any attribute order
  const spanRe = /<span([^>]*)>([\s\S]*?)<\/span>/g
  let sm
  while ((sm = spanRe.exec(cell))) {
    const attrs = sm[1]
    if (!classHasCat(attrs, cat)) continue
    const tm = /\btitle="([^"]*)"/.exec(attrs)
    return withText(sm[2], tm ? tm[1] : '')
  }
  return null
}

// Secondary "framework" code shown under the competency (e.g. C-43).
function extractFl(cell) {
  const m = /<(?:span|button)[^>]*class="[^"]*\bfl\b[^"]*"[^>]*>([\s\S]*?)<\/(?:span|button)>/.exec(cell || '')
  return m ? clean(m[1]) : ''
}

/**
 * Parse the map HTML into an ordered array of period records.
 * @returns {Array} [{ prasang, topic, period, periodLabel, bishaya,
 *                      cg, competency, competencyFramework, lo, lld }]
 */
export function parseLoCodeMap(html) {
  const src = String(html || '')
  const dict = parseCodeDictionary(src)
  const rows = src.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || []
  const out = []
  let prasang = '', topic = '', topicMeta = ''
  let seq = 0

  for (const row of rows) {
    const attrs = (/<tr\b([^>]*)>/.exec(row) || [])[1] || ''
    const inner = (/<tr\b[^>]*>([\s\S]*)<\/tr>/.exec(row) || [])[1] || ''

    if (/class="[^"]*\bth\b[^"]*"/.test(attrs)) {
      prasang = clean(inner)          // ପ୍ରସଙ୍ଗ … (unit header)
      continue
    }
    if (/class="[^"]*\bls\b[^"]*"/.test(attrs)) {
      const ln = /<span class="lname"[^>]*>([\s\S]*?)<\/span>/.exec(inner)
      topic = ln ? clean(ln[1]) : clean(inner)   // ପାଠ … (lesson = topic)
      const metas = [...inner.matchAll(/<span class="lm[^"]*"[^>]*>([\s\S]*?)<\/span>/g)].map(x => clean(x[1]))
      topicMeta = metas.join(' · ')
      continue
    }

    // Data (period) row — must contain a pn cell.
    if (!/class="pn"/.test(inner)) continue
    const cells = ('<td' + inner.split('<td').slice(1).join('<td'))
      .split(/<td\b[^>]*>/).slice(1).map(c => c.replace(/<\/td>[\s\S]*$/, ''))
    // cells order: [pn, tp, cg, competency, lo, range]
    const pnRaw = clean(cells[0])
    const bishaya = clean(cells[1])
    const cg = extractCode(cells[2], 'cg', dict)
    const competency = extractCode(cells[3], 'c', dict)
    const competencyFramework = extractFl(cells[3])
    const lo = extractCode(cells[4], 'lo', dict)
    const lld = extractCode(cells[5], 'll', dict)
    seq += 1
    out.push({
      seq,
      prasang, topic, topicMeta,
      period: odiaToInt(pnRaw) ?? seq,
      periodLabel: pnRaw,
      bishaya,
      cg, competency, competencyFramework, lo, lld,
    })
  }
  return out
}
