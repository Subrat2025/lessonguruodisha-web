// === TOB === Teacher Observation (Task & Project, Two Terms) — HTML parser.
// Pure functions. Parses 3 file types: chapter packs, observation sets (A–J),
// and the records register. LO chips come from each card's `.lostrip`:
//   <div><span class="code cgc">CG-4</span><span class="code ccc">C-4.1</span>
//        <span class="code loc">OD 4.1.1</span><span class="lt">…lo text…</span></div>
import * as cheerio from 'cheerio'
import { toInt, asciiToOdia } from '@/lib/abp/parse.js'
import { labelKey, detectDomain, classFromHeader, normLabel, COMPONENT_KEYS } from '@/lib/tob/odia.js'

const clean = (t) => String(t || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
export function normCode(s) { return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim() }

// Map a printed Odia/English subject name → canonical subject_id used in lomaster.
export function subjectId(s) {
  const t = String(s || '')
  if (/ଓଡ଼ିଆ|Odia/i.test(t)) return 'OD'
  if (/ଇଂରାଜୀ|English/i.test(t)) return 'E'
  if (/ହିନ୍ଦୀ|Hindi/i.test(t)) return 'H'
  if (/ସଂସ୍କୃତ|Sanskrit/i.test(t)) return 'S'
  if (/ଗଣିତ|Math/i.test(t)) return 'MATH'
  if (/ପରିବେଶ|EVS|Environ/i.test(t)) return 'EV'
  if (/ବିଜ୍ଞାନ|Science/i.test(t)) return 'SC'
  if (/ସମାଜ|Social/i.test(t)) return 'SS'
  // Non-academic subjects (reuse existing LO Master ids: PE / AE / VE)
  if (/ଶାରୀରିକ|Physical\s*Edu/i.test(t)) return 'PE'
  if (/କଳା ଶିକ୍ଷା|Art\s*Edu|Aesthetic/i.test(t)) return 'AE'
  if (/ବୃତ୍ତିଗତ|Vocational/i.test(t)) return 'VE'
  return 'OTHER'
}

// Canonical subject_id → Odia display name (shown as the store/subject chip).
// Accepts either an id (OD/MATH/E…) or a manifest code (ODIA/MATH/ENGLISH…).
const SUBJECT_PRINTED = {
  OD: 'ଓଡ଼ିଆ', ODIA: 'ଓଡ଼ିଆ',
  MATH: 'ଗଣିତ', MATHS: 'ଗଣିତ',
  E: 'ଇଂରାଜୀ', ENGLISH: 'ଇଂରାଜୀ', ENG: 'ଇଂରାଜୀ',
  H: 'ହିନ୍ଦୀ', HINDI: 'ହିନ୍ଦୀ',
  S: 'ସଂସ୍କୃତ', SANSKRIT: 'ସଂସ୍କୃତ',
  EV: 'ପରିବେଶ ଅଧ୍ୟୟନ', EVS: 'ପରିବେଶ ଅଧ୍ୟୟନ',
  SC: 'ବିଜ୍ଞାନ', SCIENCE: 'ବିଜ୍ଞାନ',
  SS: 'ସମାଜ ବିଜ୍ଞାନ', SOCIAL: 'ସମାଜ ବିଜ୍ଞାନ',
  // Non-academic subjects — admin-approved Odia display names.
  PE: 'ଶାରୀରିକ ଶିକ୍ଷା', PHYSICAL: 'ଶାରୀରିକ ଶିକ୍ଷା',
  AE: 'କଳା ଶିକ୍ଷା', ART: 'କଳା ଶିକ୍ଷା',
  VE: 'ବୃତ୍ତିଗତ ଶିକ୍ଷା', VOC: 'ବୃତ୍ତିଗତ ଶିକ୍ଷା',
}
// Canonical manifest subject code -> canonical id. SOURCE OF TRUTH for which
// subject codes are accepted at import. Codes are case-insensitive.
export const SUBJECT_CODE_MAP = {
  ODIA: 'OD', OD: 'OD',
  MATH: 'MATH', MATHS: 'MATH',
  ENGLISH: 'E', ENG: 'E', E: 'E',
  HINDI: 'H', H: 'H',
  SANSKRIT: 'S', S: 'S',
  EVS: 'EV', EV: 'EV',
  SCIENCE: 'SC', SC: 'SC',
  SOCIAL: 'SS', SS: 'SS',
  PE: 'PE', PHYSICAL: 'PE',
  ART: 'AE', ARTEDU: 'AE', AE: 'AE',
  VOC: 'VE', VOCATIONAL: 'VE', VE: 'VE',
}
// Human-facing list of the canonical codes an admin should put in manifest.csv.
export const VALID_SUBJECT_CODES = ['ODIA', 'MATH', 'ENGLISH', 'HINDI', 'SANSKRIT', 'EVS', 'SCIENCE', 'SOCIAL', 'PE', 'ART', 'VOC']
// Is a manifest subject code one we recognise? (case-insensitive)
export function isKnownSubjectCode(code) {
  return Object.prototype.hasOwnProperty.call(SUBJECT_CODE_MAP, String(code || '').toUpperCase().trim())
}
// Normalise a manifest subject code (ODIA/ENGLISH/…) to the canonical id (OD/E/…).
export function subjectCodeToId(code) {
  const c = String(code || '').toUpperCase().trim()
  return SUBJECT_CODE_MAP[c] || c || 'OTHER'
}
export function subjectPrinted(idOrCode) {
  const k = String(idOrCode || '').toUpperCase().trim()
  return SUBJECT_PRINTED[k] || ''
}

// Pull every LO chip-row out of all `.lostrip` blocks inside an element.
function losIn($, el) {
  const los = []
  $(el).find('.lostrip > div').each((_, d) => {
    const cg = clean($(d).find('.cgc').first().text())
    const competency = clean($(d).find('.ccc').first().text())
    const lo_code = clean($(d).find('.loc').first().text())
    const lo_text = clean($(d).find('.lt').first().text())
    if (lo_code || cg || competency) los.push({ cg, competency, lo_code, lo_text })
  })
  return los
}

// Parse the task/project cards (shared by chapter packs and sets).
function parseCards($) {
  const cards = []
  $('article.card').each((_, c) => {
    const $c = $(c)
    const part = $c.hasClass('B') ? 'B' : ($c.hasClass('A') ? 'A' : '')
    const num = toInt($c.find('.card-h .num').first().text())
    const title = clean($c.find('.card-h h3').first().text())
    const kind = clean($c.find('.card-h .kind').first().text())
    const los = losIn($, c)
    cards.push({ part, num, title, kind, los })
  })
  return cards
}

// Distinct LO codes across cards (the authoritative coverage set).
function coverageCodes(cards) {
  const set = new Set()
  for (const c of cards) for (const l of c.los) if (l.lo_code) set.add(normCode(l.lo_code))
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

// Odia ordinal class words → number.
const CLASS_WORDS = { 'ପ୍ରଥମ': 1, 'ଦ୍ୱିତୀୟ': 2, 'ଦ୍ବିତୀୟ': 2, 'ତୃତୀୟ': 3, 'ଚତୁର୍ଥ': 4, 'ପଞ୍ଚମ': 5, 'ଷଷ୍ଠ': 6, 'ସପ୍ତମ': 7, 'ଅଷ୍ଟମ': 8 }

function headerMeta($, { filename, folder }) {
  const title = clean($('title').first().text())
  const body = $('body').text()
  // CLASS — detect from the HEADER ONLY (filename → title → meta keywords → badge).
  // NEVER from body text, so "refer to the ଚତୁର୍ଥ (Class 4) book" or a Learner's
  // Diary note "(ଷଷ୍ଠ–ଅଷ୍ଟମ ଶ୍ରେଣୀ)" can never change or flag the class.
  const metaKw = $('meta[name="keywords"]').attr('content') || ''
  const badge = $('.badge').map((_, e) => $(e).text()).get().join(' ')
  const h1 = clean($('h1, .hero, .ph').first().text())
  let cls = (String(filename).match(/Class\s*(\d+)/i) || [, ''])[1]
  if (!cls) cls = classFromHeader(`${title} ${metaKw}`)
  if (!cls) cls = classFromHeader(`${badge} ${h1}`)
  const stage = /Preparatory|ପ୍ରସ୍ତୁତି/i.test(body) ? 'Preparatory'
    : /Foundational|ମୂଳଦୁଆ|ଭିତ୍ତିଭୂମି/i.test(body) ? 'Foundational'
    : /Middle|ମଧ୍ୟ ପର୍ଯ୍ୟାୟ/i.test(body) ? 'Middle' : ''
  const subjPrinted = /ଓଡ଼ିଆ/.test(title + body) ? 'ଓଡ଼ିଆ' : ''
  const subject_id = subjectId(title + ' ' + body)
  return { title, class: String(cls || ''), stage, subject_printed: subjPrinted, subject_id }
}

// Marks — read from <section class="marks"> by LABEL (structure), never by position.
// Each box is <span class="n">VALUE<small>LABEL</small></span>. We map LABEL → a
// canonical key via the Odia label dictionary. Component marks for Art Education
// (ଦୃଶ୍ୟକଳା/ସଙ୍ଗୀତ/ନୃତ୍ୟ/ନାଟକ) are captured as components — NEVER as project/diary.
// For academic files that have no component labels we keep the old positional read
// (total, written, project, [diary]) as a safe fallback so nothing regresses.
function parseMarks($) {
  const sec = $('section.marks').first()
  if (!sec.length) return { total: null, written: null, project: null, diary: 0, weightage: '', projectRubric: null, writtenRubric: null, hasPartC: false, hasDiary: false, marksBoxFound: false, components: {}, performance: null, projectBox: null, isArt: false, chapterDomain: null, chapterDomainN: null, unknownLabels: [] }
  const mboxes = sec.find('.mbox')
  const primary = mboxes.length ? $(mboxes[0]) : sec
  // read labelled numbers from the primary (Teacher-Observation 25-mark) box
  const byKey = {}, boxes = [], unknown = []
  primary.find('.eq .n').each((_, n) => {
    const $n = $(n).clone(); const rawLabel = $n.find('small').text(); $n.find('small').remove()
    const val = toInt($n.text())
    const key = labelKey(rawLabel)
    boxes.push({ val, label: clean(rawLabel), key })
    if (key) { if (byKey[key] == null) byKey[key] = val }
    else if (clean(rawLabel)) unknown.push(clean(rawLabel))
  })
  // performance / project box (AE/PE box 2): an .mbox whose heading mentions ପ୍ରଦର୍ଶନ.
  // Detect by the word ପ୍ରଦର୍ଶନ explicitly (the heading also contains "ପ୍ରକଳ୍ପ କାର୍ଯ୍ୟ",
  // so a plain labelKey() would wrongly resolve it to 'project').
  let performance = null
  let projectBox = null   // VE: a SEPARATE "ପ୍ରକଳ୍ପ କାର୍ଯ୍ୟ" box (read like PE's ପ୍ରଦର୍ଶନ)
  const perfWord = normLabel('ପ୍ରଦର୍ଶନ')
  const projWord = normLabel('ପ୍ରକଳ୍ପ କାର୍ଯ୍ୟ')
  const firstBoxN = ($mb) => { const t = $mb.find('.eq .n').first(); if (!t.length) return null; const c = t.clone(); c.find('small').remove(); return toInt(c.text()) }
  mboxes.each((i, mb) => {
    const $mb = $(mb)
    const head = normLabel($mb.find('.mh, h2, h3').first().text())
    if (head.includes(perfWord) || head.includes('performance')) performance = firstBoxN($mb)
    // VE project box: a SECONDARY mbox (not the primary TO box) whose heading is
    // "ପ୍ରକଳ୍ପ କାର୍ଯ୍ୟ". Secondary-only so an academic project inside the primary
    // box is never picked up here.
    else if (i > 0 && head.includes(projWord)) projectBox = firstBoxN($mb)
  })
  // component marks (Art Education V/M/D/T + Physical Education FM/GS/YG)
  const components = {}
  for (const k of COMPONENT_KEYS) if (byKey[k] != null) components[k] = byKey[k]
  const isArt = Object.keys(components).length > 0
  const total = byKey.total ?? boxes[0]?.val ?? null
  // academic parts: prefer label, fall back to POSITION only for non-art files
  const written = byKey.written ?? (isArt ? null : (boxes[1]?.val ?? null))
  const project = byKey.project ?? (isArt ? null : (boxes[2]?.val ?? null))
  const diaryByBox = byKey.diary ?? (isArt ? null : (boxes[3]?.val ?? null))
  const diaryBoxLabel = boxes.find(b => b.key === 'diary')?.label || ''
  // chapter domain note: "ଏହି ଅଧ୍ୟାୟ: <domain> — … (N)"
  const noteText = primary.find('.note').first().text() || sec.find('.note').first().text() || ''
  const dom = detectDomain(noteText)
  // weightage bar
  const wparts = []
  primary.find('.wbar span').each((_, s) => { const t = clean($(s).text()).replace('%', ''); if (t) wparts.push(t) })
  const weightage = wparts.length ? wparts.join('/') : ''
  // rubric totals (from headings "… ରୁବ୍ରିକ୍ — ମୋଟ N ମାର୍କ")
  const body = $('body').text()
  const grab = (re) => { const m = body.match(re); return m ? toInt(m[1]) : null }
  const projectRubric = grab(/ପ୍ରକଳ୍ପ[^]{0,40}ରୁବ୍ରିକ[^]{0,40}ମୋଟ\s*([୦-୯0-9]+)\s*ମାର୍କ/u)
  const writtenRubric = grab(/ଲିଖିତ[^]{0,40}ରୁବ୍ରିକ[^]{0,40}ମୋଟ\s*([୦-୯0-9]+)\s*ମାର୍କ/u)
  const hasPartC = /Part C\b/i.test(body) && !/ଭାଗ ଗ ବାଦ୍|Part C[^।\n]{0,40}(removed|ବାଦ୍|ନାହିଁ|ନୁହେଁ)/i.test(body)
  // === Diary (academic, Middle stage) — READ FROM STRUCTURED SOURCES ONLY ======
  // The diary mark is taken ONLY from:
  //   1) the marks box (section.marks) — the labelled "Learner's Diary" number, or
  //   2) a Part C / Learner's Diary CARD HEADING declaring "(N marks)".
  // It is NEVER read from teacher notes, rubric lines, or negation words
  // (avoid / never / not / loss / "n/a") sitting near the word "diary" in the body.
  // That body scan previously zeroed a real 5-mark box because the "n/a" pattern
  // matched "Na" in "My diary: National War Memorial". A diary counts as "not
  // applicable" ONLY when the marks-box diary LABEL itself says so.
  const diaryBoxNegated = /(not applicable|does not apply|\bn\/a\b|removed|ପ୍ରଯୁଜ୍ୟ ନୁହେଁ|ନୁହେଁ|ନାହିଁ|ବାଦ୍)/i.test(diaryBoxLabel)
  // Fallback (only when the marks box carries no diary number): a diary CARD
  // HEADING like "Learner's Diary (5 marks …)" / "ଡାଏରୀ (୫ ମାର୍କ …)". Headings
  // only — never arbitrary paragraph/rubric text.
  let diaryFromHeading = null
  $('h1,h2,h3,h4,.mh,.k').each((_, h) => {
    if (diaryFromHeading != null) return
    const t = clean($(h).text())
    if (!/Learner.?s Diary|ଡାଏରୀ/i.test(t)) return
    const mm = t.match(/\(\s*([୦-୯0-9]+)\s*(?:marks?|ମାର୍କ)/i)
    if (mm) diaryFromHeading = toInt(mm[1])
  })
  const diaryVal = (!isArt && diaryByBox != null && diaryByBox > 0) ? diaryByBox
    : (!isArt && diaryFromHeading != null && diaryFromHeading > 0) ? diaryFromHeading
    : 0
  const diary = diaryBoxNegated ? 0 : diaryVal
  const hasDiary = diary > 0
  return {
    total, written, project, diary, weightage, projectRubric, writtenRubric, hasPartC, hasDiary,
    components, performance, projectBox, isArt, chapterDomain: dom.key, chapterDomainN: dom.n,
    unknownLabels: [...new Set(unknown)], marksBoxFound: true,
  }
}

export function parseChapterPack(html, { filename = '', folder = '' } = {}) {
  const $ = cheerio.load(html)
  const meta = headerMeta($, { filename, folder })
  const chapterNo = Number((filename.match(/Ch0*(\d+)/i) || [, 0])[1]) || null
  // chapter title = before the em-dash in the <title>
  const chapterTitle = clean(meta.title.split('—')[0]) || meta.title
  const cards = parseCards($)
  const marks = parseMarks($)
  const term = /02_|Ch0?(8|9|1[0-4])/i.test(folder + filename) ? 2 : 1
  const partA = cards.filter(c => c.part === 'A')
  const partB = cards.filter(c => c.part === 'B')
  const coverage = coverageCodes(cards)
  const warnings = []
  if (!cards.length) warnings.push('no task/project cards found')
  return {
    type: 'chapter', chapterNo, title: chapterTitle, fullTitle: meta.title,
    class: meta.class, stage: meta.stage, subject_printed: meta.subject_printed, subject_id: meta.subject_id,
    term, cards, partACount: partA.length, partBCount: partB.length,
    marks, coverageCodes: coverage, warnings,
  }
}

export function parseSet(html, { filename = '' } = {}) {
  const $ = cheerio.load(html)
  const meta = headerMeta($, { filename })
  const setCode = (filename.match(/Set[_\s]?([A-J])/i) || [, ''])[1].toUpperCase()
  const cards = parseCards($)
  const marks = parseMarks($)
  const coverage = coverageCodes(cards)
  const warnings = []
  if (!cards.length) warnings.push('no cards found')
  return {
    type: 'set', setCode, title: meta.title,
    class: meta.class, stage: meta.stage, subject_printed: meta.subject_printed, subject_id: meta.subject_id,
    terms: [1, 2], cards, partACount: cards.filter(c => c.part === 'A').length, partBCount: cards.filter(c => c.part === 'B').length,
    marks, coverageCodes: coverage, warnings,
  }
}

export function parseRegister(html, { filename = '' } = {}) {
  const $ = cheerio.load(html)
  const title = clean($('title').first().text())
  const meta = headerMeta($, { filename })
  const forms = []
  $('table').each((_, t) => {
    const $t = $(t)
    const capRaw = clean($t.prevAll('h2,h3,.ph,div').filter((_, e) => /R\d/.test($(e).text())).first().text()) || clean($t.find('caption,thead th').first().text())
    const code = (capRaw.match(/\bR\d\b/) || [''])[0]
    const headers = []
    $t.find('thead tr').last().find('th').each((_, th) => headers.push(clean($(th).text())))
    const rows = []
    $t.find('tbody tr').each((_, tr) => {
      const cells = []
      $(tr).find('td').each((_, td) => { const cs = Number($(td).attr('colspan') || 1); cells.push({ text: clean($(td).text()), colspan: cs, span: cs > 1 }) })
      if (cells.length) rows.push(cells)
    })
    forms.push({ code, caption: capRaw, headers, rows })
  })
  return { type: 'register', title, class: meta.class, subject_id: meta.subject_id, forms, warnings: forms.length ? [] : ['no tables found'] }
}

// Classify a file by name into one of the 3 types (or null to skip).
export function classifyFile(nameLower, folderLower) {
  const f = String(folderLower || ''), n = String(nameLower || '')
  if (f.includes('05_') || n.includes('earlier_version')) return null  // skip folder 05
  // NEW one-zip template folders
  if (f.includes('records_register') || n.includes('records_register')) return 'register'
  if (f.startsWith('sets_') || f.includes('/sets_') || /^set[_\s]?[a-z]\.html?$/i.test(n)) return 'set'
  if (f.includes('term1_chapters') || f.includes('term2_chapters') || /^ch0*\d+\.html?$/i.test(n)) return 'chapter'
  // Legacy numbered folders / name patterns
  if (f.includes('04_')) return 'register'
  if (f.includes('03_') || /_set_[a-z]_/i.test(n)) return 'set'
  if (f.includes('01_') || f.includes('02_') || /ch0*\d+_/i.test(n)) return 'chapter'
  return 'chapter'
}

// Derive the term ('1' | '2' | 'full' | null) from the NEW folder names, or
// from a chapter number as a last resort. Manifest always wins over this.
export function termFromFolder(folderLower, chapterNo) {
  const f = String(folderLower || '')
  if (f.includes('term1_chapters') || f.includes('sets_term1')) return '1'
  if (f.includes('term2_chapters') || f.includes('sets_term2')) return '2'
  if (f.includes('sets_fullyear')) return 'full'
  if (chapterNo != null) return Number(chapterNo) >= 8 ? '2' : '1'
  return null
}
// Read <meta name="term"> → '1' | '2' | 'full' | null.
export function termFromMeta(html) {
  const m = String(html || '').match(/<meta\s+name=["']term["']\s+content=["']\s*(T?1|T?2|FULL)\s*["']/i)
  if (!m) return null
  const v = m[1].toUpperCase().replace('T', '')
  return v === '1' ? '1' : v === '2' ? '2' : 'full'
}
