// ============================================================================
//  Professional Assessment — SCERT/OSEPA HTML template
//  ---------------------------------------------------------------------------
//  Takes an AssessmentPacket (produced by /app/lib/assessment-builder.js) and
//  produces a print-ready HTML document.
//
//  Structure (per user spec + uploaded reference):
//    Header
//    ↓ Student Details
//    ↓ Instructions
//    ↓ Section A / B / C / D ...
//    ↓ Teacher Observation                (optional)
//    ↓ Rubrics                            (optional)
//    ↓ Answer Key (separate page)         (optional)
//    ↓ Blueprint  (separate page)         (optional)
//
//  Optimised for both browser preview and Puppeteer PDF export.
// ============================================================================
import { readFileSync } from 'fs'
import { toOdiaNum, ODIA_SECTION_LETTERS } from './prompts/question-types.js'

// ---------------------------------------------------------------------------
// 🛡  asArr(x) — coerce anything into an array, defensively.
// The AI generator sometimes returns `options` / `steps` / `materials` /
// `indicators` / `answerKey` / `blueprint` as a bare string, a bare object,
// or `null`.  `asArr(x).map(...)` fails on those with the exact error
// teachers report: "PDF failed: (t.options || []).map is not a function".
// Using asArr() everywhere makes the renderer forgiving.
// ---------------------------------------------------------------------------
const asArr = (x) => {
  if (Array.isArray(x)) return x
  if (x == null || x === '') return []
  // Object with numeric keys? {0:'a',1:'b'} → ['a','b']
  if (typeof x === 'object') {
    const keys = Object.keys(x)
    if (keys.length && keys.every(k => /^\d+$/.test(k))) {
      return keys.sort((a, b) => Number(a) - Number(b)).map(k => x[k])
    }
    // Object with a single 'items' / 'list' / 'values' array inside?
    for (const k of ['items', 'list', 'values', 'options', 'choices']) {
      if (Array.isArray(x[k])) return x[k]
    }
    // Otherwise return the object's values.
    return Object.values(x).filter(v => v != null)
  }
  // Primitives — wrap as a single-item array.
  return [x]
}

// ---------------------------------------------------------------------------
// Odia font embedding — critical for Puppeteer PDF on production containers
// that ship without Odia system fonts.  Loaded once, cached for the process.
// ---------------------------------------------------------------------------
let _odiaFontCSS = null
const loadOdiaFontCSS = () => {
  if (_odiaFontCSS !== null) return _odiaFontCSS
  const candidates = [
    { r: '/app/public/fonts/NotoSansOriyaUI-Regular.ttf', b: '/app/public/fonts/NotoSansOriyaUI-Bold.ttf' },
    { r: '/app/public/fonts/NotoSansOriya-Regular.ttf',   b: '/app/public/fonts/NotoSansOriya-Bold.ttf' },
    { r: '/usr/share/fonts/truetype/noto/NotoSansOriyaUI-Regular.ttf', b: '/usr/share/fonts/truetype/noto/NotoSansOriyaUI-Bold.ttf' },
  ]
  for (const c of candidates) {
    try {
      const reg = readFileSync(c.r).toString('base64')
      const bold = readFileSync(c.b).toString('base64')
      _odiaFontCSS = `
        @font-face { font-family: 'Noto Sans Oriya Embedded'; font-weight: 400; font-display: block; src: url(data:font/ttf;base64,${reg}) format('truetype'); }
        @font-face { font-family: 'Noto Sans Oriya Embedded'; font-weight: 700; font-display: block; src: url(data:font/ttf;base64,${bold}) format('truetype'); }`
      return _odiaFontCSS
    } catch (_err) { /* try next */ }
  }
  _odiaFontCSS = ''
  return _odiaFontCSS
}

/** Escape a string for safe HTML embedding. */
const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const SCERT_CSS = `
${loadOdiaFontCSS()}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'Noto Sans Oriya Embedded', 'Noto Sans Oriya UI', 'Noto Sans Oriya', 'Kalinga', 'Nirmala UI', 'Lohit Odia', 'Utkal', 'Kohinoor Odia', 'Sakal Bharati', 'Arial Unicode MS', sans-serif;
  color: #1a1a1a;
  background: #fff;
  line-height: 1.55;
  font-size: 12.5pt;
  font-feature-settings: "liga" 1, "clig" 1, "calt" 1, "kern" 1;
  text-rendering: optimizeLegibility;
}
.container { max-width: 780px; margin: 0 auto; padding: 22px 26px 42px; }
.paper-header {
  text-align: center;
  border-bottom: 2px solid #0B5FFF;
  padding-bottom: 10px;
  margin-bottom: 14px;
}
.paper-header .school {
  font-size: 15pt; font-weight: 700; color: #0B5FFF; letter-spacing: 0.3px;
}
.paper-header .title {
  font-size: 18pt; font-weight: 800; margin-top: 4px;
}
.paper-header .subtitle {
  font-size: 11.5pt; color: #444; margin-top: 2px;
}
table.student-info-table {
  width: 100%; border-collapse: collapse; margin: 6px 0 10px;
  font-size: 11pt;
}
table.student-info-table td {
  border: 1px solid #999; padding: 6px 8px; vertical-align: middle;
}
.instructions {
  border-left: 4px solid #FF9800;
  background: #FFF8EF;
  padding: 8px 12px;
  margin: 10px 0 14px;
  font-size: 11pt;
}
.instructions .heading { font-weight: 700; margin-bottom: 4px; }
.instructions ol { margin: 0; padding-left: 22px; }
.instructions li { margin-bottom: 2px; }

.section-title {
  background: linear-gradient(90deg, #EEF3FF 0%, #FFFFFF 100%);
  border-left: 5px solid #0B5FFF;
  padding: 6px 10px;
  margin: 14px 0 8px;
  font-weight: 700;
  font-size: 12.5pt;
  page-break-after: avoid;
}
.question-block {
  margin: 6px 0 10px;
  font-size: 11.5pt;
  page-break-inside: avoid;
}
.q-num { font-weight: 700; margin-right: 4px; }
.blank {
  display: inline-block;
  min-width: 90px;
  border-bottom: 1.5px dotted #333;
  margin: 0 2px;
}
.space-small  { height: 30px; border-bottom: 1px dashed #bbb; margin-top: 4px; }
.space-medium { height: 60px; border-bottom: 1px dashed #bbb; margin-top: 4px; }
.space-large  { height: 130px; border-bottom: 1px dashed #bbb; margin-top: 4px; }

.mcq-options { margin: 4px 0 0 14px; }
.mcq-options .opt { display: inline-block; min-width: 46%; margin: 1px 4px 1px 0; font-size: 11pt; }
.mcq-options .opt-label { display: inline-block; width: 20px; font-weight: 600; }

table.match-table {
  width: 100%; border-collapse: collapse; margin: 4px 0 8px;
  font-size: 11pt;
}
table.match-table th, table.match-table td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
table.match-table th { background: #F3F6FC; font-weight: 700; }

.case-passage { background: #F9FAFB; border: 1px solid #E5E7EB; padding: 8px 10px; border-radius: 6px; margin: 4px 0 6px; }
.sub-q { margin: 4px 0 4px 12px; }

/* Educational Image Library — inline illustrations for primary classes */
.q-image {
  page-break-inside: avoid;
  margin: 6px 0 4px;
  text-align: center;
}
.q-image img {
  display: inline-block;
  max-width: 120px;
  max-height: 120px;
  border-radius: 8px;
  border: 1px solid #E5E7EB;
  background: #fff;
  padding: 4px;
  object-fit: contain;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.q-image--picture img { max-width: 200px; max-height: 200px; }
.q-image--diagram img { max-width: 260px; max-height: 260px; }
.q-image-caption {
  font-size: 9pt;
  color: #6B7280;
  margin-top: 2px;
  font-style: italic;
}

.tc-block {
  page-break-inside: avoid;
  margin: 18px 0 8px;
}
.tc-block .tc-title {
  font-weight: 800; color: #FF6A00; font-size: 13pt;
  border-bottom: 1.5px solid #FF9800; padding-bottom: 4px; margin-bottom: 6px;
}

/* Assessment Interpretation grading */
.grading-section { margin-top: 22px; page-break-inside: avoid; }
.grading-title { font-weight: 700; margin-bottom: 4px; font-size: 12pt; color: #0B5FFF; }
table.grading-table { width: 100%; border-collapse: collapse; font-size: 11pt; }
table.grading-table th, table.grading-table td { border: 1px solid #999; padding: 6px 8px; }
table.grading-table th { background: #EEF3FF; }

.teacher-sign { display: flex; justify-content: space-between; gap: 12px; margin-top: 26px; font-size: 10.5pt; }
.signature-line { flex: 1; text-align: center; border-top: 1px solid #333; padding-top: 3px; }

/* Answer Key + Blueprint pages */
.page-break { page-break-before: always; }

/* --- ORAL PAGE (top of primary FA paper) ------------------------------- */
.oral-page {
  border: 2px dashed #6A1B9A;
  background: #FBF7FF;
  border-radius: 8px;
  padding: 10px 12px 12px;
  margin: 6px 0 14px;
  page-break-inside: avoid;
}
.oral-page .oral-title {
  display: flex; align-items: baseline; justify-content: space-between;
  font-size: 13pt; font-weight: 800; color: #6A1B9A; margin-bottom: 6px;
}
.oral-page .oral-badge {
  background: #6A1B9A; color: #fff; padding: 2px 10px; border-radius: 999px;
  font-size: 11pt; letter-spacing: 0.3px;
}
.oral-page .oral-marks {
  background: #fff; border: 1px solid #6A1B9A; color: #6A1B9A;
  padding: 1px 10px; border-radius: 999px; font-size: 11pt;
}
.oral-page .oral-guidance {
  font-size: 10.5pt; color: #555; margin-bottom: 8px;
}
.oral-page table.oral-table {
  width: 100%; border-collapse: collapse; font-size: 11.2pt;
}
.oral-page table.oral-table th,
.oral-page table.oral-table td {
  border: 1px solid #B39DDB; padding: 5px 7px; vertical-align: top;
}
.oral-page table.oral-table thead th { background: #EDE7F6; }
.oral-page .oral-section-divider {
  text-align: center;
  margin-top: 8px; padding-top: 8px;
  border-top: 1px dashed #B39DDB;
  font-size: 11pt; color: #6A1B9A;
}
.ak-title, .bp-title {
  text-align: center; font-size: 16pt; font-weight: 800; margin-top: 4px;
  color: #0B5FFF; border-bottom: 2px solid #0B5FFF; padding-bottom: 6px; margin-bottom: 12px;
}
table.ak-table { width: 100%; border-collapse: collapse; font-size: 11pt; }
table.ak-table th, table.ak-table td { border: 1px solid #999; padding: 6px 8px; vertical-align: top; }
table.ak-table th { background: #EEF3FF; text-align: left; }
table.ak-table td.num { width: 42px; text-align: center; font-weight: 700; }
table.ak-table td.sec { width: 58px; text-align: center; font-weight: 600; color: #0B5FFF; }
table.ak-table td.mk  { width: 60px; text-align: center; font-weight: 700; color: #16A34A; }

table.bp-table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
table.bp-table th, table.bp-table td { border: 1px solid #999; padding: 4px 6px; }
table.bp-table th { background: #EEF3FF; font-size: 10pt; }

@media print {
  body { font-size: 11pt; }
  .container { padding: 0 12mm 12mm; max-width: none; }
  .section-title { background: #EEF3FF !important; -webkit-print-color-adjust: exact; }
}
`.trim()

// ---------------------------------------------------------------------------
//  Section renderers per question type
// ---------------------------------------------------------------------------
const renderSection = (section, startNumber) => {
  const { key, questions = [] } = section
  const html = []
  html.push(`<div class="section-title">${esc(sectionHeaderLine(section))}</div>`)
  let n = startNumber

  // Show a visible warning if the section is empty (Gemini failed / rate-limited)
  if (!questions || questions.length === 0) {
    html.push(`<div style="margin:6px 0 14px;padding:10px 12px;border:1px solid #F59E0B;background:#FFFBEB;border-radius:8px;font-size:11pt;color:#92400E;">
      ⚠️ ${esc(section.error ? section.error : 'ଏହି ବିଭାଗ ପାଇଁ ପ୍ରଶ୍ନ ପ୍ରସ୍ତୁତ ହୋଇପାରିଲା ନାହିଁ। ଦୟାକରି କିଛି ମୁହୂର୍ତ୍ତ ପରେ ପୁଣି ପ୍ରୟାସ କରନ୍ତୁ।')}
    </div>`)
    return { html: html.join('\n'), nextNumber: n }
  }

  if (key === 'mcq') {
    for (const q of questions) {
      const opts = asArr(q.options).map((o, i) => `<span class="opt"><span class="opt-label">(${'क'.charAt(0) === 'क' ? String.fromCharCode(2848 + i) : String.fromCharCode(97 + i)})</span>${esc(o)}</span>`).join('')
      // Use Odia option markers (କ ଖ ଗ ଘ)
      const odiaOpts = asArr(q.options).map((o, i) => `<span class="opt"><span class="opt-label">(${ODIA_SECTION_LETTERS[i] || String.fromCharCode(97 + i)})</span> ${esc(o)}</span>`).join('')
      const img = q.image_url
        ? `<div class="q-image"><img src="${esc(q.image_url)}" alt="${esc(q.conceptKey || 'illustration')}"/></div>`
        : ''
      html.push(`<div class="question-block"><span class="q-num">${toOdiaNum(n++)}.</span>${esc(q.q)}${img}<div class="mcq-options">${odiaOpts}</div></div>`)
    }
  } else if (key === 'fill') {
    for (const q of questions) {
      const withBlank = String(q.q || '').replace(/______|_+|\.{3,}/g, '<span class="blank"></span>')
      const img = q.image_url
        ? `<div class="q-image"><img src="${esc(q.image_url)}" alt="${esc(q.conceptKey || 'illustration')}"/></div>`
        : ''
      html.push(`<div class="question-block"><span class="q-num">${toOdiaNum(n++)}.</span>${withBlank}${img}</div>`)
    }
  } else if (key === 'match') {
    // Only the FIRST match block is used (registry seeds a single match set)
    const m = questions[0]
    if (m) {
      const rows = Math.max(asArr(m.columnA).length, asArr(m.columnB).length)
      const rowsHtml = []
      for (let i = 0; i < rows; i++) {
        rowsHtml.push(`<tr>
          <td style="width:36px;text-align:center;font-weight:600">${toOdiaNum(i + 1)}</td>
          <td>${esc((m.columnA || [])[i] || '')}</td>
          <td style="width:36px;text-align:center;font-weight:600">${ODIA_SECTION_LETTERS[i] || ''}</td>
          <td>${esc((m.columnB || [])[i] || '')}</td>
        </tr>`)
      }
      if (m.instruction) html.push(`<div class="question-block"><span class="q-num">${toOdiaNum(n++)}.</span>${esc(m.instruction)}</div>`)
      html.push(`<table class="match-table">
        <thead><tr><th colspan="2" style="text-align:center">ସ୍ତମ୍ଭ କ</th><th colspan="2" style="text-align:center">ସ୍ତମ୍ଭ ଖ</th></tr></thead>
        <tbody>${rowsHtml.join('')}</tbody></table>`)
    }
  } else if (key === 'truefalse' || key === 'oneword') {
    for (const q of questions) {
      html.push(`<div class="question-block"><span class="q-num">${toOdiaNum(n++)}.</span>${esc(q.q)}<div class="space-small"></div></div>`)
    }
  } else if (key === 'vsa') {
    for (const q of questions) {
      html.push(`<div class="question-block"><span class="q-num">${toOdiaNum(n++)}.</span>${esc(q.q)}<div class="space-small"></div></div>`)
    }
  } else if (key === 'sa') {
    for (const q of questions) {
      html.push(`<div class="question-block"><span class="q-num">${toOdiaNum(n++)}.</span>${esc(q.q)}<div class="space-medium"></div></div>`)
    }
  } else if (key === 'la' || key === 'hots' || key === 'competency') {
    for (const q of questions) {
      const stem = key === 'competency'
        ? `<em style="display:block;background:#FFF8EF;padding:4px 8px;border-radius:4px;margin-bottom:4px;">ପ୍ରସଙ୍ଗ: ${esc(q.situation || '')}</em>${esc(q.q)}`
        : esc(q.q)
      html.push(`<div class="question-block"><span class="q-num">${toOdiaNum(n++)}.</span>${stem}<div class="space-large"></div></div>`)
    }
  } else if (key === 'casestudy') {
    for (const c of questions) {
      html.push(`<div class="question-block"><span class="q-num">${toOdiaNum(n++)}.</span>
        <div class="case-passage">${esc(c.passage || '')}</div>
        ${asArr(c.subQuestions).map((sq, i) => `<div class="sub-q">(${ODIA_SECTION_LETTERS[i] || ''}) ${esc(sq.q)}<div class="space-medium"></div></div>`).join('')}
      </div>`)
    }
  } else if (key === 'picture') {
    for (const it of questions) {
      const img = it.image_url
        ? `<div class="q-image q-image--picture"><img src="${esc(it.image_url)}" alt="${esc(it.conceptKey || 'picture')}"/></div>`
        : ''
      html.push(`<div class="question-block"><span class="q-num">${toOdiaNum(n++)}.</span>
        ${img}
        <div class="case-passage"><strong>ଚିତ୍ର:</strong> ${esc(it.pictureDescription || '')}</div>
        ${asArr(it.subQuestions).map((sq, i) => `<div class="sub-q">(${ODIA_SECTION_LETTERS[i] || ''}) ${esc(sq.q)}<div class="space-medium"></div></div>`).join('')}
      </div>`)
    }
  } else if (key === 'diagram') {
    for (const it of questions) {
      const img = it.image_url
        ? `<div class="q-image q-image--diagram"><img src="${esc(it.image_url)}" alt="${esc(it.conceptKey || 'diagram')}"/><div class="q-image-caption">ସହାୟକ ଚିତ୍ର (ଉଦାହରଣ)</div></div>`
        : ''
      html.push(`<div class="question-block"><span class="q-num">${toOdiaNum(n++)}.</span>${esc(it.q)}${img}<div class="space-large"></div></div>`)
    }
  } else if (key === 'activity' || key === 'project') {
    for (const it of questions) {
      const stepsHtml = asArr(it.steps).map((s, i) => `<li>${esc(s)}</li>`).join('')
      html.push(`<div class="question-block"><span class="q-num">${toOdiaNum(n++)}.</span>
        <strong>${esc(it.title || '')}</strong>
        ${it.objective ? `<div style="margin-top:2px"><em>ଉଦ୍ଦେଶ୍ୟ: ${esc(it.objective)}</em></div>` : ''}
        ${asArr(it.materials).length ? `<div><strong>ସାମଗ୍ରୀ:</strong> ${asArr(it.materials).map(esc).join(', ')}</div>` : ''}
        <ol style="margin:4px 0 0 22px;">${stepsHtml}</ol>
        ${it.markBreakdown ? `<div style="margin-top:2px;font-size:10.5pt;color:#666"><strong>ମୂଲ୍ୟାୟନ:</strong> ${esc(it.markBreakdown)}</div>` : ''}
        <div class="space-large"></div>
      </div>`)
    }
  }
  return { html: html.join('\n'), nextNumber: n }
}

const sectionHeaderLine = (section) =>
  `ବିଭାଗ - ${section.sectionLetterOdia}: ${section.labelOdia} [${toOdiaNum(section.count)} × ${toOdiaNum(section.marksPerQ)} = ${toOdiaNum(section.marks)} ନମ୍ବର]`

const renderInstructions = (instructions) => {
  if (!Array.isArray(instructions) || instructions.length === 0) {
    instructions = [
      'ସମସ୍ତ ପ୍ରଶ୍ନ ଆବଶ୍ୟକ।',
      'ପ୍ରତ୍ୟେକ ପ୍ରଶ୍ନ ପାଇଁ ନିର୍ଦ୍ଧାରିତ ସ୍ଥାନରେ ଉତ୍ତର ଲେଖ।',
      'ଉତ୍ତର ଓଡ଼ିଆ ଭାଷାରେ ଲେଖ।',
      'ଚିହ୍ନ ଅନୁସାରେ ଉତ୍ତର ଦିଅ।',
    ]
  }
  const items = instructions.slice(0, 6).map(i => `<li>${esc(i)}</li>`).join('')
  return `<div class="instructions"><div class="heading">ନିର୍ଦ୍ଦେଶାବଳୀ / Instructions</div><ol>${items}</ol></div>`
}

const renderHeader = (packet, brandName) => {
  const subject = packet.bookName || ''
  const chapterList = asArr(packet.chapterNames).join(', ')
  return `<div class="paper-header">
    <div class="school">${esc(brandName || 'LessonGuru Odisha')}</div>
    <div class="title">${esc(packet.title || packet.assessmentTypeLabel)}</div>
    <div class="subtitle">${esc(subject)} · ${esc(chapterList)}</div>
  </div>
  <table class="student-info-table">
    <tr>
      <td>ବିଦ୍ୟାର୍ଥୀଙ୍କ ନାମ:</td>
      <td colspan="3"></td>
    </tr>
    <tr>
      <td>ଶ୍ରେଣୀ: ${esc(packet.classNameOdia || packet.className || '')}</td>
      <td>ବିଭାଗ:</td>
      <td>ରୋଲ୍ ନମ୍ବର:</td>
      <td>ତାରିଖ:</td>
    </tr>
    <tr>
      <td>ବିଷୟ: ${esc(subject)}</td>
      <td colspan="2">${esc(chapterList)}</td>
      <td>ମୋଟ ନମ୍ବର: ${toOdiaNum(packet.totalMarks)} | ସମୟ: ${toOdiaNum(packet.durationMin)} ମିନିଟ୍</td>
    </tr>
  </table>`
}

// ---- Teacher-Conducted blocks (Oral / Practical / Observation / Rubrics) ---
const renderTeacherBlocks = (packet) => {
  const tb = packet.teacherBlocks || {}
  const parts = []
  // NOTE: Oral test is now rendered separately at the TOP of the paper by
  // renderOralPage() when the SCERT oral-first structure is active
  // (Balvatika–Class 5 FAs).  When NOT oral-first, keep the historic
  // in-place render so classes 6-10 still see it in the same spot.
  if (tb.oral && !tb.oral.error && !packet.oralFirstStructure) {
    const items = asArr(tb.oral.items).map((it, i) => `<li><strong>${toOdiaNum(i + 1)}.</strong> ${esc(it.q)}<div style="color:#666;font-size:10.5pt;margin-top:2px">ଉତ୍ତର ସୂଚକ: ${esc(it.expected)}</div></li>`).join('')
    parts.push(`<div class="tc-block"><div class="tc-title">ମୌଖିକ ମୂଲ୍ୟାୟନ (Oral Assessment)</div><ol style="margin:0 0 0 20px">${items}</ol></div>`)
  }
  if (tb.practical && !tb.practical.error) {
    const items = asArr(tb.practical.items).map((it, i) => `<li><strong>${esc(it.task)}</strong>
      ${(it.materials && it.materials.length) ? `<div>ସାମଗ୍ରୀ: ${asArr(it.materials).map(esc).join(', ')}</div>` : ''}
      <div style="color:#666;font-size:10.5pt">ପର୍ଯ୍ୟବେକ୍ଷଣ ପ୍ରସଙ୍ଗ: ${esc(it.observe)}</div></li>`).join('')
    parts.push(`<div class="tc-block"><div class="tc-title">ପ୍ରାୟୋଗିକ ମୂଲ୍ୟାୟନ (Practical Assessment)</div><ol style="margin:0 0 0 20px">${items}</ol></div>`)
  }
  // Observation & Rubrics are now rendered on their OWN pages (5 & 6) — not here.
  return parts.join('\n')
}

// ---- Page 1 (TOP) — Oral Test for SCERT/OSEPA primary FA papers ---
//   Renders the 5-mark Oral Test at the very TOP of the question paper
//   (Balvatika–Class 5, FA1/FA2) so the paper follows the official
//   "oral first, written after" flow. Callers signal this via
//   packet.oralFirstStructure === true.
const renderOralPage = (packet) => {
  if (!packet.oralFirstStructure) return ''
  const tb = packet.teacherBlocks || {}
  if (!tb.oral || tb.oral.error) return ''
  const items = asArr(tb.oral.items).slice(0, 5).map((it, i) => {
    const marks = it.marks || 1
    return `<tr>
      <td style="text-align:center;width:36px">${toOdiaNum(i + 1)}</td>
      <td>${esc(it.q)}${it.expected ? `<div style="color:#666;font-size:10.5pt;margin-top:2px"><strong>ଉତ୍ତର ସୂଚକ:</strong> ${esc(it.expected)}</div>` : ''}</td>
      <td style="text-align:center;width:60px;font-weight:600">${toOdiaNum(marks)}</td>
    </tr>`
  }).join('')
  const oralMarks = packet.oralMarks || 5
  return `
  <div class="oral-page">
    <div class="oral-title">
      <span class="oral-badge">Oral Test · ମୌଖିକ ପରୀକ୍ଷା</span>
      <span class="oral-marks">Marks: ${toOdiaNum(oralMarks)}</span>
    </div>
    <div class="oral-guidance">
      This oral section is conducted by the teacher BEFORE the written test.
      Cover: <em>Listening · Speaking · Reading Aloud · Picture Observation ·
      Teacher Interaction · Pronunciation · Conversation</em>.
    </div>
    <table class="oral-table">
      <thead><tr><th style="width:36px">କ୍ର.</th><th>ପ୍ରଶ୍ନ</th><th style="width:60px">ନମ୍ବର</th></tr></thead>
      <tbody>${items}</tbody>
    </table>
    <div class="oral-section-divider">
      ⬇ <strong>Written Test (${toOdiaNum(packet.writtenMarks || (packet.totalMarks - oralMarks))} Marks)</strong> begins on the next page.
    </div>
  </div>`
}

// ---- Assessment interpretation / signature block ---
const renderGrading = () => `
<div class="grading-section">
  <div class="grading-title">Assessment Interpretation (For Teacher's Use Only)</div>
  <table class="grading-table">
    <thead><tr><th>Level</th><th>Description</th><th>Tick (✓)</th></tr></thead>
    <tbody>
      <tr><td><strong>Nipun (ନିପୁଣ)</strong></td><td>Demonstrates most of the indicators consistently (ଦକ୍ଷ)</td><td></td></tr>
      <tr><td><strong>Pragati (ପ୍ରଗତି)</strong></td><td>Demonstrates some indicators with moderate consistency (ବିକାଶଶୀଳ)</td><td></td></tr>
      <tr><td><strong>Parambha (ପ୍ରାରମ୍ଭ)</strong></td><td>Demonstrates very few indicators (ପ୍ରାରମ୍ଭିକ)</td><td></td></tr>
    </tbody>
  </table>
  <div class="teacher-sign">
    <div class="signature-line">ଶିକ୍ଷକ / ଶିକ୍ଷୟିତ୍ରୀଙ୍କ ସ୍ୱାକ୍ଷର</div>
    <div class="signature-line">ଅଭିଭାବକଙ୍କ ସ୍ୱାକ୍ଷର</div>
    <div class="signature-line">ପ୍ରଧାନ ଶିକ୍ଷକଙ୍କ ସ୍ୱାକ୍ଷର</div>
  </div>
</div>`

// ---- Page 3 — Marking Scheme (stepwise marks + value points + alternates) ---
//   Uses `packet.markingScheme` if the AI emitted a rich structured field,
//   otherwise derives a print-friendly marking scheme from the existing
//   answerKey (each row becomes: Q# · Section · Value Points · Step Marks
//   · Alternate Accepted).  Always starts on a new page.
const renderMarkingScheme = (packet) => {
  // Skip if the caller has disabled the answer/marking output entirely.
  if (!packet.includeAnswerKey) return ''

  const raw = Array.isArray(packet.markingScheme) ? packet.markingScheme : null
  const source = raw && raw.length
    ? raw
    : (Array.isArray(packet.answerKey) ? packet.answerKey.map(a => ({
        n: a.n,
        section: a.section,
        q: a.q,
        valuePoints: a.answer,          // fallback: treat model answer as value points
        stepMarks: [`Correct answer / value point → ${a.marks || 1}M`],
        alternates: [],
        marks: a.marks || 1,
      })) : [])

  if (!source.length) return ''

  const rows = source.map(m => {
    const stepList = Array.isArray(m.stepMarks) && m.stepMarks.length
      ? `<ol style="margin:0;padding-left:16px;font-size:10.5pt">${m.stepMarks.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`
      : `<span style="color:#666">Full marks for correct final answer / value point.</span>`
    const alt = Array.isArray(m.alternates) && m.alternates.length
      ? m.alternates.map(a => `<div style="color:#0B5FFF;font-size:10.5pt">✓ ${esc(a)}</div>`).join('')
      : '<span style="color:#999">—</span>'
    return `<tr>
      <td class="num">${toOdiaNum(m.n)}</td>
      <td class="sec">${esc(m.section || '')}</td>
      <td>${esc(m.q || '')}<div style="margin-top:4px;color:#0B5FFF"><strong>Value Points:</strong> ${esc(m.valuePoints || '')}</div></td>
      <td>${stepList}</td>
      <td>${alt}</td>
      <td class="mk">${toOdiaNum(m.marks || 1)}</td>
    </tr>`
  }).join('')

  return `<div class="page-break"></div>
  <div class="ak-title">ମାର୍କିଂ ସ୍କୀମ୍ · Marking Scheme</div>
  <div style="font-size:10.5pt;color:#666;margin:-6px 0 8px">
    Stepwise marks · value points · alternate accepted answers — for teacher/evaluator use only.
  </div>
  <table class="ak-table">
    <thead><tr>
      <th style="width:42px">କ୍ର.</th>
      <th style="width:58px">ବିଭାଗ</th>
      <th style="width:34%">ପ୍ରଶ୍ନ + Value Points</th>
      <th style="width:26%">Step-wise Marks</th>
      <th style="width:20%">Alternate Accepted</th>
      <th style="width:60px">Marks</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

// ---- Page 5 — Teacher Observation Checklist (own page) ---
const renderObservationPage = (packet) => {
  const tb = packet.teacherBlocks || {}
  if (!packet.includeObservation || !tb.observation || tb.observation.error) return ''
  const indicators = asArr(tb.observation.indicators).map(x => `<tr>
    <td>${esc(x.indicator)}</td>
    <td>${esc(x.descriptor)}</td>
    <td></td><td></td><td></td><td></td>
  </tr>`).join('')
  return `<div class="page-break"></div>
  <div class="ak-title">ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ ତାଲିକା · Teacher Observation Checklist</div>
  <div style="font-size:10.5pt;color:#666;margin:-6px 0 8px">
    Total = 25 · Tick the appropriate box.  Covers: Participation · Communication ·
    Creativity · Critical Thinking · Collaboration · Confidence · Classroom Behaviour.
  </div>
  <table class="grading-table">
    <thead><tr>
      <th style="text-align:left">Indicator</th>
      <th>Descriptor</th>
      <th>Excellent</th>
      <th>Good</th>
      <th>Satisfactory</th>
      <th>Needs Improvement</th>
    </tr></thead>
    <tbody>${indicators}</tbody>
  </table>
  <div style="margin-top:10px">
    <strong>Teacher Remarks:</strong>
    <div style="border:1px solid #999;min-height:60px;padding:6px;margin-top:4px"></div>
  </div>
  <div class="teacher-sign" style="margin-top:12px">
    <div class="signature-line">Teacher's Signature</div>
    <div class="signature-line">Date</div>
  </div>`
}

// ---- Page 6 — Rubrics Grid (own page) ---
const renderRubricsPage = (packet) => {
  const tb = packet.teacherBlocks || {}
  if (!packet.includeRubrics || !tb.rubrics || tb.rubrics.error) return ''
  const rows = asArr(tb.rubrics.criteria).map(c => `<tr>
    <td><strong>${esc(c.criterion)}</strong></td>
    <td>${esc(c.level4)}</td>
    <td>${esc(c.level3)}</td>
    <td>${esc(c.level2)}</td>
    <td>${esc(c.level1)}</td>
  </tr>`).join('')
  return `<div class="page-break"></div>
  <div class="ak-title">ମୂଲ୍ୟାୟନ ମାନଦଣ୍ଡ · Rubrics Grid</div>
  <div style="font-size:10.5pt;color:#666;margin:-6px 0 8px">
    Rows: Knowledge · Understanding · Skill · Application · Communication ·
    Creativity · Problem Solving · Attitude.  Columns: Level 4 (Excellent) →
    Level 1 (Beginning).
  </div>
  <table class="grading-table">
    <thead><tr>
      <th style="text-align:left">ମାନଦଣ୍ଡ · Criterion</th>
      <th>Level 4 · Excellent</th>
      <th>Level 3 · Good</th>
      <th>Level 2 · Developing</th>
      <th>Level 1 · Beginning</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

// ---- Answer Key page ---
const renderAnswerKey = (packet) => {
  if (!packet.includeAnswerKey || !Array.isArray(packet.answerKey) || packet.answerKey.length === 0) return ''
  const rows = packet.answerKey.map(a => `<tr>
    <td class="num">${toOdiaNum(a.n)}</td>
    <td class="sec">${esc(a.section || '')}</td>
    <td>${esc(a.q || '')}</td>
    <td style="color:#0B5FFF;font-weight:600">${esc(a.answer || '')}</td>
    <td class="mk">${toOdiaNum(a.marks || 1)}</td>
  </tr>`).join('')
  return `<div class="page-break"></div>
  <div class="ak-title">ଉତ୍ତର ପତ୍ର · Answer Key</div>
  <table class="ak-table">
    <thead><tr><th style="width:42px">କ୍ର.</th><th style="width:58px">ବିଭାଗ</th><th>ପ୍ରଶ୍ନ</th><th>ଉତ୍ତର</th><th style="width:60px">ନମ୍ବର</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

// ---- Blueprint page ---
const renderBlueprint = (packet) => {
  if (!packet.includeBlueprint || !Array.isArray(packet.blueprint) || packet.blueprint.length === 0) return ''
  const rows = packet.blueprint.map(b => `<tr>
    <td style="text-align:center">${toOdiaNum(b.qNo)}</td>
    <td style="text-align:center">${esc(b.section)}</td>
    <td>${esc(b.typeOdia || b.type)}</td>
    <td>${esc(b.chapter || '')}</td>
    <td>${esc(b.loCode || '')}${b.loDescription ? ` — <span style="color:#666">${esc(b.loDescription)}</span>` : ''}</td>
    <td>${esc(b.competency || '—')}</td>
    <td>${esc(b.bloom || 'Understand')}</td>
    <td style="text-align:center;font-weight:600">${toOdiaNum(b.marks)}</td>
  </tr>`).join('')
  return `<div class="page-break"></div>
  <div class="bp-title">Blueprint · ପ୍ରଶ୍ନ ଚିତ୍ର</div>
  <table class="bp-table">
    <thead><tr>
      <th>Q.No</th><th>Section</th><th>Type</th><th>Chapter</th><th>LO Code</th><th>Competency</th><th>Bloom Level</th><th>Marks</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

/**
 * Render the full Assessment HTML document.
 *
 * @param {AssessmentPacket} packet
 * @param {Object} opts   { brandName, mode }
 *                        mode = 'full' | 'paper' | 'answers-only' | 'blueprint-only'
 * @returns {string} HTML
 */
export function renderAssessmentHTML(packet, opts = {}) {
  const brandName = opts.brandName || 'LessonGuru Odisha'
  const mode = opts.mode || 'full'

  // Compute per-section question numbering (continuous across the paper)
  const sectionHTML = []
  let n = 1
  for (const s of (packet.sections || [])) {
    const rendered = renderSection(s, n)
    sectionHTML.push(rendered.html)
    n = rendered.nextNumber
  }

  // ⭐ SIX-PAGE LAYOUT (SCERT / OSEPA official structure):
  //     Page 1 → Question Paper (header · instructions · [oral first] · written sections)
  //     Page 2 → Answer Key
  //     Page 3 → Marking Scheme (stepwise · value points · alternates)
  //     Page 4 → Blueprint
  //     Page 5 → Teacher Observation Checklist
  //     Page 6 → Rubrics Grid
  // Each subsequent page starts with a `<div class="page-break"></div>` so
  // print / puppeteer / html2pdf all break cleanly onto a new sheet.
  const parts = []
  if (mode === 'full' || mode === 'paper') {
    // Page 1 — Question Paper
    parts.push(renderHeader(packet, brandName))
    parts.push(renderInstructions(packet.instructions))
    // Oral test (top of paper) for Balvatika–Class 5 formative papers.
    // For classes 6-10 or when oralFirstStructure=false, the oral block
    // still renders after the written sections via renderTeacherBlocks.
    parts.push(renderOralPage(packet))
    parts.push(sectionHTML.join('\n'))
    parts.push(renderTeacherBlocks(packet))   // practical + non-primary oral only
    parts.push(renderGrading())
  }
  if (mode === 'full' || mode === 'answers-only') {
    // Page 2 — Answer Key
    parts.push(renderAnswerKey(packet))
    // Page 3 — Marking Scheme (NEW · distinct printed page)
    parts.push(renderMarkingScheme(packet))
  }
  if (mode === 'full' || mode === 'blueprint-only') {
    // Page 4 — Blueprint
    parts.push(renderBlueprint(packet))
  }
  if (mode === 'full') {
    // Page 5 — Teacher Observation (own page)
    parts.push(renderObservationPage(packet))
    // Page 6 — Rubrics Grid (own page)
    parts.push(renderRubricsPage(packet))
  }

  return `<!DOCTYPE html>
<html lang="or">
<head>
<meta charset="UTF-8">
<title>${esc(packet.title || packet.assessmentTypeLabel || 'Assessment')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Oriya:wght@400;500;600;700;800&family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>${SCERT_CSS}</style>
</head>
<body>
<div class="container">
${parts.filter(Boolean).join('\n')}
</div>
</body>
</html>`
}
