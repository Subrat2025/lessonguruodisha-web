// === TOB === Teacher Observation (Task & Project, Two Terms) — HTML parser.
// Pure functions. Parses 3 file types: chapter packs, observation sets (A–J),
// and the records register. LO chips come from each card's `.lostrip`:
//   <div><span class="code cgc">CG-4</span><span class="code ccc">C-4.1</span>
//        <span class="code loc">OD 4.1.1</span><span class="lt">…lo text…</span></div>
import * as cheerio from 'cheerio'
import { toInt, asciiToOdia } from './_abp_parse.mjs'

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
  return 'OTHER'
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

function headerMeta($, { filename, folder }) {
  const title = clean($('title').first().text())
  const body = $('body').text()
  // class from filename (Class4) or text (ଚତୁର୍ଥ ଶ୍ରେଣୀ)
  let cls = (filename.match(/Class\s*(\d+)/i) || [, ''])[1]
  if (!cls) { const m = body.match(/ଶ୍ରେଣୀ\s*:?\s*([୦-୯]+)/u); if (m) cls = String(toInt(m[1])) }
  const stage = /Preparatory|ପ୍ରସ୍ତୁତି/i.test(body) ? 'Preparatory'
    : /Foundational|ଭିତ୍ତିଭୂମି/i.test(body) ? 'Foundational'
    : /Middle|ମଧ୍ୟ/i.test(body) ? 'Middle' : ''
  const subjPrinted = /ଓଡ଼ିଆ/.test(title + body) ? 'ଓଡ଼ିଆ' : ''
  const subject_id = subjectId(title + ' ' + body)
  return { title, class: String(cls || ''), stage, subject_printed: subjPrinted, subject_id }
}

// Marks — read ONLY from <section class="marks"> .eq .n spans, in order:
// total, written, project, [diary]. Ignore rubric headings & task/project cards.
// Also read the written/project rubric totals and the weightage bar.
function parseMarks($) {
  const sec = $('section.marks').first()
  const nums = []
  sec.find('.eq .n').each((_, n) => {
    const $n = $(n).clone(); const label = clean($n.find('small').text()); $n.find('small').remove()
    nums.push({ val: toInt($n.text()), label })
  })
  const total = nums[0]?.val ?? null
  const written = nums[1]?.val ?? null
  const project = nums[2]?.val ?? null
  const diaryByBox = nums[3]?.val ?? null
  // weightage bar
  const wparts = []
  sec.find('.wbar span').each((_, s) => { const t = clean($(s).text()).replace('%', ''); if (t) wparts.push(t) })
  const weightage = wparts.length ? wparts.join('/') : ''
  // rubric totals (from headings "... ରୁବ୍ରିକ୍ — ମୋଟ N ମାର୍କ")
  const body = $('body').text()
  const grab = (re) => { const m = body.match(re); return m ? toInt(m[1]) : null }
  const projectRubric = grab(/ପ୍ରକଳ୍ପ[^]{0,40}ରୁବ୍ରିକ[^]{0,40}ମୋଟ\s*([୦-୯0-9]+)\s*ମାର୍କ/u)
  const writtenRubric = grab(/ଲିଖିତ[^]{0,40}ରୁବ୍ରିକ[^]{0,40}ମୋଟ\s*([୦-୯0-9]+)\s*ମାର୍କ/u)
  const hasPartC = /Part C\b/i.test(body) && !/ଭାଗ ଗ ବାଦ୍|Part C[^।\n]{0,40}(removed|ବାଦ୍|ନାହିଁ|ନୁହେଁ)/i.test(body)
  const diaryMention = /Learner.?s Diary|ଶିଖନ ଡାଏରୀ|ଶିକ୍ଷାର୍ଥୀ ଡାଏରୀ/i.test(body)
  const diaryNegated = /(Learner.?s Diary|ଡାଏରୀ)[^।\n]{0,50}(ପ୍ରଯୁଜ୍ୟ ନୁହେଁ|ନୁହେଁ|ନାହିଁ|not applicable|removed|ବାଦ୍)/i.test(body)
  const hasDiary = diaryByBox != null ? diaryByBox > 0 : (diaryMention && !diaryNegated)
  return { total, written, project, diary: diaryByBox ?? 0, weightage, projectRubric, writtenRubric, hasPartC, hasDiary, marksBoxFound: !!sec.length }
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
  if (folderLower.includes('05_') || nameLower.includes('earlier_version')) return null  // skip folder 05
  if (folderLower.includes('04_') || nameLower.includes('records_register')) return 'register'
  if (folderLower.includes('03_') || /_set_[a-j]_/i.test(nameLower)) return 'set'
  if (folderLower.includes('01_') || folderLower.includes('02_') || /ch0*\d+_/i.test(nameLower)) return 'chapter'
  return 'chapter'
}
