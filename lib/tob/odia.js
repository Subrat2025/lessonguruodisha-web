// === TOB === Odia text normaliser + marks-label dictionary.
// Goal: read marks boxes EXACTLY by their label (structure), so component marks
// (ଦୃଶ୍ୟକଳା / ସଙ୍ଗୀତ / ନୃତ୍ୟ / ନାଟକ) are NEVER mislabelled as project/diary by
// position, and so both nukta encodings + zero-width chars + Odia/ASCII digits
// all compare the same.

const ODIA_DIGITS = { '୦': '0', '୧': '1', '୨': '2', '୩': '3', '୪': '4', '୫': '5', '୬': '6', '୭': '7', '୮': '8', '୯': '9' }

export function odiaDigitsToAscii(s) {
  return String(s || '').replace(/[୦-୯]/g, (d) => ODIA_DIGITS[d] || d)
}

// Normalise Odia (or English) text for robust label matching:
//  - Unicode NFC
//  - drop zero-width chars (ZWSP/ZWNJ/ZWJ/BOM)
//  - canonicalise nukta forms: ଡ଼(U+0B5C)→ଡ, ଢ଼(U+0B5D)→ଢ, ୟ(U+0B5F)→ଯ, and drop
//    the combining nukta (U+0B3C) so both encodings collapse to one
//  - punctuation (। | · — – - : ( ) [ ] { } . , /) → space, collapse spaces
export function normOdia(s) {
  let t = String(s || '').normalize('NFC')
  t = t.replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
  t = t.replace(/\u0B5C/g, '\u0B21').replace(/\u0B5D/g, '\u0B22').replace(/\u0B5F/g, '\u0B2F')
  t = t.replace(/\u0B3C/g, '')
  t = t.normalize('NFC')
  t = t.replace(/[।|·—–:()\[\]{}.,/]/g, ' ').replace(/[-]/g, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  return t
}
export function normLabel(s) { return normOdia(s).toLowerCase() }

// canonical marks key  ->  list of accepted labels (Odia + English aliases)
const LABEL_DEFS = [
  ['total', ['ମୋଟ', 'total']],
  ['written', ['ଲିଖିତ କାର୍ଯ୍ୟ', 'ଲିଖିତ', 'written']],
  ['project', ['ପ୍ରକଳ୍ପ କାର୍ଯ୍ୟ', 'ପ୍ରକଳ୍ପ', 'project']],
  ['diary', ['ଶିକ୍ଷାର୍ଥୀ ଡାଏରୀ', 'ଶିଖନ ଡାଏରୀ', 'learner s diary', 'learners diary', 'diary']],
  // Art Education (AE) component domains
  ['V', ['ଦୃଶ୍ୟକଳା', 'visual art', 'visual']],
  ['M', ['ସଙ୍ଗୀତ', 'music']],
  ['D', ['ନୃତ୍ୟ', 'dance']],
  ['T', ['ନାଟକ', 'drama', 'theatre', 'theater']],
  // Physical Education (PE) component domains
  ['FM', ['ମୌଳିକ ଗତିବିଧି', 'fundamental movement', 'fundamental']],
  ['GS', ['ଖେଳ ଓ କ୍ରୀଡ଼ା', 'games and sports', 'games', 'sports']],
  ['YG', ['ଯୋଗ', 'yoga']],
  ['performance', ['ପ୍ରଦର୍ଶନ', 'performance']],
]
// All component keys (Art + PE) — used by the marks reader to collect component
// values regardless of subject.
export const COMPONENT_KEYS = ['V', 'M', 'D', 'T', 'FM', 'GS', 'YG']
// Precompute normalised alias → key (longest alias first so "ଲିଖିତ କାର୍ଯ୍ୟ" wins
// over "ଲିଖିତ" when both would match).
const ALIASES = []
for (const [key, list] of LABEL_DEFS) for (const a of list) ALIASES.push([normLabel(a), key])
ALIASES.sort((a, b) => b[0].length - a[0].length)

// Map ONE label string to its canonical marks key (or null if unknown).
export function labelKey(raw) {
  const n = normLabel(raw)
  if (!n) return null
  for (const [alias, key] of ALIASES) { if (n === alias) return key }
  for (const [alias, key] of ALIASES) { if (n.includes(alias)) return key }
  return null
}

export const DOMAIN_LABEL = { V: 'ଦୃଶ୍ୟକଳା', M: 'ସଙ୍ଗୀତ', D: 'ନୃତ୍ୟ', T: 'ନାଟକ' }

// Detect an Art-Education chapter domain + the "(N)" value from a note line such as
// "ଏହି ଅଧ୍ୟାୟ: ଦୃଶ୍ୟକଳା — ୫ଟି ବ୍ୟବହାରିକ କାର୍ଯ୍ୟର ହାରାହାରି (୧୦)".
export function detectDomain(rawNote) {
  const n = normLabel(rawNote)
  let key = null
  // check domain words in a fixed order; a chapter note names exactly one domain
  for (const k of ['V', 'M', 'D', 'T']) {
    const alias = normLabel(DOMAIN_LABEL[k])
    if (n.includes(alias)) { key = k; break }
  }
  // N = the number inside the LAST (...) on the line
  const ascii = odiaDigitsToAscii(String(rawNote || ''))
  const paren = [...ascii.matchAll(/\((\s*\d+\s*)\)/g)]
  const num = paren.length ? parseInt(paren[paren.length - 1][1], 10) : null
  return { key, n: Number.isFinite(num) ? num : null }
}

// Odia ordinal class words → number (for class detection from TITLE/BADGE only).
export const ORDINAL_CLASS = {
  'ପ୍ରଥମ': 1, 'ଦ୍ୱିତୀୟ': 2, 'ଦ୍ବିତୀୟ': 2, 'ତୃତୀୟ': 3, 'ଚତୁର୍ଥ': 4, 'ପଞ୍ଚମ': 5,
  'ଷଷ୍ଠ': 6, 'ସପ୍ତମ': 7, 'ଅଷ୍ଟମ': 8, 'ନବମ': 9, 'ଦଶମ': 10,
}
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 }

// Detect a class from a HEADER string (title / meta keywords / badge) ONLY.
// Returns a string class ('5', 'SV1', …) or '' if none found. Never scan body text.
export function classFromHeader(text) {
  const raw = String(text || '')
  const n = normOdia(raw)
  // SV (ShishuVatika) stages
  const sv = raw.match(/\bSV\s*([1-3])\b/i)
  if (sv) return 'SV' + sv[1]
  // English "Class 5" / "Grade 5"
  let m = raw.match(/\b(?:class|grade|std)\s*\.?\s*([0-9]{1,2})\b/i)
  if (m) return String(parseInt(m[1], 10))
  // Roman "Class V"
  m = raw.match(/\bclass\s*\.?\s*(VIII|VII|VI|IV|IX|XI|X|V|III|II|I)\b/i)
  if (m && ROMAN[m[1].toUpperCase()]) return String(ROMAN[m[1].toUpperCase()])
  // Odia digit "ଶ୍ରେଣୀ ୫" (either order), on the normalised+asciified text
  const a = odiaDigitsToAscii(n)
  m = a.match(/ଶ୍ରେଣୀ\s*(\d{1,2})/) || a.match(/(\d{1,2})\s*ମ?\s*ଶ୍ରେଣୀ/)
  if (m) return String(parseInt(m[1], 10))
  // Odia ordinal word adjacent to ଶ୍ରେଣୀ
  for (const [w, num] of Object.entries(ORDINAL_CLASS)) {
    const wn = normOdia(w)
    if (new RegExp(wn + '\\s*ଶ୍ରେଣୀ').test(n) || new RegExp('ଶ୍ରେଣୀ\\s*' + wn).test(n)) return String(num)
  }
  return ''
}
