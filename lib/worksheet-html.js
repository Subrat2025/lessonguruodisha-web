// Server-side HTML builder for worksheet PDF export.
// Produces a print-ready A4 HTML document (Puppeteer will render this to PDF).
// Includes LessonGuru Odisha branding: gradient banner header + branded footer
// with teacher name, generation date, page numbers, and URL.
//
// Odia font handling: We EMBED Noto Sans Oriya (Regular + Bold) directly into
// the HTML as base64 data-URI @font-face rules.  This guarantees perfect Odia
// script rendering regardless of the container's installed system fonts or
// network access to Google Fonts.  Fonts are read once at process startup
// and cached in memory.

import { readFileSync } from 'fs'
import path from 'path'

// -- Load & cache Odia fonts at module init (fast subsequent renders) --
let _odiaFontCSS = null
const loadOdiaFontCSS = () => {
  if (_odiaFontCSS !== null) return _odiaFontCSS
  try {
    const candidates = [
      // 1. Fonts bundled with the app (works in production)
      {
        r: '/app/public/fonts/NotoSansOriyaUI-Regular.ttf',
        b: '/app/public/fonts/NotoSansOriyaUI-Bold.ttf',
        r2: '/app/public/fonts/NotoSansOriya-Regular.ttf',
        b2: '/app/public/fonts/NotoSansOriya-Bold.ttf',
      },
      // 2. Fonts installed via apt-get (works in preview / dev)
      {
        r: '/usr/share/fonts/truetype/noto/NotoSansOriyaUI-Regular.ttf',
        b: '/usr/share/fonts/truetype/noto/NotoSansOriyaUI-Bold.ttf',
        r2: '/usr/share/fonts/truetype/noto/NotoSansOriya-Regular.ttf',
        b2: '/usr/share/fonts/truetype/noto/NotoSansOriya-Bold.ttf',
      },
    ]
    for (const c of candidates) {
      try {
        const reg = readFileSync(c.r).toString('base64')
        const bold = readFileSync(c.b).toString('base64')
        // Also try to embed the regular (non-UI) variant as a secondary fallback
        let reg2 = '', bold2 = ''
        try { reg2 = readFileSync(c.r2).toString('base64') } catch (_err) { /* skip */ }
        try { bold2 = readFileSync(c.b2).toString('base64') } catch (_err) { /* skip */ }
        _odiaFontCSS = `
          /* Primary — Noto Sans Oriya UI variant (better shaping for print PDFs) */
          @font-face {
            font-family: 'Noto Sans Oriya Embedded';
            font-style: normal;
            font-weight: 400;
            font-display: block;
            src: url(data:font/ttf;base64,${reg}) format('truetype');
            unicode-range: U+0000-007F, U+00A0-024F, U+0B00-0B7F, U+2000-206F, U+20B9;
          }
          @font-face {
            font-family: 'Noto Sans Oriya Embedded';
            font-style: normal;
            font-weight: 700;
            font-display: block;
            src: url(data:font/ttf;base64,${bold}) format('truetype');
            unicode-range: U+0000-007F, U+00A0-024F, U+0B00-0B7F, U+2000-206F, U+20B9;
          }
          ${reg2 ? `@font-face { font-family: 'Noto Sans Oriya Embedded 2'; font-style: normal; font-weight: 400; src: url(data:font/ttf;base64,${reg2}) format('truetype'); }` : ''}
          ${bold2 ? `@font-face { font-family: 'Noto Sans Oriya Embedded 2'; font-style: normal; font-weight: 700; src: url(data:font/ttf;base64,${bold2}) format('truetype'); }` : ''}`
        return _odiaFontCSS
      } catch (_err) { /* try next candidate */ }
    }
  } catch (_err) { /* ignore */ }
  _odiaFontCSS = '' // no font available — fall back to Google Fonts / system
  return _odiaFontCSS
}
// Also expose the process-cwd resolved path for good measure (unused but useful for debug)
void path

const escape = (s = '') => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const TYPE_LABEL = {
  practice: 'Practice', assessment: 'Assessment', hots: 'HOTS',
  activity: 'Activity', competency: 'Competency', skill: 'Skill',
  revision: 'Revision', homework: 'Homework', project: 'Project',
  remedial: 'Remedial', exam: 'Exam',
}

const renderQuestion = (q, i, format, isAns) => {
  const numBadge = `<span class="qnum">${i + 1}</span>`
  // Optional per-question marks badge (used by Assessment-of-the-Period).
  const marksBadge = (Number(q.marks) > 0)
    ? `<span style="background:#7c3aed;color:#fff;padding:1px 10px;border-radius:12px;font-size:9pt;font-weight:800;margin-left:8px;white-space:nowrap;vertical-align:middle">${Number(q.marks)} mark${Number(q.marks) === 1 ? '' : 's'}</span>`
    : ''
  const qBase = `<div class="qrow"><div>${numBadge}</div><div class="qtxt"><b>${escape(q.question || '')}</b>${marksBadge}</div></div>`
  if (format === 'mcq') {
    const opts = (q.options || []).map((o, j) => {
      const letter = String.fromCharCode(65 + j)
      const isCorrect = isAns && o === q.answer
      return `<div class="opt ${isCorrect ? 'correct' : ''}"><span class="letter">(${letter})</span><span>${escape(o)}${isCorrect ? ' ✓' : ''}</span></div>`
    }).join('')
    return `<div class="qcard">${qBase}${opts}${isAns && q.explanation ? `<div class="expl">💡 ${escape(q.explanation)}</div>` : ''}</div>`
  }
  if (format === 'fill') {
    return `<div class="qcard">${qBase}${isAns ? `<div class="ans">✓ ${escape(q.answer)}</div>` : (q.hint ? `<div class="hint">💡 Hint: ${escape(q.hint)}</div>` : '')}</div>`
  }
  if (format === 'truefalse') {
    return `<div class="qcard">${qBase}${isAns ? `<div class="ans">Answer: ${escape(q.answer)} — ${escape(q.explanation || '')}</div>` : `<div class="tf">☐ True &nbsp;&nbsp; ☐ False</div>`}</div>`
  }
  if (format === 'oneword' || format === 'vshort') {
    return `<div class="qcard-thin">${qBase}${isAns ? `<div class="ans">✓ ${escape(q.answer)}</div>` : `<div class="line"></div>`}</div>`
  }
  if (format === 'short') {
    return `<div class="qcard-short">${qBase}${isAns ? `<div class="ans"><b>✓ Answer:</b> ${escape(q.answer)}</div>${(q.keyPoints || []).length ? `<div class="keys">Key: ${(q.keyPoints).map(escape).join(' · ')}</div>` : ''}` : `<div class="lines"><div class="line"></div><div class="line"></div></div>`}</div>`
  }
  if (format === 'long') {
    return `<div class="qcard-long">${qBase}${isAns ? `<div class="ans"><b>✓ Model Answer:</b> ${escape(q.answer)}</div>${(q.keyPoints || []).length ? `<div class="keys"><b>Key points:</b> ${(q.keyPoints).map(escape).join(' · ')}</div>` : ''}` : `<div class="lines">${Array(5).fill('<div class="line"></div>').join('')}</div>`}</div>`
  }
  if (format === 'match') {
    const colA = (q.columnA || []).map((x, j) => `<tr><td class="mA"><b>${j + 1}.</b> ${escape(x)}</td></tr>`).join('')
    const colB = (q.columnB || []).map((x, j) => `<tr><td class="mB"><b>${String.fromCharCode(65 + j)}.</b> ${escape(x)}</td></tr>`).join('')
    const ans = (q.answer || []).map(a => `<div>${escape(a)}</div>`).join('')
    return `<div class="qcard">${qBase}
      <table class="mtable">
        <tr><th class="mhA">Column A</th><th class="mhB">Column B (shuffled)</th></tr>
        <tr><td valign="top"><table>${colA}</table></td><td valign="top"><table>${colB}</table></td></tr>
      </table>
      ${isAns ? `<div class="ans">✓ ${ans}</div>` : ''}
    </div>`
  }
  if (format === 'diagram') {
    const labels = (q.labels || []).map((l, j) => `<span class="lbl">${j + 1}. ${escape(l)}</span>`).join('')
    return `<div class="qcard-diagram">${qBase}
      <div class="dsub"><b>Subject:</b> ${escape(q.subject || '')}</div>
      ${q.description ? `<div class="ddesc">${escape(q.description)}</div>` : ''}
      <div class="dbox">[ ${!isAns ? 'Draw and label here' : 'Diagram area'} ]</div>
      <div class="dlabels"><b>${isAns ? '✓ Labels:' : 'Labels to place:'}</b> ${labels}</div>
    </div>`
  }
  if (format === 'case') {
    const subs = (q.subQuestions || []).map((sq, j) => `<div class="sub">(${String.fromCharCode(97 + j)}) ${escape(sq)}${isAns && q.answer?.[j] ? `<div class="ans">✓ ${escape(q.answer[j])}</div>` : `<div class="line"></div>`}</div>`).join('')
    return `<div class="qcard-case">${qBase}<div class="subs"><b>Sub-questions:</b>${subs}</div></div>`
  }
  return qBase
}

/**
 * Build a full HTML document for a worksheet variant (worksheet or answers).
 * @param {object} worksheet MongoDB worksheet document
 * @param {'worksheet'|'answers'} variant
 * @param {object} opts { teacherName, school, publicUrl }
 */
export function buildWorksheetHTML(worksheet, variant = 'worksheet', opts = {}) {
  const isAns = variant === 'answers'
  const teacher = escape(opts.teacherName || '')
  const school = escape(opts.school || '')
  const publicUrl = opts.publicUrl || 'lessonguruodisha.com'
  const typeLabel = TYPE_LABEL[worksheet.type] || worksheet.type
  const diffColor = worksheet.difficulty === 'easy' ? '#10b981' : worksheet.difficulty === 'hard' ? '#ef4444' : '#f59e0b'
  const diffLabel = worksheet.difficulty === 'easy' ? '🟢 Easy' : worksheet.difficulty === 'hard' ? '🔴 Hard' : '🟡 Medium'

  const banner = `
    <div class="banner">
      <div class="brand-row">
        <div class="logo">📘</div>
        <div class="brand-txt">
          <div class="brand-name">Lesson Guru Odisha</div>
          <div class="brand-sub">${escape(worksheet.className || '')}${worksheet.bookName ? ' · ' + escape(worksheet.bookName) : ''}</div>
        </div>
      </div>
      <div class="title">${escape(worksheet.title || 'Worksheet')}</div>
      <div class="sub">${escape(worksheet.chapterName || '')}${worksheet.lessonTitle ? ' · ' + escape(worksheet.lessonTitle) : ''}</div>
      <div class="chips">
        <span class="chip">${escape(typeLabel)}</span>
        <span class="chip">${worksheet.count} Questions</span>
        <span class="chip" style="background:${diffColor}">${diffLabel}</span>
      </div>
    </div>`

  const studentInfo = !isAns ? `
    <table class="stu">
      <tr>
        <td class="s1"><b>Name:</b> <span class="ln"></span></td>
        <td class="s2"><b>Class:</b> <span class="lns"></span></td>
        <td class="s3"><b>Roll:</b> <span class="lns"></span></td>
        <td class="s4"><b>Date:</b> <span class="lnm"></span></td>
      </tr>
      ${teacher ? `<tr><td colspan="4" class="tinfo">👩‍🏫 <b>Teacher:</b> ${teacher}${school ? ' · <b>School:</b> ' + school : ''}</td></tr>` : ''}
    </table>` : `<div class="ans-badge-wrap"><div class="ans-badge">🔑 ANSWER KEY</div>${teacher ? `<div class="tinfo center">👩‍🏫 <b>Teacher:</b> ${teacher}${school ? ' · <b>School:</b> ' + school : ''}</div>` : ''}</div>`

  const instructions = worksheet.instructions ? `<div class="instr">📌 <b>Instructions:</b> ${escape(worksheet.instructions)}</div>` : ''
  // 📋 Assessment-of-the-Period support: worksheets with format ==='assessment-period'
  // carry a `sections` array instead of `questions` at the top level.  Render each
  // section header + questions, so the server-side PDF is never blank for this format.
  const isPeriod = worksheet.format === 'assessment-period'
  const questions = (isPeriod && Array.isArray(worksheet.sections))
    ? worksheet.sections.map((sec, sIdx) => {
        const secHead = `<div style="margin:14px 0 6px;padding:8px 12px;background:linear-gradient(90deg,#7c3aed 0%,#a855f7 100%);color:#fff;border-radius:8px;display:flex;justify-content:space-between;align-items:center;page-break-after:avoid">
          <b style="font-size:12pt">${escape(sec.name || `Section ${String.fromCharCode(65 + sIdx)}`)}</b>
          <span style="background:rgba(255,255,255,.25);padding:3px 12px;border-radius:12px;font-size:9.5pt;font-weight:700">${Number(sec.marks) || 0} marks</span>
        </div>
        ${sec.description ? `<div style="margin:0 0 6px;font-size:9.5pt;color:#6b21a8;font-style:italic">${escape(sec.description)}</div>` : ''}`
        const secQs = (sec.questions || []).map((q, i) => {
          // Emit with each question's own qtype (mcq/fill/short/long/match/etc.)
          // Falls back to 'short' for unknown qtypes so the renderer always draws
          // question text + writing lines.  renderQuestion adds the marks badge.
          const qType = q.qtype || 'short'
          return renderQuestion(q, i, qType, isAns)
        }).join('')
        return `<div style="page-break-inside:avoid">${secHead}${secQs}</div>`
      }).join('')
    : (worksheet.questions || []).map((q, i) => renderQuestion(q, i, worksheet.format, isAns)).join('')
  const dt = new Date().toLocaleDateString('en-IN')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escape(worksheet.title || 'Worksheet')}${isAns ? ' — Answer Key' : ''}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Oriya:wght@400;500;600;700;900&family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
  ${loadOdiaFontCSS()}
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Oriya:wght@400;500;600;700;900&family=Inter:wght@400;600;700;900&display=swap');
  @page { size: A4; margin: 12mm 10mm 16mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans Oriya Embedded','Noto Sans Oriya Embedded 2','Noto Sans Oriya UI','Noto Sans Oriya','Lohit Odia','Inter','Segoe UI',sans-serif; font-size: 10.5pt; color: #0f172a; margin: 0; padding: 0; background: #fff; font-feature-settings: "liga" 1, "clig" 1, "calt" 1, "kern" 1; text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; letter-spacing: 0; word-spacing: 0; }
  .qtxt, .qtxt b, .opt, .ans, .expl, .hint, .keys, .instr, .sub, .dsub, .ddesc, .lbl, .mA, .mB { font-feature-settings: "liga" 1, "clig" 1, "calt" 1, "kern" 1; letter-spacing: 0 !important; }
  .banner { background: linear-gradient(135deg,#1e40af 0%,#7c3aed 100%); color:#fff; padding: 10mm 8mm; text-align: center; border-radius: 0 0 18px 18px; position: relative; }
  .brand-row { display: flex; justify-content: center; align-items: center; gap: 10px; margin-bottom: 6px; }
  .logo { width: 36px; height: 36px; background: rgba(255,255,255,.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18pt; }
  .brand-name { font-weight: 900; font-size: 12pt; letter-spacing: 1px; }
  .brand-sub { font-size: 8pt; opacity: .85; letter-spacing: 1.5px; text-transform: uppercase; }
  .title { font-weight: 900; font-size: 16pt; margin: 4px 0; line-height: 1.2; }
  .sub { font-size: 10pt; opacity: .9; }
  .chips { display: flex; gap: 6px; justify-content: center; margin-top: 6px; }
  .chip { background: rgba(255,255,255,.2); padding: 3px 10px; border-radius: 12px; font-size: 8.5pt; font-weight: 700; }
  .stu { width: calc(100% - 16mm); margin: 8px 8mm; border-collapse: separate; border-spacing: 6px; font-size: 10pt; }
  .stu td { padding: 6px 10px; border-radius: 6px; background: #f1f5f9; }
  .s1 { border-left: 3px solid #3b82f6; }
  .s2 { border-left: 3px solid #10b981; width: 80px; }
  .s3 { border-left: 3px solid #f59e0b; width: 80px; }
  .s4 { border-left: 3px solid #a855f7; width: 110px; }
  .ln { border-bottom: 1px dotted #94a3b8; display: inline-block; min-width: 150px; }
  .lns { border-bottom: 1px dotted #94a3b8; display: inline-block; min-width: 40px; }
  .lnm { border-bottom: 1px dotted #94a3b8; display: inline-block; min-width: 70px; }
  .tinfo { background: #ecfdf5 !important; border-left: 3px solid #059669 !important; padding: 6px 10px; font-size: 9.5pt; }
  .tinfo.center { text-align: center; }
  .ans-badge-wrap { text-align: center; margin: 10px 0; }
  .ans-badge { display: inline-block; background: #fef2f2; color: #b91c1c; padding: 6px 24px; border-radius: 20px; font-weight: 800; font-size: 11pt; border: 2px solid #fca5a5; }
  .instr { margin: 6px 8mm; padding: 6px 12px; background: #fff7ed; border-left: 4px solid #f97316; border-radius: 6px; font-size: 10pt; font-style: italic; color: #7c2d12; }
  .content { padding: 0 8mm; }
  .qnum { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; background: linear-gradient(135deg,#3b82f6,#6366f1); color: #fff; border-radius: 50%; font-weight: 700; font-size: 9.5pt; margin-right: 8px; flex-shrink: 0; }
  .qrow { display: flex; align-items: flex-start; font-size: 10.5pt; line-height: 1.5; }
  .qtxt { flex: 1; }
  .qcard { margin: 8px 0; padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; page-break-inside: avoid; }
  .qcard-thin { margin: 6px 0; padding: 4px 10px; border-bottom: 1px dotted #cbd5e1; page-break-inside: avoid; }
  .qcard-short { margin: 8px 0; padding: 6px 10px; border-left: 3px solid #6366f1; background: #f8fafc; page-break-inside: avoid; }
  .qcard-long { margin: 10px 0; padding: 6px 10px; border-left: 4px solid #a855f7; background: #faf5ff; page-break-inside: avoid; }
  .qcard-diagram { margin: 10px 0; padding: 10px; border: 2px dashed #fbbf24; border-radius: 8px; background: #fffbeb; page-break-inside: avoid; }
  .qcard-case { margin: 10px 0; padding: 10px; border-left: 5px solid #06b6d4; background: #ecfeff; border-radius: 6px; page-break-inside: avoid; }
  .opt { display: flex; gap: 8px; margin: 3px 0 3px 30px; font-size: 10.5pt; }
  .opt.correct { color: #065f46; font-weight: 700; background: #d1fae5; border-radius: 4px; padding: 2px 6px; }
  .letter { width: 22px; text-align: center; font-weight: 700; color: #64748b; }
  .opt.correct .letter { color: #065f46; }
  .expl { margin: 6px 0 0 30px; padding: 6px 8px; background: #eff6ff; border-left: 3px solid #3b82f6; border-radius: 4px; font-size: 9pt; color: #1e40af; }
  .ans { color: #059669; margin: 4px 0 0 30px; font-weight: 700; }
  .hint { margin: 4px 0 0 30px; font-size: 9pt; color: #64748b; }
  .tf { margin: 4px 0 0 30px; font-size: 10pt; color: #64748b; }
  .line { border-bottom: 1px dotted #94a3b8; height: 16px; margin-top: 6px; margin-left: 30px; }
  .lines { margin: 6px 0 0 30px; }
  .lines .line { margin-left: 0; }
  .keys { margin: 2px 0 0 30px; font-size: 9pt; color: #64748b; }
  .mtable { width: 100%; margin: 8px 0 0 30px; border-collapse: collapse; font-size: 10.5pt; }
  .mtable th { padding: 4px; border: 1px solid #cbd5e1; }
  .mhA { background: #dbeafe; width: 50%; }
  .mhB { background: #dcfce7; }
  .mA { border: 1px solid #cbd5e1; padding: 6px 10px; background: #eff6ff; }
  .mB { border: 1px solid #cbd5e1; padding: 6px 10px; background: #f0fdf4; }
  .dsub, .ddesc { margin: 4px 0 0 30px; font-size: 9pt; color: #78350f; }
  .ddesc { font-style: italic; }
  .dbox { margin: 8px 0 0 30px; height: 100px; border: 2px solid #d1d5db; border-radius: 6px; background: #fff; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 9pt; }
  .dlabels { margin: 6px 0 0 30px; font-size: 9pt; color: #78350f; }
  .lbl { display: inline-block; background: #fef3c7; border: 1px dashed #f59e0b; padding: 3px 10px; margin: 2px; border-radius: 12px; font-size: 10pt; }
  .subs { margin: 8px 0 0 30px; }
  .sub { margin: 4px 0 0 20px; font-size: 10.5pt; }
</style></head>
<body>
  ${banner}
  ${studentInfo}
  ${instructions}
  <div class="content">${questions}</div>
</body></html>`
}

export const worksheetPdfHeader = () => `
  <div style="width:100%;font-size:8pt;color:#64748b;padding:0 10mm;display:flex;justify-content:space-between;align-items:center;">
    <span><b style="color:#1e40af">📘 Lesson Guru Odisha</b></span>
    <span style="opacity:.7">lessonguruodisha.com</span>
  </div>`

export const worksheetPdfFooter = (teacherName = '') => `
  <div style="width:100%;font-size:7.5pt;color:#64748b;padding:0 10mm;display:flex;justify-content:space-between;align-items:center;">
    <span>${teacherName ? '👩‍🏫 ' + teacherName.replace(/</g, '&lt;') + ' · ' : ''}Generated ${new Date().toLocaleDateString('en-IN')}</span>
    <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`
