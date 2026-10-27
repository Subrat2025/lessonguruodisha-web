// Assessment PDF HTML template — reuses embedded Odia font from worksheet-html.
// Produces a professional multi-section A4 layout for FA/SA/Observation.

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

const esc = (s = '') => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Render a single question by type
const renderQ = (q, i, isAns) => {
  const num = `<span class="qn">${i + 1}.</span>`
  const marks = q.marks ? ` <span class="mk">[${q.marks} mark${q.marks > 1 ? 's' : ''}]</span>` : ''
  const meta = [q.chapterName, q.loCode, q.bloomLevel].filter(Boolean).map(x => `<span class="mtag">${esc(x)}</span>`).join('')
  const qHead = `<div class="q-row"><div>${num}</div><div class="q-body"><b>${esc(q.q)}</b>${marks}${meta ? '<div class="mtags">' + meta + '</div>' : ''}</div></div>`
  const type = (q.type || '').toLowerCase()
  if (type === 'mcq' && Array.isArray(q.options)) {
    const opts = q.options.map((o, j) => `<div class="opt${isAns && o === q.answer ? ' correct' : ''}">(${String.fromCharCode(65 + j)}) ${esc(o)}${isAns && o === q.answer ? ' ✓' : ''}</div>`).join('')
    return `<div class="qcard">${qHead}${opts}</div>`
  }
  if (type === 'fill' || type === 'truefalse' || type === 'veryshort' || type === 'very short' || type === 'oneword') {
    return `<div class="qcard">${qHead}${isAns ? `<div class="ans">✓ ${esc(q.answer || '')}</div>` : `<div class="line"></div>`}</div>`
  }
  if (type === 'match' && Array.isArray(q.options)) {
    const rows = q.options.map((o, j) => `<tr><td>${j + 1}. ${esc(o)}</td><td>${q.matchB && q.matchB[j] ? String.fromCharCode(65 + j) + '. ' + esc(q.matchB[j]) : ''}</td></tr>`).join('')
    return `<div class="qcard">${qHead}<table class="mtbl">${rows}</table>${isAns ? `<div class="ans">✓ ${esc(q.answer || '')}</div>` : ''}</div>`
  }
  // short / long / caseBased / assertion / analytical / competency etc.
  const lines = type === 'long' || type === 'case' || type === 'casebased' ? 6 : type === 'short' ? 3 : 2
  return `<div class="qcard">${qHead}${isAns
    ? `<div class="ans"><b>✓ Model Answer:</b> ${esc(q.answer || '')}</div>`
    : `<div class="lines">${Array(lines).fill('<div class="line"></div>').join('')}</div>`}</div>`
}

const renderObservationSheet = (obs) => {
  if (!obs || !Array.isArray(obs.indicators) || obs.indicators.length === 0) return ''
  const rows = obs.indicators.map((ind, i) => `
    <tr>
      <td class="obs-idx">${i + 1}</td>
      <td class="obs-name"><b>${esc(ind.name)}</b></td>
      <td class="obs-cell">${esc(ind.excellent || '')}</td>
      <td class="obs-cell">${esc(ind.good || '')}</td>
      <td class="obs-cell">${esc(ind.satisfactory || '')}</td>
      <td class="obs-cell">${esc(ind.needsImprovement || '')}</td>
      <td class="obs-marks">${ind.maxMarks || 2}</td>
      <td class="obs-remarks"><div class="line"></div></td>
    </tr>`).join('')
  return `
    <div class="sec">
      <h3>📋 Teacher Observation Sheet</h3>
      <table class="obs-tbl">
        <thead>
          <tr>
            <th>#</th><th>Indicator</th>
            <th>Excellent</th><th>Good</th><th>Satisfactory</th><th>Needs Improvement</th>
            <th>Marks</th><th>Remarks</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

const renderLOs = (los) => {
  if (!Array.isArray(los) || los.length === 0) return ''
  const rows = los.map((lo, i) => `<tr><td class="obs-idx">${i + 1}</td><td><b>${esc(lo.code || '')}</b></td><td>${esc(lo.description)}</td><td>${esc(lo.competency || '')}</td><td>${esc(lo.bloomLevel || '')}</td></tr>`).join('')
  return `
    <div class="sec">
      <h3>🎯 Learning Outcomes</h3>
      <table class="lo-tbl">
        <thead><tr><th>#</th><th>Code</th><th>Description</th><th>Competency</th><th>Bloom</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

const renderBlueprint = (bp) => {
  if (!Array.isArray(bp) || bp.length === 0) return ''
  const rows = bp.map((b, i) => `<tr><td>${i + 1}</td><td>${esc(b.chapterName || '')}</td><td>${esc(b.questionType || '')}</td><td>${b.count || 1}</td><td>${b.marksEach || 1}</td><td><b>${b.totalMarks || (b.count || 1) * (b.marksEach || 1)}</b></td><td>${esc(b.bloomLevel || '')}</td><td>${esc(b.difficulty || '')}</td></tr>`).join('')
  return `
    <div class="sec">
      <h3>📊 Question Paper Blueprint</h3>
      <table class="bp-tbl">
        <thead><tr><th>#</th><th>Chapter</th><th>Type</th><th>Count</th><th>Marks Each</th><th>Total</th><th>Bloom</th><th>Difficulty</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

const renderRubrics = (rubrics) => {
  if (!Array.isArray(rubrics) || rubrics.length === 0) return ''
  const rows = rubrics.map(r => `<tr><td class="rb-crit"><b>${esc(r.criterion)}</b></td><td>${esc(r.excellent)}</td><td>${esc(r.veryGood)}</td><td>${esc(r.good)}</td><td>${esc(r.needsImprovement)}</td></tr>`).join('')
  return `
    <div class="sec">
      <h3>🏆 Assessment Rubrics</h3>
      <table class="rb-tbl">
        <thead><tr><th>Criterion</th><th>Excellent (4)</th><th>Very Good (3)</th><th>Good (2)</th><th>Needs Improvement (1)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

const renderList = (items, title, emoji, colorClass) => {
  if (!Array.isArray(items) || items.length === 0) return ''
  return `<div class="sec ${colorClass || ''}"><h3>${emoji} ${title}</h3><ol class="mlist">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>`
}

const renderSelfAssessment = (sa) => {
  if (!sa || (!sa.statements && !sa.needHelpPrompt)) return ''
  const stmts = (sa.statements || []).map(s => `<div class="sa-row">${esc(s)} &nbsp;&nbsp; ☐ Yes &nbsp; ☐ Partially &nbsp; ☐ No</div>`).join('')
  return `
    <div class="sec">
      <h3>🌟 Student Self-Assessment</h3>
      ${stmts}
      ${sa.needHelpPrompt ? `<div class="sa-help"><b>${esc(sa.needHelpPrompt)}</b><div class="line"></div><div class="line"></div></div>` : ''}
    </div>`
}

const renderPeerAssessment = (pa) => {
  if (!pa || !Array.isArray(pa.criteria) || pa.criteria.length === 0) return ''
  return `
    <div class="sec">
      <h3>🤝 Peer Assessment</h3>
      <table class="peer-tbl">
        <thead><tr><th>Criterion</th><th>Excellent</th><th>Good</th><th>Needs Improvement</th></tr></thead>
        <tbody>${pa.criteria.map(c => `<tr><td>${esc(c)}</td><td>☐</td><td>☐</td><td>☐</td></tr>`).join('')}</tbody>
      </table>
    </div>`
}

/**
 * Build a full HTML doc for assessment PDF.
 * @param {object} a Assessment document
 * @param {object} opts { teacherName, school, publicUrl }
 */
export async function buildAssessmentHTML(a, opts = {}) {
  const teacher = esc(opts.teacherName || '')
  const school = esc(opts.school || '')
  // Generate a small QR code data URI pointing to the shareable URL
  const shareUrl = opts.publicUrl || `https://lessonguruodisha.com/assessments/${a.id}`
  let qrDataUrl = ''
  try {
    qrDataUrl = await QRCode.toDataURL(shareUrl, { margin: 1, width: 90, color: { dark: '#1e40af', light: '#ffffff' } })
  } catch (_err) { /* skip */ }
  const typeMeta = a.typeMeta || { label: a.type }
  const questions = Array.isArray(a.questions) ? a.questions : []
  const groupedByType = {}
  for (const q of questions) {
    const t = (q.type || 'other').toLowerCase()
    if (!groupedByType[t]) groupedByType[t] = []
    groupedByType[t].push(q)
  }
  const TYPE_LABEL = {
    mcq: 'Section A · Multiple Choice',
    fill: 'Fill in the Blanks',
    truefalse: 'True or False',
    match: 'Match the Following',
    veryshort: 'Very Short Answer',
    'very short': 'Very Short Answer',
    oneword: 'One Word Answer',
    short: 'Short Answer',
    long: 'Long Answer',
    case: 'Case Study',
    casebased: 'Case Study',
    assertion: 'Assertion & Reason',
    competency: 'Competency-Based',
    picture: 'Picture Based',
    activity: 'Activity Based',
    application: 'Application Based',
    analytical: 'Analytical',
    diagram: 'Diagram Based',
    source: 'Source Based',
    oral: 'Oral Questions',
    hots: 'Higher Order Thinking',
  }
  let sectionIdx = 0
  const sections = Object.entries(groupedByType).map(([type, qs]) => {
    sectionIdx++
    const label = TYPE_LABEL[type] || (type.charAt(0).toUpperCase() + type.slice(1))
    return `<div class="qsec">
      <h4>Section ${String.fromCharCode(64 + sectionIdx)} — ${esc(label)} <span class="sec-marks">(${qs.reduce((s, q) => s + (q.marks || 0), 0)} marks)</span></h4>
      ${qs.map((q, i) => renderQ(q, i, false)).join('')}
    </div>`
  }).join('')

  const answerKey = (a.answerKey || []).length ? `
    <div class="page-break"></div>
    <div class="ans-banner"><span class="ans-badge">🔑 ANSWER KEY & MARKING SCHEME</span></div>
    ${questions.map((q, i) => renderQ(q, i, true)).join('')}` : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(a.title || 'Assessment')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Oriya:wght@400;700&family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
<style>
  ${loadOdiaFontCSS()}
  @page { size: A4; margin: 15mm 10mm 15mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans Oriya Embedded','Noto Sans Oriya UI','Noto Sans Oriya','Lohit Odia','Inter','Segoe UI',sans-serif; font-size: 10.5pt; color: #0f172a; margin: 0; padding: 0; background: #fff; font-feature-settings: "liga" 1, "clig" 1, "calt" 1, "kern" 1; text-rendering: optimizeLegibility; letter-spacing: 0; }
  .banner { background: linear-gradient(135deg,#1e40af 0%,#7c3aed 100%); color: #fff; padding: 10mm 8mm 8mm; text-align: center; border-radius: 0 0 18px 18px; }
  .banner .brand { font-size: 11pt; font-weight: 800; letter-spacing: 1px; margin-bottom: 4px; }
  .banner h1 { font-size: 15pt; font-weight: 900; margin: 2px 0 4px; }
  .banner .sub { font-size: 9pt; opacity: .9; }
  .banner .chips { display: flex; gap: 6px; justify-content: center; margin-top: 8px; font-size: 9pt; font-weight: 700; }
  .chip { background: rgba(255,255,255,.2); padding: 3px 10px; border-radius: 12px; }
  .stu { width: calc(100% - 16mm); margin: 8px 8mm; border-collapse: separate; border-spacing: 4px; font-size: 9.5pt; }
  .stu td { padding: 5px 8px; border-radius: 6px; background: #f1f5f9; }
  .instr { margin: 6px 8mm; padding: 6px 12px; background: #fff7ed; border-left: 4px solid #f97316; border-radius: 6px; font-size: 10pt; font-style: italic; color: #7c2d12; }
  .sec { margin: 8px 8mm 0; padding: 8px 10px; border-radius: 8px; background: #f8fafc; page-break-inside: avoid; }
  .sec h3 { font-size: 12pt; margin: 0 0 6px; color: #1e40af; border-bottom: 2px solid #dbeafe; padding-bottom: 4px; }
  .qsec { margin: 8px 8mm; }
  .qsec h4 { font-size: 11.5pt; margin: 10px 0 4px; padding: 4px 10px; background: #dbeafe; color: #1e3a8a; border-radius: 6px; }
  .sec-marks { float: right; font-size: 9pt; color: #64748b; font-weight: 600; }
  .qcard { margin: 6px 0; padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; page-break-inside: avoid; }
  .qn { display: inline-block; width: 22px; font-weight: 700; color: #3b82f6; }
  .q-row { display: flex; align-items: flex-start; font-size: 10.5pt; line-height: 1.5; }
  .q-body { flex: 1; }
  .mk { color: #64748b; font-size: 9pt; font-weight: 600; }
  .mtags { margin-top: 2px; }
  .mtag { display: inline-block; background: #ecfdf5; color: #065f46; padding: 1px 6px; margin-right: 3px; border-radius: 8px; font-size: 8pt; font-weight: 600; }
  .opt { margin: 3px 0 3px 30px; font-size: 10.5pt; }
  .opt.correct { background: #d1fae5; color: #065f46; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
  .ans { margin: 4px 0 0 30px; color: #059669; font-weight: 700; font-size: 10pt; }
  .line { border-bottom: 1px dotted #94a3b8; height: 16px; margin: 6px 0 0 30px; }
  .lines { margin: 6px 0 0 30px; }
  .lines .line { margin-left: 0; }
  .mtbl { width: 100%; margin: 6px 0 0 30px; border-collapse: collapse; font-size: 10pt; }
  .mtbl td { padding: 4px 8px; border: 1px solid #cbd5e1; }
  .lo-tbl, .bp-tbl, .rb-tbl, .obs-tbl, .peer-tbl { width: 100%; border-collapse: collapse; font-size: 9pt; }
  .lo-tbl th, .bp-tbl th, .rb-tbl th, .obs-tbl th, .peer-tbl th { background: #dbeafe; color: #1e3a8a; padding: 5px 6px; border: 1px solid #93c5fd; text-align: left; }
  .lo-tbl td, .bp-tbl td, .rb-tbl td, .obs-tbl td, .peer-tbl td { padding: 4px 6px; border: 1px solid #cbd5e1; vertical-align: top; }
  .obs-idx { text-align: center; width: 20px; font-weight: 700; }
  .obs-cell { font-size: 8.5pt; }
  .obs-name { min-width: 100px; }
  .obs-marks { text-align: center; width: 40px; font-weight: 700; }
  .obs-remarks { width: 100px; }
  .rb-crit { min-width: 100px; background: #f8fafc; }
  .sa-row { margin: 4px 0; font-size: 10pt; }
  .sa-help { margin-top: 6px; padding: 6px; background: #fff; border-radius: 4px; }
  .mlist { margin: 4px 0 0 20px; padding: 0; }
  .mlist li { margin: 3px 0; font-size: 10pt; }
  .page-break { page-break-before: always; height: 0; }
  .ans-banner { text-align: center; margin: 12px 0; }
  .watermark { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 82pt; color: rgba(30,64,175,.05); font-weight: 900; transform: rotate(-30deg); z-index: -1; pointer-events: none; letter-spacing: 4px; }
  .qr-wrap { position: absolute; top: 8mm; right: 8mm; background: #fff; padding: 4px; border-radius: 6px; border: 1px solid #cbd5e1; }
  .qr-wrap img { display: block; width: 60px; height: 60px; }
  .qr-caption { font-size: 6.5pt; text-align: center; color: #64748b; margin-top: 2px; }
</style></head>
<body>
  <div class="watermark">LESSON GURU ODISHA</div>
  ${qrDataUrl ? `<div class="qr-wrap"><img src="${qrDataUrl}" alt="QR"/><div class="qr-caption">Verify</div></div>` : ''}
  <div class="banner">
    <div class="brand">📘 LESSON GURU ODISHA</div>
    <h1>${esc(a.title || 'Assessment')}</h1>
    <div class="sub">${esc(a.className || '')}${a.bookName ? ' · ' + esc(a.bookName) : ''}${a.chapterNames?.length ? ' · ' + esc(a.chapterNames.join(', ').slice(0, 90)) : ''}</div>
    <div class="chips">
      <span class="chip">${esc(typeMeta.label || a.type)}</span>
      <span class="chip">${a.totalMarks || typeMeta.totalMarks || 0} Marks</span>
      ${a.durationMin ? `<span class="chip">${a.durationMin} min</span>` : ''}
    </div>
  </div>
  <table class="stu"><tr>
    <td><b>Name:</b> <span style="border-bottom:1px dotted #94a3b8;display:inline-block;min-width:120px">&nbsp;</span></td>
    <td><b>Roll:</b> <span style="border-bottom:1px dotted #94a3b8;display:inline-block;min-width:50px">&nbsp;</span></td>
    <td><b>Section:</b> <span style="border-bottom:1px dotted #94a3b8;display:inline-block;min-width:50px">&nbsp;</span></td>
    <td><b>Date:</b> <span style="border-bottom:1px dotted #94a3b8;display:inline-block;min-width:80px">&nbsp;</span></td>
  </tr>
  ${teacher ? `<tr><td colspan="4" style="background:#ecfdf5;border-left:3px solid #059669"><b>Teacher:</b> ${teacher}${school ? ' · <b>School:</b> ' + school : ''}</td></tr>` : ''}
  </table>
  ${a.instructions ? `<div class="instr">📌 <b>Instructions:</b> ${esc(a.instructions)}</div>` : ''}
  ${renderLOs(a.learningOutcomes)}
  ${renderBlueprint(a.blueprint)}
  ${sections}
  ${renderObservationSheet(a.observationSheet)}
  ${renderRubrics(a.rubrics)}
  ${renderSelfAssessment(a.selfAssessment)}
  ${renderPeerAssessment(a.peerAssessment)}
  ${renderList(a.homework, 'Homework', '📚', '')}
  ${renderList(a.remedial, 'Remedial Activities', '🔧', '')}
  ${renderList(a.enrichment, 'Enrichment Activities', '🌟', '')}
  ${a.projectWork ? `<div class="sec"><h3>🎨 Project Work</h3><div>${esc(a.projectWork)}</div></div>` : ''}
  ${answerKey}
</body></html>`
}

// Re-export the same header/footer as the worksheet PDF for brand consistency
export { worksheetPdfHeader, worksheetPdfFooter } from '@/lib/worksheet-html.js'
