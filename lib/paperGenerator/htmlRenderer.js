// ============================================================
// LessonGuru Odisha — FA/SA Paper: HTML Renderer.
// Renders ONE self-contained print-ready HTML document that
// contains all four derived views:
//   PART A — Question Paper
//   PART B — Answer Key
//   PART C — Marking Scheme  (value points + stepwise marks)
//   PART D — Blueprint       (competency table)
// Every view reads ONLY from the same validated `questions[]`
// array — Gemini is never asked a second time.
// ============================================================

import { sectionLabel, typeLabel, sectionInstruction } from './sectionPlanner.js'
import { fontFaceCSS } from './fontLoader.js'

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const L = {
  Odia: {
    partA: 'ଭାଗ ଅ — ପ୍ରଶ୍ନପତ୍ର', partB: 'ଭାଗ ବ — ଉତ୍ତର ସୂଚୀ',
    partC: 'ଭାଗ ସ — ମୂଲ୍ୟାୟନ ପଥ (ଅଙ୍କ ବଣ୍ଟନ)', partD: 'ଭାଗ ଦ — ପ୍ରଶ୍ନପତ୍ର ପ୍ରାରୂପ (Blueprint)',
    time: 'ସମୟ', marks: 'ପୂର୍ଣ୍ଣାଙ୍କ', school: 'ବିଦ୍ୟାଳୟ',
    klass: 'ଶ୍ରେଣୀ', subject: 'ବିଷୟ', session: 'ଶୈକ୍ଷିକ ବର୍ଷ',
    date: 'ପରୀକ୍ଷା ତାରିଖ', instructions: 'ସାଧାରଣ ନିର୍ଦ୍ଦେଶାବଳୀ',
    qNo: 'ପ୍ର.ସଂ.', ans: 'ଉତ୍ତର', valuePts: 'ମୁଖ୍ୟ ବିନ୍ଦୁ', stepwise: 'ପଦଭିତ୍ତିକ ଅଙ୍କ',
    altAccepted: 'ଅନ୍ୟ ଗ୍ରହଣୀୟ ଉତ୍ତର', chapter: 'ପାଠ', bloom: 'ଚିନ୍ତନ ସ୍ତର',
    competency: 'ଦକ୍ଷତା', section: 'ଭାଗ', type: 'ପ୍ରଶ୍ନ ପ୍ରକାର', loCode: 'LO Code',
  },
  English: {
    partA: 'PART A — Question Paper', partB: 'PART B — Answer Key',
    partC: 'PART C — Marking Scheme (Value Points)', partD: 'PART D — Blueprint',
    time: 'Time', marks: 'Full Marks', school: 'School',
    klass: 'Class', subject: 'Subject', session: 'Academic Session',
    date: 'Date of Examination', instructions: 'General Instructions',
    qNo: 'Q.No.', ans: 'Answer', valuePts: 'Value Points', stepwise: 'Step-wise Marks',
    altAccepted: 'Alternate Accepted Answers', chapter: 'Chapter', bloom: 'Bloom Level',
    competency: 'Competency', section: 'Section', type: 'Question Type', loCode: 'LO Code',
  },
  Hindi: {
    partA: 'खंड A — प्रश्न पत्र', partB: 'खंड B — उत्तर कुंजी',
    partC: 'खंड C — मूल्यांकन योजना', partD: 'खंड D — ब्लूप्रिंट',
    time: 'समय', marks: 'पूर्णांक', school: 'विद्यालय',
    klass: 'कक्षा', subject: 'विषय', session: 'शैक्षणिक सत्र',
    date: 'परीक्षा तिथि', instructions: 'सामान्य निर्देश',
    qNo: 'प्र.सं.', ans: 'उत्तर', valuePts: 'मूल्य बिंदु', stepwise: 'चरणबद्ध अंक',
    altAccepted: 'अन्य स्वीकार्य उत्तर', chapter: 'पाठ', bloom: 'चिंतन स्तर',
    competency: 'क्षमता', section: 'खंड', type: 'प्रश्न प्रकार', loCode: 'LO Code',
  },
  Sanskrit: {
    partA: 'खण्डः A — प्रश्नपत्रम्', partB: 'खण्डः B — उत्तरकुञ्जिका',
    partC: 'खण्डः C — मूल्याङ्कनयोजना', partD: 'खण्डः D — ब्लूप्रिन्ट',
    time: 'समयः', marks: 'पूर्णाङ्काः', school: 'विद्यालयः',
    klass: 'कक्षा', subject: 'विषयः', session: 'शैक्षणिकसत्रम्',
    date: 'परीक्षादिनाङ्कः', instructions: 'सामान्यनिर्देशाः',
    qNo: 'प्र.सं.', ans: 'उत्तरम्', valuePts: 'मुख्यबिन्दवः', stepwise: 'सोपान-अङ्काः',
    altAccepted: 'अन्ये स्वीकार्याः उत्तराः', chapter: 'पाठः', bloom: 'चिन्तन-स्तरः',
    competency: 'दक्षता', section: 'खण्डः', type: 'प्रश्न-प्रकारः', loCode: 'LO Code',
  },
}

function lex(language) { return L[language] || L.Odia }

function fontStack(language) {
  if (language === 'English') return `'Noto Sans', 'Noto Serif', Georgia, 'Times New Roman', serif`
  if (language === 'Hindi' || language === 'Sanskrit') return `'Noto Sans Devanagari', 'Noto Sans', 'Mangal', system-ui, serif`
  return `'Noto Sans Oriya', 'Noto Sans', 'Kalinga', system-ui, serif`
}

// Placeholder — the real @font-face block is language-specific and gets
// injected by baseCSS() using fontFaceCSS(language) from fontLoader.js.
const FONT_FACE_CSS = ''

function baseCSS(language) {
  return `
${fontFaceCSS(language)}
@page { size: A4; margin: 14mm 15mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: ${fontStack(language)}; font-size: 12pt; line-height: 1.55; color: #000; background: #fff; }
h1, h2, h3 { margin: 0 0 6px 0; }
.header-block { border: 1.5px solid #000; padding: 8px 10px; margin-bottom: 10px; }
.header-title { text-align: center; font-weight: 800; font-size: 14pt; margin: 0 0 4px; }
.header-sub { text-align: center; font-size: 11pt; margin: 0 0 6px; }
.header-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 11pt; }
.header-meta .cell { display:flex; justify-content:space-between; border-bottom:1px dotted #666; padding:2px 0; }
.header-meta .lbl { font-weight: 700; }
.book-line { text-align: center; font-size: 10.5pt; color: #333; margin: 2px 0 4px; font-style: italic; }
.instr { margin: 8px 0 10px; font-size: 11pt; }
.instr .heading { font-weight: 800; margin-bottom: 3px; }
.instr ol { margin: 0; padding-left: 22px; }
.instr li { margin-bottom: 2px; }
.section-head { background: #f2f2f2; border: 1px solid #333; padding: 5px 8px; margin: 10px 0 6px; font-weight: 800; }
.section-head .st { font-size: 11pt; margin-left: 6px; font-weight: 600; }
.q { break-inside: avoid; page-break-inside: avoid; margin: 0 0 8px; padding: 4px 0; display: grid; grid-template-columns: 1fr 40px; column-gap: 8px; }
.q .body { }
.q .marks { text-align: right; font-weight: 700; white-space: nowrap; }
.qno { font-weight: 800; }
.opts { margin: 3px 0 0 20px; padding: 0; list-style: none; }
.opts li { padding: 2px 0; }
.blank-lines { border-bottom: 1px dashed #666; margin: 4px 0; height: 12mm; }
.page-break { break-before: page; page-break-before: always; padding-top: 4mm; }
.table { width: 100%; border-collapse: collapse; font-size: 10.5pt; margin: 6px 0 10px; }
.table th, .table td { border: 1px solid #333; padding: 5px 6px; vertical-align: top; }
.table th { background: #f2f2f2; font-weight: 800; }
.footer { position: fixed; bottom: 4mm; left: 15mm; right: 15mm; font-size: 9pt; color: #444; border-top: 1px dashed #999; padding-top: 2px; text-align: center; }
.key-box { border: 1px solid #333; padding: 6px 8px; margin: 4px 0 8px; }
.key-box .kh { font-weight: 800; margin-bottom: 3px; }
.value-list { margin: 2px 0 4px 18px; padding: 0; }
.stepwise { margin: 4px 0 4px 0; }
.stepwise-title { font-weight: 700; margin-bottom: 2px; }
.stepwise ul { margin: 0 0 0 18px; padding: 0; }
.mtag { display:inline-block; background:#f4f4f4; border:1px solid #ccc; border-radius: 6px; padding: 0 6px; font-size: 9pt; margin: 0 3px 2px 0; }
.small { font-size: 10pt; color: #333; }
.title-strip { text-align:center; background: #f2f2f2; border: 1px solid #333; padding: 4px 6px; font-weight: 800; margin: 6px 0; }
`
}

// ------------------------------------------------------------
// Part-builders
// ------------------------------------------------------------
function renderHeader(A, language) {
  const t = lex(language)
  const school = esc(A.school_name || '')
  const klass = esc(A.class || '')
  const subject = esc(A.subject || '')
  const marks = esc(A.total_marks || '')
  const duration = esc(A.duration || '')
  const session = esc(A.session || '')
  const term = esc(A.term || '')
  const date = esc(A.exam_date || '')
  const ttl = esc(A.title || A.assessment_type || 'Question Paper')
  const bookTitle = esc(A.book_title || '')
  const bookEd = esc(A.book_edition || '')
  const bookLine = bookTitle
    ? `<div class="book-line">${bookTitle}${bookEd ? ` · Edition ${bookEd}` : ''}</div>`
    : ''
  return `
<div class="header-block">
  <div class="header-title">${school || 'Lesson Guru Odisha'}</div>
  <div class="header-sub">${ttl}${term ? ' · ' + term : ''}${session ? ' · ' + session : ''}</div>
  ${bookLine}
  <div class="header-meta">
    <div class="cell"><span class="lbl">${t.klass}</span><span>${klass}</span></div>
    <div class="cell"><span class="lbl">${t.subject}</span><span>${subject}</span></div>
    <div class="cell"><span class="lbl">${t.time}</span><span>${duration}</span></div>
    <div class="cell"><span class="lbl">${t.marks}</span><span>${marks}</span></div>
    ${date ? `<div class="cell"><span class="lbl">${t.date}</span><span>${date}</span></div>` : ''}
  </div>
</div>`
}

function renderInstructions(A, language) {
  const t = lex(language)
  const items = Array.isArray(A.instructions) && A.instructions.length ? A.instructions : []
  if (!items.length) return ''
  return `
<div class="instr">
  <div class="heading">${t.instructions} :</div>
  <ol>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
</div>`
}

function renderMCQ(q) {
  const opts = Array.isArray(q.options) ? q.options : []
  const letters = ['A', 'B', 'C', 'D']
  return `
<div class="q">
  <div class="body">
    <span class="qno">${q.question_no}.</span> ${esc(q.question)}
    <ol class="opts">
      ${opts.slice(0, 4).map((o, i) => `<li>(${letters[i]}) ${esc(o)}</li>`).join('')}
    </ol>
  </div>
  <div class="marks">[${q.marks}]</div>
</div>`
}

function renderFIBorTF(q) {
  return `
<div class="q">
  <div class="body"><span class="qno">${q.question_no}.</span> ${esc(q.question)}</div>
  <div class="marks">[${q.marks}]</div>
</div>`
}

function renderWritten(q) {
  // For VSA/SA/LA — show question + answer-space (dotted lines) sized to marks.
  const lines = Math.max(2, Math.min(10, Number(q.marks) * 2))
  const bl = Array.from({ length: lines }, () => `<div class="blank-lines"></div>`).join('')
  return `
<div class="q">
  <div class="body">
    <span class="qno">${q.question_no}.</span> ${esc(q.question)}
    ${bl}
  </div>
  <div class="marks">[${q.marks}]</div>
</div>`
}

function renderQuestion(q) {
  const t = String(q.type || '').toUpperCase()
  if (t === 'MCQ') return renderMCQ(q)
  if (t === 'FIB' || t === 'TF') return renderFIBorTF(q)
  return renderWritten(q)
}

function renderSection(planItem, questions, language) {
  const secTitle = `${sectionLabel(planItem.id, language)} — ${typeLabel(planItem.type, language)}`
  const st = sectionInstruction(planItem.type, language)
  const qs = questions.filter(q => String(q.section || '').toUpperCase() === planItem.id).sort((a, b) => a.question_no - b.question_no)
  return `
<div class="section">
  <div class="section-head">${secTitle}<span class="st">(${planItem.count} × ${planItem.marksEach} = ${planItem.count * planItem.marksEach}) — ${st}</span></div>
  ${qs.map(renderQuestion).join('')}
</div>`
}

// ------------------------------------------------------------
// PART B — Answer Key
// ------------------------------------------------------------
function renderAnswerKey(questions, language) {
  const t = lex(language)
  const rows = questions.slice().sort((a, b) => a.question_no - b.question_no).map(q => {
    const type = String(q.type || '').toUpperCase()
    let answerHtml
    if (type === 'MCQ') {
      const co = String(q.correct_option || '').toUpperCase()
      const optText = (Array.isArray(q.options) && /^[A-D]$/.test(co)) ? q.options[co.charCodeAt(0) - 65] || q.answer : q.answer
      answerHtml = `<b>${esc(co)}</b> — ${esc(optText)}`
    } else {
      answerHtml = esc(q.answer)
      const alt = Array.isArray(q.alternate_accepted_answers) ? q.alternate_accepted_answers.filter(Boolean) : []
      if (alt.length) answerHtml += `<div class="small"><i>${t.altAccepted}:</i> ${alt.map(esc).join(' · ')}</div>`
    }
    return `<tr>
      <td style="text-align:center;width:36px">${q.question_no}</td>
      <td style="text-align:center;width:44px">${esc(q.section || '')}</td>
      <td>${esc(q.question)}</td>
      <td>${answerHtml}</td>
      <td style="text-align:center;width:44px">${q.marks}</td>
    </tr>`
  }).join('')
  return `
<div class="page-break">
  <div class="title-strip">${t.partB}</div>
  <table class="table">
    <thead>
      <tr>
        <th>${t.qNo}</th>
        <th>${t.section}</th>
        <th>${'ପ୍ରଶ୍ନ' && (language === 'Odia' ? 'ପ୍ରଶ୍ନ' : (language === 'Hindi' ? 'प्रश्न' : (language === 'Sanskrit' ? 'प्रश्नम्' : 'Question')))}</th>
        <th>${t.ans}</th>
        <th>${t.marks}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`
}

// ------------------------------------------------------------
// PART C — Marking Scheme (Value Points + Stepwise Marks)
// ------------------------------------------------------------
function renderMarkingScheme(questions, language) {
  const t = lex(language)
  const written = questions.filter(q => Number(q.marks) >= 2 && String(q.type || '').toUpperCase() !== 'MCQ')
  if (!written.length) return `
<div class="page-break">
  <div class="title-strip">${t.partC}</div>
  <div class="small">${language === 'Odia' ? 'ଏହି ପ୍ରଶ୍ନପତ୍ରରେ କୌଣସି ଲିଖିତ (ମାର୍କିଂ ସ୍କିମ ଆବଶ୍ୟକ) ପ୍ରଶ୍ନ ନାହିଁ।' : 'This paper contains no written questions that need a marking scheme.'}</div>
</div>`
  const rows = written.slice().sort((a, b) => a.question_no - b.question_no).map(q => {
    const vp = Array.isArray(q.value_points) ? q.value_points.filter(Boolean) : []
    const sw = Array.isArray(q.stepwise_marks) ? q.stepwise_marks : []
    const alt = Array.isArray(q.alternate_accepted_answers) ? q.alternate_accepted_answers.filter(Boolean) : []
    return `
<div class="key-box">
  <div class="kh">${language === 'Odia' ? 'ପ୍ର.' : (language === 'Hindi' ? 'प्र.' : (language === 'Sanskrit' ? 'प्र.' : 'Q'))}${q.question_no} — ${esc(q.question)} <span style="float:right">[${q.marks}]</span></div>
  <div class="stepwise-title">${t.valuePts}:</div>
  <ul class="value-list">${vp.map(v => `<li>${esc(v)}</li>`).join('')}</ul>
  <div class="stepwise">
    <div class="stepwise-title">${t.stepwise}:</div>
    <ul>${sw.map(s => `<li>${esc(s?.point || '')} — ${esc(s?.marks || '')} ${language === 'Odia' ? 'ଅଙ୍କ' : (language === 'English' ? 'mark' : (language === 'Hindi' ? 'अंक' : 'अङ्कः'))}</li>`).join('')}</ul>
  </div>
  ${alt.length ? `<div class="small"><i>${t.altAccepted}:</i> ${alt.map(esc).join(' · ')}</div>` : ''}
</div>`
  }).join('')
  return `
<div class="page-break">
  <div class="title-strip">${t.partC}</div>
  ${rows}
</div>`
}

// ------------------------------------------------------------
// PART D — Blueprint table
// ------------------------------------------------------------
function renderBlueprint(questions, language) {
  const t = lex(language)
  const rows = questions.slice().sort((a, b) => a.question_no - b.question_no).map(q => `
    <tr>
      <td style="text-align:center">${q.question_no}</td>
      <td style="text-align:center">${esc(q.section || '')}</td>
      <td style="text-align:center">${esc(String(q.type || '').toUpperCase())}</td>
      <td>${esc(q.chapter || '')}</td>
      <td>${esc(q.lo_code || '')}</td>
      <td>${esc(q.competency || '')}</td>
      <td style="text-align:center">${esc(q.bloom_level || '')}</td>
      <td style="text-align:center">${q.marks}</td>
    </tr>`).join('')
  return `
<div class="page-break">
  <div class="title-strip">${t.partD}</div>
  <table class="table">
    <thead>
      <tr>
        <th>${t.qNo}</th><th>${t.section}</th><th>${t.type}</th>
        <th>${t.chapter}</th><th>${t.loCode}</th><th>${t.competency}</th>
        <th>${t.bloom}</th><th>${t.marks}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`
}

// ------------------------------------------------------------
// Main render — outputs ONE combined HTML document with all
// four parts. The frontend hides PARTS B/C/D behind a stable
// HTML-comment marker (LG_ANSWER_KEY_START) so students can't
// see the answer key by accident.
//
// options.mode:
//   'full'           — all four parts
//   'paper'          — question paper only (default UI toggle "locked")
//   'answers-only'   — answer key + marking scheme
//   'blueprint-only' — blueprint only
// ------------------------------------------------------------
export function renderAssessmentHTML(data, plan, options = {}) {
  const A = data.assessment || {}
  const Q = Array.isArray(data.questions) ? data.questions : []
  const language = A.language || 'Odia'
  const t = lex(language)
  const mode = options.mode || 'full'
  const observationHTML = options.observationHTML || ''
  const parts = plan.map(p => renderSection(p, Q, language)).join('')

  // Assemble each optional block.
  const header = `${renderHeader(A, language)}\n${renderInstructions(A, language)}`
  const paperBlock = `<div class="title-strip">${t.partA}</div>\n${header}\n${parts}`
  const answerKeyBlock = renderAnswerKey(Q, language)
  const markingBlock = renderMarkingScheme(Q, language)
  const blueprintBlock = renderBlueprint(Q, language)

  let body
  if (mode === 'paper') {
    body = paperBlock
  } else if (mode === 'answers-only') {
    body = `${header}\n${answerKeyBlock}\n${markingBlock}`
  } else if (mode === 'blueprint-only') {
    body = `${header}\n${blueprintBlock}`
  } else if (mode === 'observation-only') {
    body = observationHTML || `${header}\n<div class="small">Teacher Observation not requested.</div>`
  } else {
    // full — Part A + (locked) Part B/C/D and, when requested, Part E (Observation)
    body = `${paperBlock}
<!--LG_ANSWER_KEY_START-->
<div id="lg-answer-key" data-lg-answer-key="1">
  ${answerKeyBlock}
  ${markingBlock}
  ${blueprintBlock}
  ${observationHTML}
</div>
<!--LG_ANSWER_KEY_END-->`
  }

  return `<!DOCTYPE html>
<html lang="${language === 'English' ? 'en' : (language === 'Hindi' ? 'hi' : (language === 'Sanskrit' ? 'sa' : 'or'))}">
<head>
  <meta charset="utf-8" />
  <title>${esc(A.title || 'Assessment')}</title>
  <style>${baseCSS(language)}</style>
</head>
<body>
  ${body}
</body>
</html>`
}
