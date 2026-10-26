// Lesson Guru Odisha — 5E HTML lesson plan parser (Class 9 & 10)
// Parses 5E-Model HTML lesson plans (Engage / Explore / Explain / Elaborate / Evaluate)
// designed for Secondary (Class IX / X) subjects under OCF-SE 2025 / SCERT Odisha.
//
// Expected HTML structure (per Period):
//   <section class="period">
//     <h2 class="period-head">PERIOD N (Duration: ...)</h2>
//     <div class="topic-banner"><strong>Topic:</strong> ...</div>
//     <table class="plan">
//       <tr><td class="lbl">SECTION-LABEL</td><td class="content">...HTML...</td></tr>
//       ...
//       <tr><td class="lbl" colspan="2">5E Teaching Process</td></tr>
//       <tr><td class="full" colspan="2"><table class="fivee">5 rows × 4 cols</table></td></tr>
//     </table>
//   </section>
//
// Returns: {
//   meta: { className, subject, chapterTitle, chapterNumber, totalPeriods, durationMin },
//   periods: [ { period, topic, sections: { LO, Competencies, ... }, fiveE: [{stage,time,teacher,student}] } ]
// }

const cheerio = require('cheerio')

// Map common variations of Class IX / X to canonical names
const CLASS_NAME_MAP = [
  { rx: /class\s*(ix|9|nine)/i,  name: 'Class 9' },
  { rx: /class\s*(x|10|ten)/i,   name: 'Class 10' },
  { rx: /\bIX\b/,                name: 'Class 9' },
  { rx: /\bX\b/,                 name: 'Class 10' },
]

// 5E sections we care about. Keys MUST match the order of `td.lbl` strings in the source HTML.
// We deliberately normalise the labels (strip "(LO)" etc.) to a canonical short key.
const SECTION_KEYS = [
  { label: /^learning\s+outcomes?/i,             key: 'learningOutcomes' },
  { label: /^competencies?$/i,                    key: 'competencies' },
  { label: /^learning\s+objectives?/i,           key: 'learningObjectives' },
  { label: /^previous\s+knowledge/i,             key: 'previousKnowledge' },
  { label: /^teaching.?learning\s+materials?/i,  key: 'tlm' },
  { label: /^board\s+work\s+plan/i,              key: 'boardWork' },
  { label: /^competency.?based\s+questions?/i,   key: 'competencyQuestions' },
  { label: /^hots\s+questions?/i,                key: 'hotsQuestions' },
  { label: /^real.?life\s+applications?/i,       key: 'realLifeApplications' },
  { label: /^ict\s+integration/i,                key: 'ictIntegration' },
  { label: /^art\s+integration/i,                key: 'artIntegration' },
  { label: /^inclusive\s+education/i,            key: 'inclusiveEducation' },
  { label: /^differentiated\s+instruction/i,     key: 'differentiatedInstruction' },
  { label: /^formative\s+assessment/i,           key: 'formativeAssessment' },
  { label: /^exit\s+ticket/i,                    key: 'exitTicket' },
  { label: /^homework$/i,                        key: 'homework' },
  { label: /^teacher\s+reflection/i,             key: 'teacherReflection' },
]

// Human-readable display names (used by the frontend / exports)
const SECTION_DISPLAY = {
  learningOutcomes:           '🎯 Learning Outcomes (LO)',
  competencies:               '💡 Competencies',
  learningObjectives:         '🎯 Learning Objectives',
  previousKnowledge:          '📚 Previous Knowledge',
  tlm:                        '🧰 Teaching–Learning Materials (TLM)',
  boardWork:                  '🧑‍🏫 Board Work Plan',
  competencyQuestions:        '❓ Competency-Based Questions',
  hotsQuestions:              '🧠 HOTS Questions',
  realLifeApplications:       '🌍 Real-Life Applications',
  ictIntegration:             '💻 ICT Integration',
  artIntegration:             '🎨 Art Integration',
  inclusiveEducation:         '🤝 Inclusive Education Strategy',
  differentiatedInstruction:  '📊 Differentiated Instruction',
  formativeAssessment:        '✅ Formative Assessment',
  exitTicket:                 '🎟️ Exit Ticket',
  homework:                   '📝 Homework',
  teacherReflection:          '🔄 Teacher Reflection',
}

function textOf($, el) {
  if (!el) return ''
  return $(el).text().replace(/\s+/g, ' ').trim()
}

function htmlOf($, el) {
  if (!el) return ''
  return $.html(el)
}

// Convert <ul><li>...</li></ul> into plain "- bullet" lines while keeping bold/italic markers.
// Falls back to raw text for inline content.
function extractBulletText($, contentEl) {
  const $c = $(contentEl).clone()
  // Convert <strong>/<b> to **bold**, <em>/<i> to _italic_ for downstream rendering
  $c.find('strong, b').each((_, n) => { $(n).replaceWith(`**${$(n).text()}**`) })
  $c.find('em, i').each((_, n) => { $(n).replaceWith(`_${$(n).text()}_`) })
  $c.find('br').replaceWith('\n')
  const lis = $c.find('li')
  if (lis.length > 0) {
    return lis.map((_, li) => $(li).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean)
  }
  // No <li> — return paragraphs split by line break
  const txt = $c.text().replace(/\s+/g, ' ').trim()
  return txt ? [txt] : []
}

// Map a section label (from td.lbl text) → canonical key, or null if unrecognised
function matchSectionKey(label) {
  const s = (label || '').replace(/\s+/g, ' ').trim()
  for (const entry of SECTION_KEYS) {
    if (entry.label.test(s)) return entry.key
  }
  return null
}

// Detect class name from any header / topic / banner text in the document.
function detectClassName($) {
  // Pull text from title cards, school table, and all heading-style elements
  const blocks = [
    $('.titlecard').text(),
    $('.school').text(),
    $('h1, h2, h3, h4, h5, h6, .title, .sub, .banner, .cover, .cover-details').text(),
  ].join(' ')
  const all = (blocks || $('body').text() || '').replace(/\s+/g, ' ').slice(0, 6000)
  for (const m of CLASS_NAME_MAP) {
    if (m.rx.test(all)) return m.name
  }
  return null
}

// Try to detect subject name from headers
function detectSubject($) {
  const candidates = []
  $('.titlecard, .sub, .school, h1, h2, h3, td, th, .title, .banner').each((_, n) => {
    const t = $(n).text().replace(/\s+/g, ' ').trim()
    if (!t) return
    const m = t.match(/subject\s*[:\-–—]\s*([^()|·•]{3,60})/i)
    if (m) candidates.push(m[1].trim())
    if (/skills\s+of\s+communicative\s+english/i.test(t)) candidates.push('English')
    else if (/\benglish\b/i.test(t) && t.length < 50) candidates.push('English')
    else if (/\bmathematics\b|\bmaths?\b/i.test(t) && t.length < 50) candidates.push('Mathematics')
    else if (/\bscience\b/i.test(t) && t.length < 50) candidates.push('Science')
    else if (/\bsocial\s+science\b|\bsst\b/i.test(t) && t.length < 50) candidates.push('Social Science')
    else if (/\bodia\b|ଓଡ଼ିଆ/i.test(t) && t.length < 50) candidates.push('Odia')
    else if (/\bhindi\b|ହିନ୍ଦୀ/i.test(t) && t.length < 50) candidates.push('Hindi')
    else if (/\bsanskrit\b|ସଂସ୍କୃତ/i.test(t) && t.length < 50) candidates.push('Sanskrit')
  })
  // Return the most-common candidate
  if (candidates.length === 0) return null
  const freq = {}
  for (const c of candidates) freq[c] = (freq[c] || 0) + 1
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]
}

// Try to detect chapter title + number from headers
function detectChapter($) {
  let chapterNumber = null
  let chapterTitle = null
  const scan = (txt) => {
    if (!txt) return
    const t = txt.replace(/\s+/g, ' ').trim()
    // Examples we want to match:
    //   "Chapter 1: The Priceless Gift"
    //   "Chapter 1 — The Priceless Gift (Detailed Text, Prose)"
    //   "Chapter — 1 — The Priceless Gift"
    let m = t.match(/chapter\s*[-–—]?\s*(\d+)\s*[:\-–—]\s*(.{2,140}?)(?:\s*[|·•]|$|\s*\(\d)/i)
    if (!m) m = t.match(/chapter\s*[-–—]?\s*(\d+)\s*[:\-–—]\s*(.{2,140})/i)
    if (m) {
      if (!chapterNumber) chapterNumber = Number(m[1])
      if (!chapterTitle) chapterTitle = m[2].trim().replace(/\s*\(.*?\)$/, '').trim()
    }
  }
  // Scan title card, sub, school table cells, headings
  $('.titlecard, .sub, .school td, h1, h2, h3, h4').each((_, n) => scan($(n).text()))
  // Fallback: scan whole body
  if (!chapterTitle) scan($('body').text().slice(0, 4000))
  return { chapterNumber: chapterNumber || 1, chapterTitle }
}

// Parse the 5E activity grid (table.fivee) for a period
function parseFiveEGrid($, fiveeTable) {
  const rows = $(fiveeTable).find('tbody tr')
  const out = []
  rows.each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 4) return
    const stageRaw = $(tds[0]).text().replace(/\s+/g, ' ').trim()
    const time     = $(tds[1]).text().replace(/\s+/g, ' ').trim()
    const teacher  = $(tds[2]).text().replace(/\s+/g, ' ').trim()
    const student  = $(tds[3]).text().replace(/\s+/g, ' ').trim()
    // Normalise stage: "1. ENGAGE" → ENGAGE; uppercase
    const stage = stageRaw.replace(/^\d+\.\s*/, '').toUpperCase().trim()
    out.push({ stage, time, teacher, student })
  })
  return out
}

// Parse one <section class="period"> block
function parsePeriod($, sectionEl) {
  const head = $(sectionEl).find('h2.period-head, .period-head').first()
  let periodNum = 1
  let durationMin = 45
  const headText = head.text() || ''
  const mN = headText.match(/period\s*(\d+)/i)
  if (mN) periodNum = Number(mN[1])
  const mD = headText.match(/(\d+)\s*minute/i) || headText.match(/(\d+)\s*min/i)
  if (mD) durationMin = Number(mD[1])

  // Topic
  let topic = ''
  const banner = $(sectionEl).find('.topic-banner').first()
  if (banner.length) {
    topic = banner.text().replace(/^topic\s*:?/i, '').replace(/\s+/g, ' ').trim()
  }

  // Walk table.plan rows
  const sections = {}
  let fiveE = []
  const planTable = $(sectionEl).find('table.plan').first()
  const rows = planTable.find('> tbody > tr, > tr')

  rows.each((_, tr) => {
    const $tr = $(tr)
    const lbl = $tr.find('td.lbl').first()
    const content = $tr.find('td.content').first()
    const full = $tr.find('td.full').first()

    if (lbl.length && content.length) {
      const labelText = lbl.text().replace(/\s+/g, ' ').trim()
      const key = matchSectionKey(labelText)
      if (key) {
        sections[key] = {
          items: extractBulletText($, content[0]),
          html: htmlOf($, content[0]).replace(/^<td[^>]*>|<\/td>$/g, ''),
        }
      }
    }
    // 5E grid row (label has colspan=2 OR the next row has class="full")
    if (full.length) {
      const five = full.find('table.fivee').first()
      if (five.length) fiveE = parseFiveEGrid($, five[0])
    }
  })

  return {
    period: periodNum,
    durationMin,
    topic,
    sections,
    fiveE,
  }
}

// ============ Public entry point ============
function parse5E(html) {
  if (!html || typeof html !== 'string') {
    return { ok: false, error: 'Empty or invalid HTML' }
  }
  const $ = cheerio.load(html, { decodeEntities: true })
  const className = detectClassName($)
  const subject = detectSubject($)
  const { chapterNumber, chapterTitle } = detectChapter($)
  const periodNodes = $('section.period').toArray()
  if (periodNodes.length === 0) {
    return { ok: false, error: 'No <section class="period"> blocks found. Is this a 5E format file?' }
  }
  const periods = periodNodes.map(el => parsePeriod($, el))
  const errors = []
  if (!className) errors.push('Could not detect Class (must be Class 9 or Class 10).')
  if (!chapterTitle) errors.push('Could not detect chapter title.')
  return {
    ok: errors.length === 0,
    errors,
    warnings: !subject ? ['Subject not detected — defaulting to "English"'] : [],
    meta: {
      className: className || 'Class 9',
      subject: subject || 'English',
      chapterNumber,
      chapterTitle: chapterTitle || `Chapter ${chapterNumber}`,
      totalPeriods: periods.length,
    },
    periods,
  }
}

module.exports = {
  parse5E,
  SECTION_KEYS,
  SECTION_DISPLAY,
}
