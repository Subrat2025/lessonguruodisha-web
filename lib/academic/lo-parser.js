// ============================================================================
//  Chapterwise-LO (period-wise) HTML parser + chapter matcher.
//  Parses the uploaded Class-N.html into structured lessons+periods and matches
//  each lesson to the existing unit_test chapter catalog. Pure functions only —
//  no DB access here (callers pass the catalog in).
// ============================================================================

const OD = '୦୧୨୩୪୫୬୭୮୯'
export const odToInt = (s) => {
  const t = String(s || '').replace(/[୦-୯]/g, (d) => String(OD.indexOf(d)))
  const m = t.match(/\d+/)
  return m ? parseInt(m[0], 10) : null
}

const stripTags = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()

// subject detection by keyword (order matters: social before science)
export function subjectKeyOf(h1) {
  const s = h1 || ''
  if (/ସାମାଜିକ/.test(s)) return 'social'
  if (/ବିଜ୍ଞାନ/.test(s)) return 'science'
  if (/ଗଣିତ/.test(s)) return 'math'
  if (/ପରିବେଶ/.test(s)) return 'evs'
  if (/ଓଡ଼ିଆ|ଓଡିଆ/.test(s)) return 'odia'
  if (/हिंदी|हिन्दी|ହିନ୍ଦୀ/.test(s)) return 'hindi'
  if (/English|ଇଂରାଜୀ|PALLAVI|JASMINE/i.test(s)) return 'english'
  return 'unknown'
}
export const SUBJECT_LABEL = { math: 'ଗଣିତ', odia: 'ଓଡ଼ିଆ', english: 'English', evs: 'ପରିବେଶ', hindi: 'हिंदी', science: 'ବିଜ୍ଞାନ', social: 'ସାମାଜିକ ବିଜ୍ଞାନ', unknown: 'Other' }

// normalise a lesson/chapter name for fuzzy compare
export function norm(s) {
  return String(s || '')
    .replace(/^(ପାଠ|ଅଧ୍ୟାୟ|ଏକକ|ପ୍ରସଙ୍ଗ|Unit|Lesson|Chapter)\s*[୦-୯0-9]*\s*[—–\-:.]*\s*/i, '')
    .replace(/[\s–—\-·.,()?।!"':;*॰]/g, '')
    .toLowerCase()
}

// Extract a single details.ch.<kind> { code, text } from a cell's html
function parseChip(cellHtml, kind) {
  const re = new RegExp('<details[^>]*class="[^"]*\\bch\\b[^"]*\\b' + kind + '\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/details>', 'g')
  const out = []
  let m
  while ((m = re.exec(cellHtml))) {
    const inner = m[1]
    const sm = inner.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)
    const tm = inner.match(/class="ch-exp"[^>]*>([\s\S]*?)<\/span>/)
    out.push({ code: stripTags(sm ? sm[1] : ''), text: stripTags(tm ? tm[1] : '') })
  }
  return out
}

// Parse one Class-N.html string into { classNo, books:[...] }
export function parseClassHtml(html, classNo) {
  const books = []
  const chunks = String(html || '').split('<div class="pcm-root"')
  for (let bi = 1; bi < chunks.length; bi++) {
    const block = chunks[bi]
    const h1m = block.match(/<h1[^>]*>([\s\S]*?)(?:<small|<\/h1>)/)
    const h1 = h1m ? stripTags(h1m[1]) : ''
    if (/Chapterwise Learning Outcomes/i.test(h1) && !/·/.test(h1)) continue
    const subjectKey = subjectKeyOf(h1)
    const bookName = (h1.split('·')[0] || h1).trim()

    const lessons = []
    const parts = block.split('<tr class="ls"')
    for (let li = 1; li < parts.length; li++) {
      // the lesson header row is the start of parts[li] up to </tr>
      const headEnd = parts[li].indexOf('</tr>')
      const head = parts[li].slice(0, headEnd)
      const lname = (() => { const m = head.match(/class="lname"[^>]*>([\s\S]*?)<\/span>/); return m ? stripTags(m[1]) : '' })()
      // lm spans
      const lmSpans = [...head.matchAll(/<span class="lm([^"]*)"[^>]*>([\s\S]*?)<\/span>/g)].map(x => ({ cls: x[1].trim(), txt: stripTags(x[2]) }))
      let unit = '', pages = '', skill = '', np = ''
      for (const sp of lmSpans) {
        if (/np/.test(sp.cls)) np = sp.txt
        else if (/let/.test(sp.cls)) skill = sp.txt
        else if (/ପୃ/.test(sp.txt)) pages = sp.txt
        else if (!unit) unit = sp.txt
        else if (!skill) skill = sp.txt
      }
      // periods: the body after the header row, until the next lesson (end of this part)
      const body = parts[li].slice(headEnd + 5)
      const periods = []
      // iterate period <tr> rows that contain td.pn
      const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g
      let tm
      while ((tm = trRe.exec(body))) {
        const row = tm[1]
        if (!/class="pn"/.test(row)) continue
        const pnm = row.match(/class="pn"[^>]*>([\s\S]*?)<\/td>/)
        const tpm = row.match(/class="tp"[^>]*>([\s\S]*?)<\/td>/)
        const oldm = row.match(/class="[^"]*\bch\b[^"]*\bold\b[^"]*"[^>]*>([\s\S]*?)<\/span>/)
        const cg = parseChip(row, 'cg')[0] || { code: '', text: '' }
        const comp = parseChip(row, 'c')[0] || { code: '', text: '' }
        const los = parseChip(row, 'lo')
        periods.push({
          no: odToInt(pnm ? pnm[1] : '') || (periods.length + 1),
          topic: stripTags(tpm ? tpm[1] : ''),
          cg: { code: cg.code, text: cg.text },
          competency: { code: comp.code, text: comp.text },
          los: los.map(l => ({ code: l.code, text: l.text })),
          oldLoCode: stripTags(oldm ? oldm[1] : ''),
        })
      }
      lessons.push({ name: lname, order: li, unit, pages, skill, periodCountStated: odToInt(np), periodCount: periods.length, periods })
    }
    books.push({ bookName, subjectKey, lessons })
  }
  return { classNo: String(classNo), books }
}

// Extract a leading chapter/lesson number from a title string.
// Handles Odia + Arabic digits and common prefixes (ପାଠ ୫ / Lesson 5 / ୫. / Unit 3).
export function chapterNum(s) {
  const t = String(s || '')
    .replace(/^(ପାଠ|ଅଧ୍ୟାୟ|ଏକକ|ପ୍ରସଙ୍ଗ|Unit|Lesson|Chapter)\s*/i, '')
    .trim()
  return odToInt(t)
}

// Enrich a raw catalog list ([{title}]) with norm + number for matching.
export function buildCatalog(list) {
  return (list || []).map(c => ({ title: c.title, n: norm(c.title), num: chapterNum(c.title) }))
}

// Match a lesson to a catalog chapter. catalog = [{title, n, num}].
// Strategy (in order): (1) lesson-number ↔ chapter-number, (2) exact normalised
// name, (3) loose substring name match. Returns { title, method } | null.
// `lesson` may be a string (name only) or an object { name, order }.
export function matchChapter(lesson, catalog) {
  const name = typeof lesson === 'string' ? lesson : (lesson?.name || '')
  const cat = catalog || []
  const ln = norm(name)
  if (!cat.length) return null
  // (1) number match — only when BOTH sides have an unambiguous number
  const lnum = chapterNum(name)
  if (lnum != null) {
    const byNum = cat.filter(c => c.num != null && c.num === lnum)
    if (byNum.length === 1) return { title: byNum[0].title, method: 'number' }
    // if several share the number, disambiguate by name below
    if (byNum.length > 1 && ln) {
      const n2 = byNum.find(c => c.n === ln) || byNum.find(c => ln.length > 3 && (c.n.includes(ln) || ln.includes(c.n)))
      if (n2) return { title: n2.title, method: 'number' }
    }
  }
  if (!ln) return null
  // (2) exact normalised name
  const exact = cat.find(c => c.n === ln)
  if (exact) return { title: exact.title, method: 'exact' }
  // (3) loose substring
  const loose = cat.find(c => ln.length > 3 && (c.n.includes(ln) || ln.includes(c.n)))
  if (loose) return { title: loose.title, method: 'loose' }
  return null
}

// All LO + old codes in a lesson (for search index)
export function lessonCodes(lesson) {
  const codes = new Set()
  for (const p of lesson.periods || []) {
    if (p.cg?.code) codes.add(p.cg.code)
    if (p.competency?.code) codes.add(p.competency.code)
    for (const lo of p.los || []) if (lo.code) codes.add(lo.code)
    if (p.oldLoCode) codes.add(p.oldLoCode)
  }
  return [...codes]
}
