// === ABP === Activity-based Panchapadi lesson-plan HTML parser.
// Pure functions only (no DB, no network). Parses the uploaded chapter HTML
// files + the yearly-summary file into structured JSON for the website.
//
// Source HTML structure (per the uploaded Class 4 Odia ZIP):
//  - Chapter file: one <article class="page ov"> overview + N <article class="page">
//    period pages. <meta name="periods"> / data-periods carry the real count.
//  - Overview: header right has "ଶ୍ରେଣୀ: ୪ (ଚତୁର୍ଥ)" + "ବିଷୟ: ...", h2 chapter title,
//    boxes Theme / Main Competencies / Main LOs, ol.plist period list, ovr LO-code table.
//  - Period: .pnum strong = Odia period number, h2 = title, p.chap = subject|class|chapter,
//    .box.fw (Curricular Goal + Competency w/ span.code), .box.lo-box (p.lead LO + objective
//    + skill focus), .box.codes (span.code.lo OD codes), .tlm, .stages(5 x section.stage),
//    .foot (.af assessment + .af.hw homework).
import * as cheerio from 'cheerio'

const ODIA = '୦୧୨୩୪୫୬୭୮୯'

export function odiaToAscii(s) {
  if (s == null) return ''
  return String(s).replace(/[୦-୯]/g, (c) => String(ODIA.indexOf(c)))
}
export function asciiToOdia(n) {
  return String(n).replace(/[0-9]/g, (d) => ODIA[Number(d)])
}
// Parse a possibly-Odia numeric string to an integer (first run of digits).
export function toInt(s) {
  const m = odiaToAscii(s).match(/-?\d+/)
  return m ? parseInt(m[0], 10) : null
}

const clean = (t) => String(t || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()

// The 5 Panchapadi stages in fixed order with Odia + English names + colour key.
export const ABP_STAGES = [
  { key: 's1', odia: 'ଅଧୀତି', en: 'Adhiti', color: 'sky' },
  { key: 's2', odia: 'ବୋଧ', en: 'Bodha', color: 'green' },
  { key: 's3', odia: 'ଅଭ୍ୟାସ', en: 'Abhyasa', color: 'saffron' },
  { key: 's4', odia: 'ପ୍ରୟୋଗ', en: 'Prayoga', color: 'coral' },
  { key: 's5', odia: 'ପ୍ରସାର', en: 'Prasara', color: 'purple' },
]

// Split a `.box` into { heading(lower-case English hint): [p-nodes] } sections,
// where each h4 starts a new section and the <p>/<ol> after it belong to it.
function sectionsOf($, boxEl) {
  const out = []
  let cur = null
  $(boxEl).children().each((_, el) => {
    const tag = el.tagName && el.tagName.toLowerCase()
    if (tag === 'h4' || tag === 'h3') {
      cur = { heading: clean($(el).text()), nodes: [] }
      out.push(cur)
    } else if (cur) {
      cur.nodes.push(el)
    }
  })
  return out
}

// Pull { codes:[...], text:'...' } from a <p> that may start with <span class="code">.
function codeAndText($, pEl) {
  const $p = $(pEl)
  const codes = []
  $p.find('span.code').each((_, s) => { const c = clean($(s).text()); if (c) codes.push(c) })
  const $clone = $p.clone()
  $clone.find('span.code').remove()
  return { codes, text: clean($clone.text()) }
}

// Parse a single period <article>.
export function parsePeriod($, art) {
  const $a = $(art)
  const warnings = []
  const number = toInt($a.find('.pnum strong').first().text())
  const title = clean($a.find('header .ttl h2').first().text())
  const chapLine = clean($a.find('header .ttl p.chap').first().text())

  // .meta has three boxes: fw (CG + competency), lo-box (LO/objective/skill), codes (LO codes)
  let curricularGoal = { codes: [], text: '' }
  const competencies = []
  let learningOutcome = '', objective = '', skillFocus = ''
  const loCodes = []

  const fw = $a.find('.meta .box.fw').first()
  if (fw.length) {
    const secs = sectionsOf($, fw[0])
    for (const sec of secs) {
      const isCg = /Curricular Goal|ଲକ୍ଷ୍ୟ/.test(sec.heading)
      const isComp = /Competency|ଦକ୍ଷତା/.test(sec.heading)
      for (const n of sec.nodes) {
        if ((n.tagName || '').toLowerCase() !== 'p') continue
        const ct = codeAndText($, n)
        if (isCg) {
          if (ct.codes.length) curricularGoal.codes.push(...ct.codes)
          curricularGoal.text = [curricularGoal.text, ct.text].filter(Boolean).join(' ')
        } else if (isComp) {
          competencies.push(ct)
        }
      }
    }
  }

  const lobox = $a.find('.meta .box.lo-box').first()
  if (lobox.length) {
    const secs = sectionsOf($, lobox[0])
    for (const sec of secs) {
      const txt = sec.nodes.map((n) => clean($(n).text())).filter(Boolean).join(' ')
      if (/Learning Outcome|ଫଳାଫଳ/.test(sec.heading)) learningOutcome = txt
      else if (/ଉଦ୍ଦେଶ୍ୟ|objective/i.test(sec.heading)) objective = txt
      else if (/ଫୋକସ|focus|skill/i.test(sec.heading)) skillFocus = txt
    }
    // p.lead is the authoritative LO line if present
    const lead = clean(lobox.find('p.lead').first().text())
    if (lead) learningOutcome = lead
  }

  const codesBox = $a.find('.meta .box.codes').first()
  if (codesBox.length) {
    codesBox.find('p').each((_, p) => {
      const ct = codeAndText($, p)
      if (ct.codes.length || ct.text) loCodes.push({ code: ct.codes[0] || '', text: ct.text })
    })
  }

  // TLM — text after the <b> label inside .tlm
  let tlm = ''
  const tlmEl = $a.find('.tlm').first()
  if (tlmEl.length) { const c = tlmEl.clone(); c.find('b').remove(); tlm = clean(c.text()) }

  // 5 stages
  const stages = []
  ABP_STAGES.forEach((meta) => {
    const sec = $a.find(`.stages section.stage.${meta.key}`).first()
    if (!sec.length) { warnings.push(`missing stage ${meta.key} (${meta.en})`); stages.push({ ...meta, num: asciiToOdia(ABP_STAGES.indexOf(meta) + 1), activities: [] }); return }
    const num = clean(sec.find('h3 .n').first().text()) || asciiToOdia(ABP_STAGES.indexOf(meta) + 1)
    const activities = []
    sec.find('ol > li').each((i, li) => {
      const $li = $(li).clone()
      const label = clean($li.find('em').first().text())
      $li.find('em').remove()
      const text = clean($li.text())
      if (text || label) activities.push({ n: i + 1, label, text })
    })
    if (!activities.length) warnings.push(`stage ${meta.key} (${meta.en}) has no activities`)
    stages.push({ key: meta.key, odia: meta.odia, en: meta.en, color: meta.color, num, activities })
  })

  // foot: assessment + homework
  let assessment = '', homework = ''
  $a.find('.foot .af').each((_, af) => {
    const $af = $(af)
    const head = clean($af.find('h4').first().text())
    const c = $af.clone(); c.find('h4').remove()
    const body = clean(c.text())
    if (/ଗୃହକାର୍ଯ୍ୟ|Homework/i.test(head) || $af.hasClass('hw')) homework = body
    else assessment = body
  })

  if (!title) warnings.push('period title missing')
  if (!learningOutcome) warnings.push('learning outcome missing')

  return { number, title, chapLine, curricularGoal, competencies, learningOutcome, objective, skillFocus, loCodes, tlm, stages, assessment, homework, warnings }
}

// Parse a whole chapter HTML file. `filename` is used for the ordering prefix.
export function parseChapterHtml(html, { filename = '' } = {}) {
  const $ = cheerio.load(html)
  const warnings = []

  // ---- period count signals ----
  const metaPeriods = toInt($('meta[name="periods"]').attr('content')) ?? toInt($('html').attr('data-periods'))
  const periodArticles = $('article.page').not('.ov').toArray()
  const pageCount = periodArticles.length
  if (metaPeriods != null && metaPeriods !== pageCount) {
    warnings.push(`period count mismatch: meta=${metaPeriods} vs pages=${pageCount} (using page count ${pageCount})`)
  }

  // ---- overview ----
  const ov = $('article.page.ov').first()
  const h2 = clean(ov.find('header .ttl h2').first().text())
  // strip leading "ଅଧ୍ୟାୟ <num> :" / "ଅଧ୍ୟାୟ <num> ·"
  const titleFull = h2.replace(/^ଅଧ୍ୟାୟ\s*[୦-୯0-9]+\s*[:·।]\s*/u, '').trim()
  const genreMatch = titleFull.match(/\(([^)]+)\)/)
  const genre = genreMatch ? clean(genreMatch[1]) : ''
  const titleShort = clean(titleFull.split('(')[0]) || titleFull

  // number: prefer filename prefix, fall back to h2
  const fnNum = filename && filename.match(/^\s*0*([0-9]+)[_\-\s]/)
  const number = fnNum ? parseInt(fnNum[1], 10) : (toInt(h2) ?? null)

  // header right: class + subject. The two <p> tags give text with no separator,
  // so split on "ବିଷୟ" to keep class and subject apart.
  const hdrR = ov.find('header .hdr-r').text().replace(/\u00a0/g, ' ')
  const classText = clean((hdrR.match(/ଶ୍ରେଣୀ\s*:?\s*([^\n]*?)(?:\s*ବିଷୟ|$)/u) || [, ''])[1])
  const cls = toInt(classText)
  const classLabel = classText ? `ଶ୍ରେଣୀ: ${classText}` : ''
  const subjectText = clean((hdrR.match(/ବିଷୟ\s*:?\s*([^\n]*)/u) || [, ''])[1])

  // overview boxes (Theme / Main Competencies / Main LOs)
  let theme = '', mainCompetencies = '', mainLearningOutcomes = ''
  ov.find('.ovl .box').each((_, b) => {
    const $b = $(b)
    const head = clean($b.find('h4').first().text())
    const c = $b.clone(); c.find('h4').remove(); c.find('ol').remove()
    const body = clean(c.text())
    if (/Theme|ଭାବନା/i.test(head)) theme = body
    else if (/Main Competencies|ମୁଖ୍ୟ ଦକ୍ଷତା/i.test(head)) mainCompetencies = body
    else if (/Learning Outcome|ଶିକ୍ଷଣ ଫଳାଫଳ/i.test(head)) mainLearningOutcomes = body
  })

  // period list (ol.plist)
  const planList = []
  ov.find('ol.plist > li').each((_, li) => {
    const $li = $(li).clone()
    const n = toInt($li.find('span').first().text())
    $li.find('span').remove()
    planList.push({ n, title: clean($li.text()) })
  })

  // LO-code table (ovr)
  const loCodes = []
  ov.find('.ovr table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length >= 2) loCodes.push({ code: clean($(tds[0]).text()), text: clean($(tds[1]).text()), periods: clean($(tds[2]).text()) })
  })

  // ---- periods ----
  const periods = periodArticles.map((art) => parsePeriod($, art)).sort((a, b) => (a.number || 0) - (b.number || 0))
  const periodWarnings = periods.reduce((a, p) => a + (p.warnings?.length || 0), 0)
  if (periodWarnings) warnings.push(`${periodWarnings} field warning(s) across periods`)

  return {
    number, title: titleShort, titleFull, genre,
    class: cls, classLabel, classText,
    subject: subjectText,
    theme, mainCompetencies, mainLearningOutcomes,
    planList, loCodes,
    metaPeriods, pageCount, periodCount: pageCount,
    periods, warnings,
  }
}

// Parse the yearly-summary file: cover stats + every <table> into a generic
// { caption, headers, rows } structure. Also keeps a light sanitized title.
export function parseYearPlanHtml(html) {
  const $ = cheerio.load(html)
  const warnings = []
  const title = clean($('title').first().text()) || clean($('h1').first().text())

  // cover stats (div.stats > div > b + span)
  const stats = []
  $('.stats > div').each((_, d) => {
    const b = clean($(d).find('b').first().text())
    const span = clean($(d).find('span').first().text())
    if (b || span) stats.push({ value: b, label: span })
  })

  const tables = []
  $('table').each((_, t) => {
    const $t = $(t)
    const caption = clean($t.prevAll('.ph').first().find('h3').first().text()) || clean($t.find('caption').first().text())
    const headers = []
    $t.find('thead tr').last().find('th').each((_, th) => headers.push(clean($(th).text())))
    const rows = []
    $t.find('tbody tr').each((_, tr) => {
      const cells = []
      $(tr).find('td').each((_, td) => {
        const colspan = Number($(td).attr('colspan') || 1)
        cells.push({ text: clean($(td).text()), colspan, span: colspan > 1 })
      })
      if (cells.length) rows.push(cells)
    })
    tables.push({ caption, headers, rows })
  })
  if (!tables.length) warnings.push('no tables found in year plan')

  return { title, stats, tables, warnings }
}

// Lightweight header-only sniff for admin prefill (class + subject) without a full parse.
export function sniffChapterHeader(html) {
  const $ = cheerio.load(html)
  const ov = $('article.page.ov').first()
  const hdrR = ov.find('header .hdr-r').text()
  const classText = clean((hdrR.match(/ଶ୍ରେଣୀ\s*:?\s*([^\n]*?)(?:ବିଷୟ|$)/u) || [, ''])[1])
  const subjectText = clean((hdrR.match(/ବିଷୟ\s*:?\s*([^\n]*)/u) || [, ''])[1])
  const h2 = clean(ov.find('header .ttl h2').first().text())
  return { class: toInt(classText), classText, subject: subjectText, chapterTitle: h2 }
}
