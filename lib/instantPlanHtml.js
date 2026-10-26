// ============================================================
//  Lesson Diary · A4-Landscape HTML renderer
// ------------------------------------------------------------
//  Server-side renderer used by BOTH:
//    • the on-screen full-screen landscape preview (returned as raw
//      HTML by POST /api/instant-plan/html), and
//    • the downloadable PDF (POST /api/instant-plan/pdf → Puppeteer).
//
//  Matches the uploaded `lesson_diary.html` template exactly — a
//  bilingual Odia/English "Daily Teaching Diary" with:
//    • LG crest masthead + page / month stamp
//    • 15-column colour-banded table (navy · amber · indigo · green)
//      grouped as: Lesson Details (5) · Curriculum Alignment (4) ·
//      Panchapadi Teacher Action (5) · Material (1)
//    • per-step Panchapadi hues + LO / CG / CP chips
//    • signature footer + colophon
//
//  NOTE: The Sl.No (କ୍ରମ) and Assessment (ମୂଲ୍ୟାୟନ) columns were removed
//  per the updated template.
//
//  Odia glyphs are guaranteed to render via base64-embedded Noto Sans
//  Oriya fonts pulled from /app/lib/paperGenerator/fontLoader.js.
// ============================================================
import { fontFaceCSS } from './paperGenerator/fontLoader.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Odia month names — matches the frontend formatOdiaDate helper so PDF
// header dates render identically to the on-screen preview.
const OD_MONTHS = ['ଜାନୁଆରୀ', 'ଫେବ୍ରୁଆରୀ', 'ମାର୍ଚ୍ଚ', 'ଅପ୍ରେଲ', 'ମେ', 'ଜୁନ', 'ଜୁଲାଇ', 'ଅଗଷ୍ଟ', 'ସେପ୍ଟେମ୍ବର', 'ଅକ୍ଟୋବର', 'ନଭେମ୍ବର', 'ଡିସେମ୍ବର']
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const OD_DIGITS = ['୦', '୧', '୨', '୩', '୪', '୫', '୬', '୭', '୮', '୯']
const toOdiaDigits = (s) => String(s ?? '').replace(/[0-9]/g, (d) => OD_DIGITS[+d])

const DIARY_STAGE_LEGACY_MAP = { adhiti: 'prastabana', bodha: 'anweshana', abhyasa: 'alochana', prayoga: 'prayoga', prasara: 'mulyayana' }

// A single Panchapadi stage can appear under several key spellings depending on
// the source: new AI schema (adhiti/bodha/abhyasa/prayoga/prasar), legacy stored
// lessons (prastabana/anweshana/alochana/prayoga/mulyayana), or short variants.
const DIARY_STAGE_KEYS = {
  adhiti:  ['adhiti', 'prastabana', 'aditi'],
  bodha:   ['bodha', 'anweshana', 'bodh'],
  abhyasa: ['abhyasa', 'alochana', 'abhyas'],
  prayoga: ['prayoga', 'prayog'],
  prasara: ['prasara', 'prasar', 'mulyayana', 'mulyayan'],
}

// Given a period + Panchapadi stage key, return { text, minutes }.
// Text is the concatenated teacher/student activity (with icons).
// Minutes is the extracted "⏱ 5 min" bit rendered separately.
function _diaryStageParts(p, stageKey) {
  if (!p) return { text: '', minutes: '' }
  const candidates = DIARY_STAGE_KEYS[stageKey] || [stageKey]
  const pan = p.panchapadi || {}
  let src = null
  for (const k of candidates) { if (pan[k]) { src = pan[k]; break } }
  if (!src && Array.isArray(p.steps)) {
    src = p.steps.find((s) => candidates.includes(s.key) || candidates.includes(s.stage)
      || s.key === DIARY_STAGE_LEGACY_MAP[stageKey] || s.stage === stageKey) || null
  }
  if (!src) return { text: '', minutes: '' }
  const bits = []
  const teacher = src.teacherActivity || src.teacherActivityText || ''
  const student = src.studentActivity || src.studentActivityText || ''
  if (teacher) bits.push('👨‍🏫 ' + esc(teacher))
  if (student) bits.push('🎒 ' + esc(student))
  if (!bits.length) {
    const fallback = src.text || src.content || src.description || ''
    if (fallback) bits.push(esc(fallback))
  }
  const minutes = src.duration || src.timing || src.minutes || ''
  return { text: bits.join('<br/>'), minutes: minutes ? esc(minutes) : '' }
}

function _diarySummary(p) {
  // CG chip (short code) + CG description
  const cgChip = Array.isArray(p?.cgCodes) && p.cgCodes[0] ? p.cgCodes[0]
    : (p?.cgCode || '')
  const cgText = p?.curricularGoalOcf || p?.curricularGoal || ''
  // Competency chip + description
  const cpChip = Array.isArray(p?.competencyCodes) && p.competencyCodes[0] ? p.competencyCodes[0]
    : (p?.competencyCode || '')
  const cpText = p?.competencyOcf || p?.competencyText || p?.competency || ''
  // LO codes (multiple)
  const loCodes = Array.isArray(p?.loCodes) ? p.loCodes.filter(Boolean)
    : (p?.loCode ? [p.loCode] : [])
  // LO description
  const loText = p?.loDescription
    || (Array.isArray(p?.learningOutcomes) && p.learningOutcomes.join(' • '))
    || ''
  const tlm = Array.isArray(p?.tlm) && p.tlm.length ? p.tlm.join(', ')
    : (typeof p?.tlm === 'string' ? p.tlm : '')
  return { cgChip, cgText, cpChip, cpText, loCodes, loText, tlm }
}

// Format date as DD/MM/YYYY (matches uploaded template).
function _dmY(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00Z')
  if (isNaN(d.getTime())) return String(iso)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}

const OD_WEEKDAYS = ['ରବିବାର', 'ସୋମବାର', 'ମଙ୍ଗଳବାର', 'ବୁଧବାର', 'ଗୁରୁବାର', 'ଶୁକ୍ରବାର', 'ଶନିବାର']
// Resolve the Odia weekday name — prefer the plan's own `day` label, else derive from the date.
function _dayName(iso, planDay) {
  if (planDay) return String(planDay)
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00Z')
  if (isNaN(d.getTime())) return ''
  return OD_WEEKDAYS[d.getUTCDay()] || ''
}

function _diaryRowsForPlan(plan, mode) {
  const dateDMY = _dmY(plan?.date)
  const dayName = _dayName(plan?.date, plan?.day)

  if (mode === 'multigrade' && Array.isArray(plan?.classes) && plan.classes.length && !Array.isArray(plan?.periods)) {
    return plan.classes.map((cls, idx) => {
      const s = _diarySummary(cls)
      return {
        _idx: idx,
        date: dateDMY,
        dow: dayName,
        period: plan.periodNumber ? `${toOdiaDigits(plan.periodNumber)} / ${toOdiaDigits(7)}` : (plan.time || ''),
        className: cls.className || '',
        subject: cls.subject || cls.bookName || '',
        topic: cls.chapterName || cls.chapter || cls.title || cls.topic || '',
        topicDesc: cls.topic && cls.chapterName ? cls.topic : '',
        cgChip: s.cgChip, cgText: s.cgText,
        cpChip: s.cpChip, cpText: s.cpText,
        loCodes: s.loCodes, lo: s.loText,
        adhiti: _diaryStageParts(cls, 'adhiti'),
        bodha:  _diaryStageParts(cls, 'bodha'),
        abhyasa: _diaryStageParts(cls, 'abhyasa'),
        prayoga: _diaryStageParts(cls, 'prayoga'),
        prasara: _diaryStageParts(cls, 'prasara'),
        tlm: s.tlm,
      }
    })
  }

  const periods = Array.isArray(plan?.periods) ? plan.periods : []
  const total = periods.length || 7
  return periods.map((p, idx) => {
    const s = _diarySummary(p)
    return {
      _idx: idx,
      date: dateDMY,
      dow: dayName,
      period: p.periodNum ? `${toOdiaDigits(p.periodNum)} / ${toOdiaDigits(total)}` : (p.time || ''),
      className: p.className || plan?.className || '',
      subject: p.subject || plan?.subject || '',
      topic: p.chapterName || p.chapter || p.title || p.topic || '',
      topicDesc: p.topic && (p.chapterName || p.chapter) ? p.topic : '',
      cgChip: s.cgChip, cgText: s.cgText,
      cpChip: s.cpChip, cpText: s.cpText,
      loCodes: s.loCodes, lo: s.loText,
      adhiti: _diaryStageParts(p, 'adhiti'),
      bodha:  _diaryStageParts(p, 'bodha'),
      abhyasa: _diaryStageParts(p, 'abhyasa'),
      prayoga: _diaryStageParts(p, 'prayoga'),
      prasara: _diaryStageParts(p, 'prasara'),
      tlm: s.tlm,
    }
  })
}

// Pick body font-size based on total rows so the sheet never overflows A4-landscape.
function _bodyFontSize(n) {
  if (n <= 2) return 7.4
  if (n <= 4) return 6.9
  if (n <= 6) return 6.4
  return 6.1
}

export function renderInstantPlanDiaryHTML({ plan, showWatermark = true, teacherName = '', mode = 'instant' } = {}) {
  if (!plan) throw new Error('renderInstantPlanDiaryHTML: plan required')
  const rows = _diaryRowsForPlan(plan, mode)
  const bodySize = _bodyFontSize(rows.length)

  // Header stamp — month label + page number (Odia numerals).
  const now = new Date(plan.date ? plan.date + 'T00:00:00Z' : Date.now())
  const monthLbl = `${EN_MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`
  const pageStamp = `${toOdiaDigits(1)} / ${toOdiaDigits(1)}`

  // Body rows — 15 columns.
  const tbody = rows.map((r) => {
    const loCodesHtml = (r.loCodes || []).length
      ? `<div class="stack">${(r.loCodes || []).map(c => `<span class="chip chip-lo">${esc(c)}</span>`).join('')}</div>`
      : '—'
    const cgCell = r.cgChip
      ? `<span class="chip chip-cg">${esc(r.cgChip)}</span><br>${esc(r.cgText)}`
      : esc(r.cgText || '—')
    const cpCell = r.cpChip
      ? `<span class="chip chip-cp">${esc(r.cpChip)}</span><br>${esc(r.cpText)}`
      : esc(r.cpText || '—')
    const step = (obj) => `${obj.text || '—'}${obj.minutes ? `<span class="mins">⏱ ${obj.minutes}</span>` : ''}`
    const topicCell = r.topic
      ? `${esc(r.topic)}${r.topicDesc ? `<div class="desc">${esc(r.topicDesc)}</div>` : ''}`
      : '—'
    return `<tr>
      <td class="c-date"><div class="dt">${esc(r.date) || '—'}</div>${r.dow ? `<div class="dow">${esc(r.dow)}</div>` : ''}</td>
      <td class="c-per">${r.period ? esc(r.period) : '—'}</td>
      <td class="c-cls">${esc(r.className) || '—'}</td>
      <td class="c-sub">${esc(r.subject) || '—'}</td>
      <td class="c-top seam">${topicCell}</td>
      <td class="c-cg">${cgCell}</td>
      <td class="c-cp">${cpCell}</td>
      <td class="c-lc">${loCodesHtml}</td>
      <td class="c-out seam">${esc(r.lo) || '—'}</td>
      <td class="c-p1">${step(r.adhiti)}</td>
      <td class="c-p2">${step(r.bodha)}</td>
      <td class="c-p3">${step(r.abhyasa)}</td>
      <td class="c-p4">${step(r.prayoga)}</td>
      <td class="c-p5 seam">${step(r.prasara)}</td>
      <td class="c-tlm">${esc(r.tlm) || '—'}</td>
    </tr>`
  }).join('')

  const watermarkBlock = showWatermark ? `
    <div class="watermark">LESSON GURU ODISHA</div>` : ''

  return `<!doctype html>
<html lang="or">
<head>
<meta charset="utf-8"/>
<title>ଦୈନନ୍ଦିନ ଶିକ୍ଷଣ ଡାଏରୀ · Daily Teaching Diary</title>
<style>
${fontFaceCSS('Odia')}
/* ============================================================
   1. PAGE — A4 LANDSCAPE, LOCKED
   ============================================================ */
@page { size: A4 landscape; margin: 8mm; }
@media print {
  html, body { width: 281mm; background:#fff; }
  .no-print { display: none !important; }
  .sheet { box-shadow: none; margin: 0; padding: 0; width: auto; }
}

/* ============================================================
   2. TOKENS
   ============================================================ */
:root{
  --ink:#111B33;
  --navy:#1B2A63;   --navy-2:#2A3C82;
  --amber:#A6650B;  --amber-2:#C98A17;
  --indigo:#3A2E7A;
  --green:#146B4B;

  --rule:#7E8AA8;         /* interior vertical rules  */
  --rule-row:#5C6A8C;     /* row separators           */
  --rule-hard:#1B2A63;    /* group seams + outer frame */
  --paper:#FFFFFF;  --wash:#F4F7FC;

  --s1:#2563C9; --s1-bg:#DCE8FF; --s1-cell:#F4F8FF;
  --s2:#10836A; --s2-bg:#D3F1E7; --s2-cell:#F2FBF8;
  --s3:#C07A0A; --s3-bg:#FCE9C6; --s3-cell:#FFFAF0;
  --s4:#C2456F; --s4-bg:#FBDBE6; --s4-cell:#FFF5F8;
  --s5:#7A45C4; --s5-bg:#EBDDFA; --s5-cell:#F9F5FE;
  --tlm:#0E7490; --tlm-bg:#D5EEF5; --tlm-cell:#F3FBFD;

  --or:'Noto Sans Oriya','Noto Sans Devanagari','Nirmala UI','Kalinga','Lohit Odia','Utkal',sans-serif;
  --en:'Inter','Noto Sans','Noto Sans Devanagari','Noto Sans Oriya','Segoe UI',Arial,sans-serif;
}

*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{
  font-family:var(--or), var(--en);
  color:var(--ink); background:#E8ECF4;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
  font-size:${bodySize}pt; line-height:1.34;
}
.sheet{
  position:relative;
  width:281mm; min-height:194mm; margin:10px auto; padding:8mm;
  background:var(--paper); box-shadow:0 6px 30px rgba(17,27,51,.18);
}

/* Watermark — behind the sheet content, shows on-screen + in PDF */
.watermark{
  position:absolute; left:50%; top:48%;
  transform:translate(-50%,-50%) rotate(-28deg);
  font-family:var(--en); font-weight:800; font-size:58pt; letter-spacing:6px;
  color:var(--navy); opacity:.045; white-space:nowrap; pointer-events:none; z-index:0;
}
.masthead,.table-wrap,table,.signs,.colophon{position:relative; z-index:1;}

/* ============================================================
   3. MASTHEAD
   ============================================================ */
.masthead{
  display:flex; align-items:center; gap:9px;
  padding-bottom:5px; margin-bottom:8px;
  border-bottom:2.4px solid var(--navy);
}
.crest{
  width:27px;height:27px;flex:0 0 27px;border-radius:50%;
  background:var(--navy); color:#fff; display:flex;
  align-items:center; justify-content:center;
  font-family:var(--en); font-weight:800; font-size:9pt;
}
.masthead .title{flex:1; text-align:center;}
.t-or{font-family:var(--or); font-weight:700; font-size:15.5pt; color:var(--navy); line-height:1.12;}
.t-en{font-family:var(--en); font-weight:700; font-size:11.5pt; color:var(--s1); letter-spacing:1.4px; margin-left:7px;}
.t-sub{font-family:var(--or); font-size:7pt; color:#5A6580; margin-top:2px;}
.t-sub b{font-family:var(--en); font-weight:600; color:#3D4863;}
.stamp{text-align:right; font-family:var(--en); line-height:1.35; min-width:27px;}
.stamp .pg{font-family:var(--or); font-weight:700; font-size:9pt; color:var(--navy);}
.stamp .mo{font-size:7pt; color:#6B7590;}

/* ============================================================
   4. TABLE — 15 columns, centred auto-fit headings, strong grid
   ============================================================ */
table{
  width:100%; border-collapse:collapse; table-layout:fixed;
  border:1.8px solid var(--rule-hard);
}
thead{display:table-header-group;}
tr{page-break-inside:avoid; break-inside:avoid;}

.band th{
  color:#fff; background:var(--navy);
  min-height:20px; padding:2px 4px; text-align:center; vertical-align:middle;
  border-right:1.6px solid #fff;
}
.band th:last-child{border-right:none;}
.band .b2{background:var(--amber);} .band .b3{background:var(--indigo);} .band .b4{background:var(--green);}
.band .fit{display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:visible;}
.band .or{font-family:var(--or); font-weight:700; font-size:8.2pt; line-height:1.1; white-space:normal;}
.band .en{font-family:var(--en); font-weight:600; font-size:5.6pt; letter-spacing:.8px; text-transform:uppercase; opacity:.85; line-height:1.15; white-space:normal;}

.cols th{
  background:#fff; height:auto; min-height:40px; padding:3px 3px;
  text-align:center; vertical-align:middle;
  border-right:1.2px solid var(--rule);
  border-bottom:1.8px solid var(--rule-hard);
  border-top:3px solid var(--navy);
  color:var(--navy);
}
.cols th:last-child{border-right:none;}
.cols .fit{display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:34px; overflow:visible; text-align:center;}
.cols .or{font-family:var(--or); font-weight:700; font-size:7.1pt; line-height:1.1; white-space:normal; word-break:break-word;}
.cols .en{font-family:var(--en); font-weight:700; font-size:5.8pt; letter-spacing:.3px; text-transform:uppercase; color:#66708A; line-height:1.12; margin-top:.5px; white-space:normal;}
.cols .num{font-family:var(--en); font-weight:800; font-size:6pt; opacity:.55; margin-right:2px;}

.cols .h2{border-top-color:var(--amber-2); color:var(--amber);}
.cols .h2 .en{color:#9A7B3E;}
.cols .p1{border-top-color:var(--s1); background:var(--s1-bg); color:#123C82;}
.cols .p2{border-top-color:var(--s2); background:var(--s2-bg); color:#0A5443;}
.cols .p3{border-top-color:var(--s3); background:var(--s3-bg); color:#7A4C05;}
.cols .p4{border-top-color:var(--s4); background:var(--s4-bg); color:#8A2A4C;}
.cols .p5{border-top-color:var(--s5); background:var(--s5-bg); color:#4E2A8A;}
.cols .ht{border-top-color:var(--tlm); background:var(--tlm-bg); color:#0A5567;}
.cols .p1 .en,.cols .p2 .en,.cols .p3 .en,.cols .p4 .en,
.cols .p5 .en,.cols .ht .en{color:inherit; opacity:.72;}

tbody td{
  padding:4px 4.5px; vertical-align:top;
  border-right:1.2px solid var(--rule);
  border-bottom:1.4px solid var(--rule-row);
  word-wrap:break-word; overflow-wrap:anywhere; hyphens:auto;
}
tbody td:last-child{border-right:none;}
tbody tr:last-child td{border-bottom:none;}

/* group seams: heavier rule where one band ends and the next begins */
.seam{border-right:1.8px solid var(--rule-hard) !important;}

.c-date{text-align:center; font-family:var(--en); font-weight:600; font-size:7pt; background:var(--wash);}
.c-date .dt{white-space:nowrap; font-size:6.6pt; letter-spacing:-.2px;}
.c-date .dow{font-family:var(--or); font-weight:600; font-size:6.2pt; color:#5A6580; margin-top:2px; line-height:1.1;}
.c-per,.c-cls{text-align:center; font-weight:700; color:var(--navy); background:var(--wash);}
.c-sub{font-weight:700; color:var(--navy);}
.c-top{font-weight:700; background:#FCFAF4;}
.c-top .desc{font-weight:400; color:#4B5568; margin-top:2px;}
.c-cg,.c-cp{background:#FFFDF7;}
.c-out{background:#FBFAFF;}
.c-p1{background:var(--s1-cell);} .c-p2{background:var(--s2-cell);}
.c-p3{background:var(--s3-cell);} .c-p4{background:var(--s4-cell);}
.c-p5{background:var(--s5-cell);}
.c-tlm{background:var(--tlm-cell);}

/* LO code cell: chips centred on both axes inside the box */
.c-lc{
  background:#FFFDF7; vertical-align:middle; text-align:center;
  padding:4px 3px;
}
.c-lc .stack{
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:2.5px; height:100%;
}

.chip{
  display:inline-block; max-width:100%; padding:1.2px 4px; border-radius:8px;
  font-family:var(--en); font-weight:700; font-size:6.2pt; letter-spacing:.3px;
  border:1px solid; white-space:normal; word-break:break-word; overflow-wrap:anywhere; line-height:1.2;
}
.chip-cg{color:#8A5300; background:#FFF0CF; border-color:#E8C077;}
.chip-cp{color:#5B2E9E; background:#F0E6FE; border-color:#C6A9F0;}
.chip-lo{color:#12468F; background:#DFEAFF; border-color:#9DBDF0; text-align:center;}
.mins{
  display:block; margin-top:3px; padding-top:2.5px;
  border-top:1px dashed rgba(17,27,51,.32);
  font-family:var(--or); font-weight:700; font-size:6.6pt; opacity:.8;
}

/* ============================================================
   5. FOOTER — signatures only
   ============================================================ */
.signs{display:flex; justify-content:space-around; margin-top:22px;}
.sig{text-align:center; width:42%;}
.sig .ln{border-top:1px solid #6B7590; margin:0 auto 3px; width:80%;}
.sig .or{font-family:var(--or); font-weight:700; font-size:7.8pt;}
.sig .en{font-family:var(--en); font-size:6.6pt; color:#6B7590;}
.colophon{text-align:center; margin-top:7px; font-family:var(--or); font-size:6.4pt; color:#8A93A8;}
</style>
</head>
<body>
<div class="sheet">
${watermarkBlock}

  <div class="masthead">
    <div class="crest">LG</div>
    <div class="title">
      <div class="t-or">ଦୈନନ୍ଦିନ ଶିକ୍ଷଣ ଡାଏରୀ<span class="t-en">DAILY TEACHING DIARY</span></div>
      <div class="t-sub">ପଞ୍ଚପଦୀ ଶିକ୍ଷଣ ପ୍ରକ୍ରିୟା · <b>NEP 2020 / OCF-SE 2025</b> · <b>Lesson Guru Odisha</b></div>
    </div>
    <div class="stamp">
      <div class="pg">ପୃଷ୍ଠା ${pageStamp}</div>
      <div class="mo">${esc(monthLbl)}</div>
    </div>
  </div>

  <table>
    <colgroup>
      <col style="width:5.4%"><col style="width:3.2%"><col style="width:4.0%">
      <col style="width:5.2%"><col style="width:8.2%">
      <col style="width:7.2%"><col style="width:7.4%"><col style="width:5.6%"><col style="width:7.4%">
      <col style="width:7.8%"><col style="width:7.8%"><col style="width:7.8%"><col style="width:7.8%"><col style="width:7.8%">
      <col style="width:7.4%">
    </colgroup>
    <thead>
      <tr class="band">
        <th colspan="5"><div class="fit"><span class="or">ପାଠ ବିବରଣୀ</span><span class="en">Lesson Details</span></div></th>
        <th class="b2" colspan="4"><div class="fit"><span class="or">ପାଠ୍ୟକ୍ରମ ସଂଯୋଜନା</span><span class="en">Curriculum Alignment</span></div></th>
        <th class="b3" colspan="5"><div class="fit"><span class="or">ପଞ୍ଚପଦୀ ଶିକ୍ଷଣ ପ୍ରକ୍ରିୟା — ଶିକ୍ଷକ କାର୍ଯ୍ୟ</span><span class="en">Panchapadi · Teacher Action</span></div></th>
        <th class="b4"><div class="fit"><span class="or">ଶିକ୍ଷଣ ସାମଗ୍ରୀ</span><span class="en">Material</span></div></th>
      </tr>
      <tr class="cols">
        <th><div class="fit"><span class="or">ତାରିଖ</span><span class="en">Day / Date</span></div></th>
        <th><div class="fit"><span class="or">ପିରିୟଡ୍</span><span class="en">Period</span></div></th>
        <th><div class="fit"><span class="or">ଶ୍ରେଣୀ</span><span class="en">Class</span></div></th>
        <th><div class="fit"><span class="or">ବିଷୟ</span><span class="en">Subject</span></div></th>
        <th class="seam"><div class="fit"><span class="or">ପ୍ରସଙ୍ଗ / ବିଷୟବସ୍ତୁ</span><span class="en">Topic</span></div></th>
        <th class="h2"><div class="fit"><span class="or">ପାଠ୍ୟକ୍ରମ ଲକ୍ଷ୍ୟ</span><span class="en">Curricular Goal</span></div></th>
        <th class="h2"><div class="fit"><span class="or">ଦକ୍ଷତା</span><span class="en">Competency</span></div></th>
        <th class="h2"><div class="fit"><span class="or">LO ସଂକେତ</span><span class="en">LO Code</span></div></th>
        <th class="h2 seam"><div class="fit"><span class="or">ଶିକ୍ଷଣ ଫଳାଫଳ</span><span class="en">Learning Outcome</span></div></th>
        <th class="p1"><div class="fit"><span class="or"><span class="num">1.</span>ଅଧୀତି</span><span class="en">Adhiti</span></div></th>
        <th class="p2"><div class="fit"><span class="or"><span class="num">2.</span>ବୋଧ</span><span class="en">Bodha</span></div></th>
        <th class="p3"><div class="fit"><span class="or"><span class="num">3.</span>ଅଭ୍ୟାସ</span><span class="en">Abhyasa</span></div></th>
        <th class="p4"><div class="fit"><span class="or"><span class="num">4.</span>ପ୍ରୟୋଗ</span><span class="en">Prayoga</span></div></th>
        <th class="p5 seam"><div class="fit"><span class="or"><span class="num">5.</span>ପ୍ରସାର</span><span class="en">Prasara</span></div></th>
        <th class="ht"><div class="fit"><span class="or">ଶିକ୍ଷଣ ସାମଗ୍ରୀ</span><span class="en">TLM</span></div></th>
      </tr>
    </thead>
    <tbody>${tbody || `<tr><td colspan="15" style="text-align:center;padding:14px;color:#94a3b8;">No lesson data.</td></tr>`}</tbody>
  </table>

  <div class="signs">
    <div class="sig"><div class="ln"></div><div class="or">ଶିକ୍ଷକଙ୍କ ସ୍ୱାକ୍ଷର</div><div class="en">Teacher's signature</div></div>
    <div class="sig"><div class="ln"></div><div class="or">ପ୍ରଧାନ ଶିକ୍ଷକଙ୍କ ସ୍ୱାକ୍ଷର</div><div class="en">Headmaster's signature</div></div>
  </div>
  <div class="colophon">ପଞ୍ଚପଦୀ ଶିକ୍ଷଣ ଯୋଜନା — Lesson Guru Odisha</div>
</div>
</body>
</html>`
}
