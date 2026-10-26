// =============================================================================
//  Question Paper PDF — SCERT/OSEPA-style compact print layout
//  ---------------------------------------------------------------------------
//  Print-ready A4 portrait, minimal margins, tight question spacing, 2-column
//  MCQs, answer lines proportional to marks. Uses embedded Odia font.
// =============================================================================

import { readFileSync } from 'fs'
import QRCode from 'qrcode'

let _odiaFontCSS = null
const loadOdiaFontCSS = () => {
  if (_odiaFontCSS !== null) return _odiaFontCSS
  const candidates = [
    { r: '/app/public/fonts/NotoSansOriyaUI-Regular.ttf', b: '/app/public/fonts/NotoSansOriyaUI-Bold.ttf' },
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

const esc = (s = '') => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const TYPE_LABEL = {
  mcq: 'Multiple Choice Questions',
  fill: 'Fill in the Blanks',
  truefalse: 'True or False',
  match: 'Match the Following',
  veryshort: 'Very Short Answer',
  short: 'Short Answer',
  long: 'Long Answer',
  casebased: 'Case Study / Passage-based',
  assertion: 'Assertion & Reason',
  competency: 'Competency-based',
  hots: 'Higher Order Thinking (HOTS)',
}

// Answer-space (in mm) sized by marks — compact but proportional
const ANSWER_LINES_FOR_MARKS = (marks, type) => {
  const t = String(type || '').toLowerCase()
  if (t === 'mcq' || t === 'truefalse' || t === 'assertion') return 0
  if (t === 'fill' || t === 'oneword') return 1
  if (t === 'veryshort') return 2
  if (t === 'short' || t === 'hots' || t === 'competency') return Math.max(3, Math.min(6, Math.round(marks * 1.2)))
  if (t === 'long' || t === 'casebased') return Math.max(6, Math.min(14, marks * 2))
  if (t === 'match') return 0
  return 3
}

const renderQ = (q, i, isAns) => {
  const num = `<span class="qn">${i + 1}.</span>`
  const marks = q.marks ? `<span class="mk">[${q.marks}]</span>` : ''
  const type = String(q.type || '').toLowerCase().replace(/\s+/g, '')
  const metaTags = [q.loCode, q.bloomLevel, q.competency, q.isActivity ? '🎯 Activity' : null].filter(Boolean).map(x => `<span class="mtag">${esc(x)}</span>`).join('')

  const qLine = `<div class="q-line"><span class="q-txt">${num} ${esc(q.q)} ${marks}${metaTags}</span></div>`

  // 🖼️ Image placeholder — when the AI flagged the question as needing a
  // diagram, we render a print-friendly bordered box with the imageHint so
  // teachers can either paste a drawing or the future image-library
  // integration can drop the auto-fetched illustration here.
  const imgBox = q.needsImage ? `
    <div class="img-slot">
      <div class="img-slot-inner">
        <div class="img-slot-icon">🖼️</div>
        <div class="img-slot-hint">${esc(q.imageHint || 'Image / Diagram')}</div>
        <div class="img-slot-note">Draw or paste illustration here</div>
      </div>
    </div>` : ''

  if (type === 'mcq' && Array.isArray(q.options)) {
    const opts = q.options.map((o, j) => {
      const cls = isAns && String(o).trim() === String(q.answer || '').trim() ? 'opt correct' : 'opt'
      const check = cls.includes('correct') ? ' ✓' : ''
      return `<div class="${cls}"><b>(${String.fromCharCode(65 + j)})</b> ${esc(o)}${check}</div>`
    }).join('')
    return `<div class="qcard">${qLine}${imgBox}<div class="opts-2col">${opts}</div></div>`
  }
  if (type === 'match' && Array.isArray(q.options)) {
    const rows = q.options.map((o, j) => `<tr><td>${j + 1}. ${esc(o)}</td><td>${Array.isArray(q.matchB) && q.matchB[j] ? String.fromCharCode(65 + j) + '. ' + esc(q.matchB[j]) : ''}</td></tr>`).join('')
    return `<div class="qcard">${qLine}${imgBox}<table class="mtbl">${rows}</table>${isAns ? `<div class="ans">✓ ${esc(q.answer || '')}</div>` : ''}</div>`
  }
  if (type === 'assertion') {
    return `<div class="qcard">${qLine}${imgBox}${isAns
      ? `<div class="ans"><b>Ans:</b> ${esc(q.answer || '')}</div>`
      : `<div class="opts-1col">
           <div class="opt"><b>(A)</b> Both A and R are true; R is the correct explanation of A</div>
           <div class="opt"><b>(B)</b> Both A and R are true; R is NOT the correct explanation of A</div>
           <div class="opt"><b>(C)</b> A is true, R is false</div>
           <div class="opt"><b>(D)</b> A is false, R is true</div>
         </div>`}</div>`
  }
  if (isAns) {
    return `<div class="qcard">${qLine}${imgBox}<div class="ans"><b>Ans:</b> ${esc(q.answer || '')}</div></div>`
  }
  const lines = ANSWER_LINES_FOR_MARKS(q.marks || 1, type)
  if (lines === 0) return `<div class="qcard">${qLine}${imgBox}</div>`
  if (lines === 1) return `<div class="qcard">${qLine}${imgBox}<div class="line-single"></div></div>`
  return `<div class="qcard">${qLine}${imgBox}<div class="lines">${Array(lines).fill('<div class="ansline"></div>').join('')}</div></div>`
}

// ---------------------------------------------------------------------------
// 📋 Teacher Observation Sheet (SCERT 2026-27 mandate)
//   • Written Work Assessment (10 marks) — evaluate any 5 written works
//   • Project Assessment (15 marks) — criteria from the framework
// Rendered as a printable A4 landscape-ready table, one row per student
// ---------------------------------------------------------------------------
const teacherObservationSheetHTML = (qp) => `
  <div class="page-break"></div>
  <div class="obs-page">
    <div class="obs-head">
      <div class="obs-brand">LESSON GURU ODISHA · SCERT ODISHA 2026-27</div>
      <div class="obs-title">TEACHER OBSERVATION SHEET</div>
      <div class="obs-sub">${esc(qp.className || '')}${qp.bookName ? ' · ' + esc(qp.bookName) : ''} · ${qp.assessmentType ? esc(String(qp.assessmentType).toUpperCase()) : 'Term Assessment'}</div>
    </div>
    <table class="obs-info">
      <tr>
        <td>School: <span class="fill"></span></td>
        <td>Class-Section: <span class="fill"></span></td>
        <td>Subject: ${esc(qp.bookName || '')}</td>
        <td>Term: <span class="fill"></span></td>
      </tr>
      <tr>
        <td>Teacher: <span class="fill"></span></td>
        <td>Roll of Students: <span class="fill"></span></td>
        <td>Present: <span class="fill"></span></td>
        <td>Date: <span class="fill"></span></td>
      </tr>
    </table>

    <div class="obs-section-title">A. WRITTEN WORK ASSESSMENT — 10 MARKS <span class="obs-note">(evaluate any 5 written works completed during the term)</span></div>
    <table class="obs-table">
      <thead>
        <tr>
          <th style="width:5%">Roll</th>
          <th style="width:22%">Student Name</th>
          <th style="width:8%">Content<br/>Understanding<br/>(3)</th>
          <th style="width:8%">Organisation &<br/>Presentation<br/>(2)</th>
          <th style="width:8%">Language<br/>Clarity<br/>(2)</th>
          <th style="width:7%">Neatness /<br/>Handwriting<br/>(1)</th>
          <th style="width:8%">Timely<br/>Completion<br/>(2)</th>
          <th style="width:7%">Total<br/>(10)</th>
          <th style="width:27%">Teacher Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${Array.from({length: 15}, (_, i) => `<tr><td>${i + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')}
      </tbody>
    </table>

    <div class="page-break"></div>
    <div class="obs-section-title">B. PROJECT ASSESSMENT — 15 MARKS</div>
    <table class="obs-table">
      <thead>
        <tr>
          <th style="width:5%">Roll</th>
          <th style="width:20%">Student Name</th>
          <th style="width:7%">Participation<br/>(2)</th>
          <th style="width:8%">Concept<br/>Understanding<br/>(5)</th>
          <th style="width:8%">Presentation<br/>Quality<br/>(3)</th>
          <th style="width:7%">Creativity<br/>(2)</th>
          <th style="width:7%">Timely<br/>Submission<br/>(1)</th>
          <th style="width:8%">Oral<br/>Presentation<br/>(2)</th>
          <th style="width:6%">Total<br/>(15)</th>
          <th style="width:24%">Strengths / Areas to Improve / Remedial</th>
        </tr>
      </thead>
      <tbody>
        ${Array.from({length: 15}, (_, i) => `<tr><td>${i + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')}
      </tbody>
    </table>

    <table class="obs-sign">
      <tr>
        <td>Class Teacher Signature: <span class="fill" style="width:60mm"></span></td>
        <td>Headmaster Signature: <span class="fill" style="width:60mm"></span></td>
        <td>Date: <span class="fill" style="width:30mm"></span></td>
      </tr>
    </table>
  </div>`

// ---------------------------------------------------------------------------
// 🏆 Project Rubric (4-level, SCERT-style descriptors per criterion)
// ---------------------------------------------------------------------------
const projectRubricHTML = (qp) => `
  <div class="page-break"></div>
  <div class="obs-page">
    <div class="obs-head">
      <div class="obs-brand">LESSON GURU ODISHA · SCERT ODISHA 2026-27</div>
      <div class="obs-title">PROJECT EVALUATION RUBRIC</div>
      <div class="obs-sub">${esc(qp.className || '')}${qp.bookName ? ' · ' + esc(qp.bookName) : ''}</div>
    </div>

    <table class="rubric-tbl">
      <thead>
        <tr>
          <th style="width:16%">Criterion</th>
          <th style="width:21%; background:#dcfce7">Excellent (4)</th>
          <th style="width:21%; background:#fef9c3">Good (3)</th>
          <th style="width:21%; background:#fed7aa">Satisfactory (2)</th>
          <th style="width:21%; background:#fecaca">Needs Improvement (1)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><b>Participation<br/>& Involvement</b></td>
          <td>Actively leads the group, initiates ideas, contributes throughout.</td>
          <td>Regular contributor, works consistently with the group.</td>
          <td>Participates when prompted, follows others' lead.</td>
          <td>Rarely participates, needs constant guidance.</td>
        </tr>
        <tr>
          <td><b>Concept<br/>Understanding</b></td>
          <td>Deep grasp of concepts, connects ideas across topics with examples.</td>
          <td>Clear understanding of most concepts, some minor gaps.</td>
          <td>Partial understanding, uses concepts with support.</td>
          <td>Limited understanding; concepts largely unclear.</td>
        </tr>
        <tr>
          <td><b>Presentation<br/>Quality</b></td>
          <td>Neat, well-organised, uses visuals / charts effectively.</td>
          <td>Organised and clear, minor formatting issues.</td>
          <td>Structure needs work, presentation is basic.</td>
          <td>Disorganised, hard to follow.</td>
        </tr>
        <tr>
          <td><b>Creativity</b></td>
          <td>Original ideas, unique angle, imaginative presentation.</td>
          <td>Adds some fresh perspective / thoughtful touches.</td>
          <td>Follows standard approach with minor personal touches.</td>
          <td>Reproduces given material without original thought.</td>
        </tr>
        <tr>
          <td><b>Timely<br/>Submission</b></td>
          <td>Submitted on / before the deadline in perfect condition.</td>
          <td>Submitted on time; minor last-minute additions.</td>
          <td>Submitted late by 1-2 days with reason.</td>
          <td>Submitted very late or incomplete.</td>
        </tr>
        <tr>
          <td><b>Oral<br/>Presentation</b></td>
          <td>Speaks confidently, engages audience, answers all questions.</td>
          <td>Clear speech, handles most questions well.</td>
          <td>Follows script, some hesitation, limited answers.</td>
          <td>Difficulty explaining; unable to answer questions.</td>
        </tr>
      </tbody>
    </table>

    <div class="rubric-note">Total = <b>6 × 4 = 24 points</b>, scaled to <b>15 marks</b> for Project Assessment. Encourage teachers to write specific remedial suggestions in the Observation Sheet.</div>
  </div>`

export async function buildQuestionPaperHTML(qp, opts = {}) {
  const teacher = esc(opts.teacherName || qp.userName || '')
  const school = esc(opts.school || '')
  const mode = opts.mode || 'paper'
  const includeObservationSheet = opts.includeObservationSheet !== false   // default true
  const includeRubric = opts.includeRubric !== false                       // default true

  const shareUrl = opts.publicUrl || `https://lessonguruodisha.in/question-papers/${qp.id}`
  let qrDataUrl = ''
  try {
    qrDataUrl = await QRCode.toDataURL(shareUrl, { margin: 0, width: 60, color: { dark: '#0f766e', light: '#ffffff' } })
  } catch (_err) { /* skip */ }

  // 📚 Multi-version support: If the paper has `versions[]` (A/B/C/D/E),
  // render each as a separate section with page breaks between them.
  // Legacy papers with only `questions[]` render as Version A.
  const versions = Array.isArray(qp.versions) && qp.versions.length > 0
    ? qp.versions
    : [{
        label: 'A',
        title: qp.title,
        instructions: qp.instructions,
        questions: qp.questions || [],
        answerKey: qp.answerKey || [],
      }]

  // Renders questions grouped by type into sections
  const renderVersionBody = (v) => {
    const questions = Array.isArray(v.questions) ? v.questions : []
    const groupedOrder = []
    const grouped = {}
    for (const q of questions) {
      const t = String(q.type || 'other').toLowerCase().replace(/\s+/g, '')
      if (!grouped[t]) { grouped[t] = []; groupedOrder.push(t) }
      grouped[t].push(q)
    }
    let sectionIdx = 0
    return groupedOrder.map(type => {
      sectionIdx++
      const qs = grouped[type]
      const label = TYPE_LABEL[type] || type
      const secMarks = qs.reduce((s, q) => s + (Number(q.marks) || 0), 0)
      const perMark = qs[0]?.marks ? qs[0].marks : ''
      const sectionInfo = perMark ? `${qs.length} × ${perMark}m = ${secMarks} marks` : `${secMarks} marks`
      return `<div class="section">
        <h4 class="sec-h">SECTION ${String.fromCharCode(64 + sectionIdx)} — ${esc(label)} <span class="sec-info">(${sectionInfo})</span></h4>
        ${qs.map(q => renderQ(q, questions.indexOf(q), false)).join('')}
      </div>`
    }).join('')
  }

  const renderVersionAnswers = (v) => {
    const questions = Array.isArray(v.questions) ? v.questions : []
    return `<div class="ans-banner">🔑 ANSWER KEY — VERSION ${esc(v.label || 'A')}</div>
      <div class="section">
        ${questions.map((q, i) => renderQ(q, i, true)).join('')}
      </div>
      ${(v.answerKey || []).length > 0 ? `
        <div class="ak-extras">
          <h4 class="sec-h">📖 Marking Scheme — Version ${esc(v.label || 'A')}</h4>
          ${v.answerKey.map(a => {
            const kw = (a.keywords && a.keywords.length) ? `<b>Keywords:</b> ${a.keywords.map(esc).join(', ')}. ` : ''
            const sm = (a.stepMarks && a.stepMarks.length) ? `<b>Step marks:</b> ${a.stepMarks.map(esc).join(' → ')}. ` : ''
            const ex = a.explanation ? `<b>Note:</b> ${esc(a.explanation)}` : ''
            if (!kw && !sm && !ex) return ''
            return `<div class="ak-row"><b>Q${a.qNumber}.</b> ${kw}${sm}${ex}</div>`
          }).join('')}
        </div>` : ''}`
  }

  // Header/banner shared across all versions (only shown at the top)
  const bannerFor = (versionLabel) => mode === 'answers-only' ? `
    <div class="head answers-head">
      <div class="head-brand">🔑 ANSWER KEY${versions.length > 1 ? ` — VERSION ${esc(versionLabel)}` : ''}</div>
      <div class="head-title">${esc(qp.title || 'Answer Key')}</div>
      <div class="head-sub">${esc(qp.className || '')}${qp.bookName ? ' · ' + esc(qp.bookName) : ''} · ${qp.totalMarks || 0} marks</div>
    </div>
  ` : `
    <div class="head">
      ${qrDataUrl ? `<img class="head-qr" src="${qrDataUrl}" alt="QR" />` : ''}
      <div class="head-brand">LESSON GURU ODISHA · SCERT ODISHA 2026-27</div>
      <div class="head-title">${esc(qp.title || 'Question Paper')}${versions.length > 1 ? ` <span class="ver-chip">VERSION ${esc(versionLabel)}</span>` : ''}</div>
      <div class="head-sub">${esc(qp.className || '')}${qp.bookName ? ' · ' + esc(qp.bookName) : ''}${qp.assessmentType ? ' · ' + esc(String(qp.assessmentType).toUpperCase()) : ''}</div>
      <table class="head-meta">
        <tr>
          <td><b>Total Marks:</b> ${qp.totalMarks || 0}</td>
          <td><b>Time:</b> ${qp.durationMin || 0} min</td>
          <td><b>Questions:</b> ${(versions[0].questions || []).length}</td>
          ${qp.difficulty ? `<td><b>Level:</b> ${esc(qp.difficulty)}</td>` : ''}
        </tr>
      </table>
      ${teacher ? `<div class="head-teacher">Teacher: <b>${teacher}</b>${school ? ' · ' + school : ''}</div>` : ''}
    </div>
    ${qp.instructions ? `<div class="instr"><b>Instructions:</b> ${esc(qp.instructions)}</div>` : ''}
  `

  // Build the versioned body
  let body = ''
  if (mode !== 'answers-only') {
    versions.forEach((v, idx) => {
      if (idx > 0) body += '<div class="page-break"></div>'
      body += bannerFor(v.label || String.fromCharCode(65 + idx))
      body += renderVersionBody(v)
    })
  }
  if (mode !== 'paper') {
    versions.forEach((v, idx) => {
      body += '<div class="page-break"></div>'
      if (mode === 'answers-only' && idx === 0) body += bannerFor(v.label || 'A')
      body += renderVersionAnswers(v)
    })
  }

  // Append Teacher Observation Sheet + Project Rubric (only for the main paper mode)
  if (mode !== 'answers-only') {
    if (includeObservationSheet) body += teacherObservationSheetHTML(qp)
    if (includeRubric) body += projectRubricHTML(qp)
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(qp.title || 'Question Paper')}</title>
<style>
  ${loadOdiaFontCSS()}
  @page { size: A4 portrait; margin: 10mm 8mm 10mm 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Noto Sans Oriya Embedded','Noto Sans Oriya UI','Noto Sans Oriya','Lohit Odia','Inter','Segoe UI',sans-serif; font-size: 10pt; line-height: 1.35; color: #111827; font-feature-settings: "liga" 1, "kern" 1; text-rendering: optimizeLegibility; }

  /* --- Header (compact) --- */
  .head { position: relative; text-align: center; border-bottom: 2px solid #0f766e; padding: 3mm 5mm 3mm; margin-bottom: 3mm; }
  .head.answers-head { border-color: #7c3aed; }
  .head-brand { font-size: 8.5pt; font-weight: 800; letter-spacing: 1.2px; color: #0f766e; }
  .answers-head .head-brand { color: #7c3aed; }
  .head-title { font-size: 13pt; font-weight: 800; margin: 1mm 0 0.5mm; }
  .head-sub { font-size: 9pt; color: #4b5563; }
  .head-meta { width: 100%; margin-top: 2mm; font-size: 9pt; border-collapse: collapse; }
  .head-meta td { text-align: center; padding: 0; }
  .head-teacher { font-size: 8.5pt; color: #6b7280; margin-top: 1mm; }
  .head-qr { position: absolute; top: 2mm; right: 3mm; width: 14mm; height: 14mm; }
  .ver-chip { display: inline-block; background: #0f766e; color: #fff; padding: 0.5mm 2mm; border-radius: 3px; font-size: 9pt; margin-left: 3mm; vertical-align: middle; }

  /* --- Instructions --- */
  .instr { background: #f0fdfa; border-left: 3px solid #0f766e; padding: 2mm 3mm; font-size: 9pt; margin: 0 0 3mm; border-radius: 3px; }

  /* --- Sections (tight) --- */
  .section { break-inside: auto; }
  .sec-h { background: #f1f5f9; border-left: 3px solid #0f766e; padding: 1.5mm 2mm; margin: 3mm 0 1.5mm; font-size: 10pt; font-weight: 700; color: #0f766e; border-radius: 3px; page-break-after: avoid; break-after: avoid; }
  .sec-h .sec-info { float: right; font-size: 8.5pt; color: #64748b; font-weight: 500; }

  /* --- Questions --- */
  .qcard { margin: 0 0 1.5mm; padding-left: 1mm; page-break-inside: avoid; break-inside: avoid; widows: 2; orphans: 2; }
  .q-line { font-size: 10pt; line-height: 1.35; }
  .qn { font-weight: 700; color: #0f766e; margin-right: 1mm; }
  .q-txt { display: inline; }
  .mk { color: #db2777; font-weight: 700; font-size: 9pt; margin-left: 2mm; white-space: nowrap; }
  .mtag { display: inline-block; background: #f1f5f9; color: #475569; font-size: 7pt; padding: 0 4px; border-radius: 3px; margin-left: 2mm; vertical-align: middle; }

  /* 🖼️ Image / diagram placeholder */
  .img-slot { margin: 1mm 0 1.5mm 6mm; }
  .img-slot-inner { border: 1px dashed #64748b; border-radius: 3px; padding: 3mm; text-align: center; background: repeating-linear-gradient(45deg, #f8fafc, #f8fafc 3mm, #f1f5f9 3mm, #f1f5f9 6mm); min-height: 22mm; display: flex; flex-direction: column; justify-content: center; }
  .img-slot-icon { font-size: 14pt; }
  .img-slot-hint { font-size: 8.5pt; font-weight: 700; color: #334155; margin-top: 1mm; }
  .img-slot-note { font-size: 7pt; color: #94a3b8; margin-top: 1mm; font-style: italic; }

  /* --- MCQ options: 2-column layout, tight --- */
  .opts-2col { column-count: 2; column-gap: 5mm; margin: 0.5mm 0 0 6mm; font-size: 9.5pt; }
  .opts-1col { margin: 0.5mm 0 0 6mm; font-size: 9.5pt; }
  .opt { padding: 0.2mm 0; break-inside: avoid; }
  .opt.correct { color: #059669; font-weight: 700; }

  /* --- Answer lines (proportional to marks) --- */
  .ansline { border-bottom: 1px dotted #94a3b8; height: 5mm; margin: 0.5mm 0; }
  .line-single { border-bottom: 1px dashed #94a3b8; height: 4mm; margin: 0.5mm 0 0.5mm 6mm; width: 60%; }
  .lines { margin-top: 0.5mm; }

  /* --- Match tables --- */
  .mtbl { width: 100%; border-collapse: collapse; margin: 1mm 0 0 6mm; font-size: 9.5pt; }
  .mtbl td { border: 1px solid #cbd5e1; padding: 1mm 2mm; width: 50%; }

  /* --- Answer key section --- */
  .ans { padding: 1.5mm 2mm; background: #ecfdf5; border-left: 2px solid #10b981; margin: 0.5mm 0 0 4mm; font-size: 9pt; color: #064e3b; border-radius: 2px; }
  .ans-banner { text-align: center; background: linear-gradient(90deg,#7c3aed,#db2777); color: #fff; padding: 2mm; font-weight: 800; font-size: 10.5pt; letter-spacing: 1px; margin: 3mm 0 2mm; border-radius: 3px; }
  .ak-extras { margin-top: 3mm; padding: 2mm 3mm; background: #faf5ff; border-radius: 3px; border: 1px solid #e9d5ff; font-size: 8.5pt; }
  .ak-extras .sec-h { margin: 0 0 1.5mm; background: transparent; border-left: none; padding: 0; color: #7c3aed; }
  .ak-row { margin-bottom: 1mm; padding-bottom: 1mm; border-bottom: 1px dotted #e9d5ff; }
  .ak-row:last-child { border-bottom: none; }

  .page-break { page-break-after: always; break-after: always; }

  /* --- 📋 Teacher Observation Sheet + 🏆 Project Rubric --- */
  .obs-page { padding: 0; }
  .obs-head { text-align: center; border-bottom: 2px solid #b91c1c; padding-bottom: 2mm; margin-bottom: 3mm; }
  .obs-brand { font-size: 8pt; font-weight: 800; letter-spacing: 1.2px; color: #b91c1c; }
  .obs-title { font-size: 13pt; font-weight: 800; margin: 1mm 0 0.5mm; color: #b91c1c; }
  .obs-sub { font-size: 9pt; color: #4b5563; }
  .obs-info { width: 100%; border-collapse: collapse; margin-bottom: 3mm; font-size: 9pt; }
  .obs-info td { padding: 1mm 2mm; border-bottom: 1px dotted #94a3b8; }
  .obs-info .fill { display: inline-block; min-width: 30mm; border-bottom: 1px solid #94a3b8; height: 4mm; margin-left: 1mm; }
  .obs-section-title { background: linear-gradient(90deg, #b91c1c, #db2777); color: #fff; padding: 1.5mm 3mm; font-weight: 800; font-size: 10pt; border-radius: 3px; margin: 3mm 0 2mm; }
  .obs-section-title .obs-note { font-size: 8pt; font-weight: 400; opacity: 0.85; margin-left: 3mm; }
  .obs-table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  .obs-table th { background: #fef2f2; color: #991b1b; border: 1px solid #7f1d1d; padding: 1.5mm 1mm; text-align: center; line-height: 1.15; font-weight: 700; }
  .obs-table td { border: 1px solid #94a3b8; padding: 3mm 1.5mm; height: 6mm; }
  .obs-table tr:nth-child(even) td { background: #fafafa; }
  .obs-sign { width: 100%; margin-top: 4mm; font-size: 9pt; border-collapse: collapse; }
  .obs-sign td { padding: 3mm 2mm; text-align: left; }
  .rubric-tbl { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-top: 2mm; }
  .rubric-tbl th { border: 1px solid #444; padding: 1.5mm; text-align: center; font-weight: 800; }
  .rubric-tbl td { border: 1px solid #94a3b8; padding: 2mm; vertical-align: top; line-height: 1.3; }
  .rubric-tbl td:first-child { background: #f1f5f9; font-weight: 700; }
  .rubric-note { margin-top: 3mm; padding: 2mm 3mm; background: #fef3c7; border-radius: 3px; font-size: 8.5pt; color: #78350f; }
</style></head><body>
${body}
</body></html>`
}

export function questionPaperPdfHeader() {
  return `<div style="font-size:7pt;padding:0 8mm;width:100%;text-align:center;color:#0f766e;font-family:sans-serif;">
    <b>LESSON GURU ODISHA</b> · Question Paper
  </div>`
}
export function questionPaperPdfFooter(teacherName = '') {
  return `<div style="font-size:6.5pt;padding:0 8mm;width:100%;display:flex;justify-content:space-between;color:#64748b;font-family:sans-serif;">
    <span>Teacher: <b>${(teacherName || '').replace(/</g, '&lt;')}</b></span>
    <span>Page <span class="pageNumber"></span>/<span class="totalPages"></span></span>
    <span>© lessonguruodisha.in</span>
  </div>`
}
