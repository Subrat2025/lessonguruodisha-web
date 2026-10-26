// ============================================================
// LessonGuru Odisha — FA/SA Paper: Teacher Observation Renderer (Rule 11 · v2).
// Deterministic template (no Gemini call) generating PART C —
// 25 marks of teacher-observation tables — driven by the same
// syllabus_data / LO codes / assessment context used by PART A.
// ============================================================

import { gradeToInt } from './sectionPlanner.js'

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const T = {
  Odia: {
    title: 'ଭାଗ ସ — ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ ପତ୍ର (Teacher Observation Record)',
    total: '(କୁଲ ୨୫ ଅଙ୍କ)',
    written: 'ଲିଖିତ କାର୍ଯ୍ୟ',
    project: 'ପ୍ରକଳ୍ପ କାର୍ଯ୍ୟ',
    diary: 'ଶିକ୍ଷାର୍ଥୀ ଡାଏରୀ',
    rubric: 'ଦକ୍ଷତା ମାନ (Beginner / Progressive / Proficient)',
    socio: 'ସାମାଜିକ-ଭାବନାତ୍ମକ ପର୍ଯ୍ୟବେକ୍ଷଣ',
    gaps: 'ଚିହ୍ନଟ ଅଧ୍ୟୟନ ଅନ୍ତର',
    remedial: 'ଉପଚାରାତ୍ମକ କାର୍ଯ୍ୟ ଯୋଜନା',
    sig: 'ସ୍ୱାକ୍ଷର',
    subjectTeacher: 'ବିଷୟ ଶିକ୍ଷକ',
    headTeacher: 'ପ୍ରଧାନ ଶିକ୍ଷକ',
    parent: 'ଅଭିଭାବକ',
    hpcNote: 'ଏହି ଅଙ୍କଗୁଡ଼ିକ ସାରାଂଶ ମୂଲ୍ୟାୟନ ଭାବରେ Holistic Progress Card (HPC) ରେ ଲିପିବଦ୍ଧ ହେବ।',
    student: 'ଛାତ୍ର ନାମ', roll: 'ରୋଲ୍', remarks: 'ମନ୍ତବ୍ୟ',
    levels: ['ପ୍ରାରମ୍ଭ (Beginner)', 'ପ୍ରଗତି (Progressive)', 'ନିପୁଣ (Proficient)'],
    always: 'ସର୍ବଦା', sometimes: 'କେତେବେଳେ', notAtAll: 'ନାହିଁ',
    projectTitles: 'ପ୍ରସ୍ତାବିତ ପ୍ରକଳ୍ପ ଶିଅର୍ଷକ',
  },
  English: {
    title: 'PART C — Teacher Observation Record', total: '(Total 25 marks)',
    written: 'Written Work', project: 'Project Work', diary: "Learner's Diary",
    rubric: 'Competency Rubric (Beginner / Progressive / Proficient)',
    socio: 'Socio-Emotional Observation', gaps: 'Learning gaps identified',
    remedial: 'Remedial action planned',
    sig: 'Signature', subjectTeacher: 'Subject Teacher', headTeacher: 'Head Teacher', parent: 'Parent',
    hpcNote: 'These marks are recorded in the Holistic Progress Card (HPC) under Summative Assessment.',
    student: 'Student Name', roll: 'Roll', remarks: 'Remarks',
    levels: ['Beginner (Prarambha)', 'Progressive (Pragati)', 'Proficient (Nipuna)'],
    always: 'Always', sometimes: 'Sometimes', notAtAll: 'Not at all',
    projectTitles: 'Suggested Project Titles',
  },
  Hindi: {
    title: 'खंड C — शिक्षक अवलोकन प्रपत्र', total: '(कुल 25 अंक)',
    written: 'लिखित कार्य', project: 'परियोजना कार्य', diary: 'शिक्षार्थी डायरी',
    rubric: 'दक्षता मापदंड (प्रारम्भ / प्रगति / निपुण)',
    socio: 'सामाजिक-भावनात्मक अवलोकन', gaps: 'चिन्हित अधिगम अंतराल',
    remedial: 'उपचारात्मक कार्य योजना',
    sig: 'हस्ताक्षर', subjectTeacher: 'विषय शिक्षक', headTeacher: 'प्रधान शिक्षक', parent: 'अभिभावक',
    hpcNote: 'ये अंक Holistic Progress Card (HPC) में सारांश मूल्यांकन के अंतर्गत दर्ज होंगे।',
    student: 'छात्र का नाम', roll: 'रोल', remarks: 'टिप्पणी',
    levels: ['प्रारम्भ (Beginner)', 'प्रगति (Progressive)', 'निपुण (Proficient)'],
    always: 'सदैव', sometimes: 'कभी-कभी', notAtAll: 'कभी नहीं',
    projectTitles: 'सुझाए गए परियोजना शीर्षक',
  },
  Sanskrit: {
    title: 'खण्डः C — शिक्षक-अवलोकन-पत्रम्', total: '(पूर्णाङ्काः 25)',
    written: 'लिखित-कार्यम्', project: 'परियोजना-कार्यम्', diary: 'शिक्षार्थि-दिनान्दिनी',
    rubric: 'दक्षता-मापदण्डाः (प्रारम्भः / प्रगतिः / निपुणः)',
    socio: 'सामाजिक-भाविक-अवलोकनम्', gaps: 'चिन्हितानि अधिगम-अन्तरालानि',
    remedial: 'उपचारात्मक-कार्य-योजना',
    sig: 'हस्ताक्षरम्', subjectTeacher: 'विषय-अध्यापकः', headTeacher: 'प्रधान-अध्यापकः', parent: 'अभिभावकः',
    hpcNote: 'एतानि अङ्कानि Holistic Progress Card (HPC) मध्ये सारांशम्ूल्याङ्कनम् इति निबद्धानि भवन्ति।',
    student: 'छात्रस्य नाम', roll: 'क्रमाङ्कः', remarks: 'टिप्पणी',
    levels: ['प्रारम्भः (Beginner)', 'प्रगतिः (Progressive)', 'निपुणः (Proficient)'],
    always: 'सर्वदा', sometimes: 'कदाचित्', notAtAll: 'न कदाचित्',
    projectTitles: 'प्रस्तावित-परियोजना-शीर्षकाणि',
  },
}
const lang = (l) => T[l] || T.Odia

function stageOf(grade) {
  const n = gradeToInt(grade)
  if (n === 1 || n === 2) return 'Foundational'
  if (n >= 3 && n <= 5) return 'Preparatory'
  return 'Middle'
}

// (a) WRITTEN WORK criteria table (10 marks) — differs by stage.
function writtenWorkRows(stage) {
  if (stage === 'Preparatory') return [
    ['Content understanding', 3],
    ['Organisation and presentation', 2],
    ['Language clarity and correctness', 2],
    ['Neatness and handwriting', 1],
    ['Timely completion', 2],
  ]
  return [
    ['Content (depth of ideas and understanding)', 3],
    ['Organisation (clarity, structure, coherence)', 2],
    ['Language (vocabulary and grammatical accuracy)', 2],
    ['Originality', 1],
    ['Neatness and handwriting', 1],
    ['Timely completion', 1],
  ]
}

// (b) PROJECT WORK criteria table.
function projectWorkRows(stage) {
  if (stage === 'Preparatory') return [
    { c: 'Level of participation and involvement', m: 2 },
    { c: 'Understanding of concept', m: 5 },
    { c: 'Quality of presentation/report', m: 3 },
    { c: 'Creativity and originality', m: 2 },
    { c: 'Timely completion and submission', m: 1 },
    { c: 'Oral explanation/presentation', m: 2 },
  ]
  return [
    { c: 'Level of student involvement and participation', m: 2 },
    { c: 'Quality of project report (content, coherence, language, neatness, handwriting)', m: 4 },
    { c: 'Timely completion and submission', m: 1 },
    { c: 'Effectiveness of presentation and alignment with learning outcomes', m: 3 },
  ]
}

function renderCriteriaTable(t, title, rows, totalMarks) {
  const rowsHtml = rows.map(([c, m]) => `<tr>
      <td>${esc(c)}</td>
      <td style="text-align:center;width:60px">${m}</td>
      <td style="width:120px"></td></tr>`).join('')
  return `
<div class="obs-card">
  <div class="obs-title">${esc(title)} — <span class="obs-marks">${totalMarks} ${'marks'}</span></div>
  <table class="table">
    <thead><tr>
      <th>Criterion</th><th style="width:60px">Marks</th><th style="width:120px">${esc(t.remarks)}</th>
    </tr></thead>
    <tbody>${rowsHtml}
    <tr><td style="text-align:right"><b>Total</b></td><td style="text-align:center"><b>${totalMarks}</b></td><td></td></tr>
    </tbody>
  </table>
</div>`
}

// Rubric — 3-5 observable indicators per learning outcome, at three levels.
// Template-driven (no Gemini call): we build indicators by combining the LO
// text with three verb-strength templates.
function rubricRow(idx, loText, t) {
  const short = String(loText || '').slice(0, 110)
  const cell = (level) => {
    const verbs = level === 1 ? ['recognises', 'names', 'lists'] :
                  level === 2 ? ['explains', 'applies with support', 'describes with an example'] :
                                ['analyses', 'applies independently', 'evaluates and creates from']
    return `<td>${esc(verbs[idx % verbs.length])} <i>${esc(short)}</i></td>`
  }
  return `<tr>
    <td style="text-align:center">${idx + 1}</td>
    <td>${esc(short) || '—'}</td>
    ${cell(1)}${cell(2)}${cell(3)}
  </tr>`
}

function renderRubric(t, loCodes = []) {
  const list = (loCodes || []).slice(0, 5)
  const rows = list.length
    ? list.map((c, i) => rubricRow(i, c.description || c.competency || c.code, t)).join('')
    : `<tr><td colspan="5" style="text-align:center;color:#666">No LO codes supplied — add competencies to the chapter to auto-fill.</td></tr>`
  return `
<div class="obs-card">
  <div class="obs-title">${esc(t.rubric)}</div>
  <table class="table">
    <thead><tr>
      <th style="width:36px">#</th>
      <th>Learning Outcome</th>
      <th>${esc(t.levels[0])} (1)</th>
      <th>${esc(t.levels[1])} (2)</th>
      <th>${esc(t.levels[2])} (3)</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`
}

function renderSocioEmotional(t) {
  const rows = [
    'Regularly attends class and follows classroom norms',
    'Participates in group discussions and activities',
    'Shows curiosity, asks questions',
    'Treats peers and teachers with respect',
    'Manages own emotions and helps others',
    'Demonstrates persistence when a task is difficult',
  ].map(x => `<tr>
      <td>${esc(x)}</td>
      <td style="width:70px;text-align:center">☐</td>
      <td style="width:70px;text-align:center">☐</td>
      <td style="width:70px;text-align:center">☐</td>
    </tr>`).join('')
  return `
<div class="obs-card">
  <div class="obs-title">${esc(t.socio)}</div>
  <table class="table">
    <thead><tr>
      <th>Indicator</th>
      <th style="width:70px">${esc(t.always)}</th>
      <th style="width:70px">${esc(t.sometimes)}</th>
      <th style="width:70px">${esc(t.notAtAll)}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`
}

function renderProjectTitles(t, chapters = []) {
  if (!chapters.length) return ''
  const items = chapters.slice(0, 5).map((c) => {
    const name = c.name || c.chapter_title || ''
    return name ? `<li>${esc('A collaborative project on: ')}<b>${esc(name)}</b></li>` : ''
  }).filter(Boolean).join('')
  if (!items) return ''
  return `
<div class="obs-card">
  <div class="obs-title">${esc(t.projectTitles)}</div>
  <ol class="obs-list">${items}</ol>
</div>`
}

function renderFreeText(t) {
  return `
<div class="obs-card">
  <div class="obs-title">${esc(t.gaps)}</div>
  <div class="blank-lines"></div>
  <div class="blank-lines"></div>
  <div class="blank-lines"></div>
</div>
<div class="obs-card">
  <div class="obs-title">${esc(t.remedial)}</div>
  <div class="blank-lines"></div>
  <div class="blank-lines"></div>
  <div class="blank-lines"></div>
</div>`
}

function renderSignatures(t) {
  return `
<div class="obs-signatures">
  <div class="sig-cell"><div class="sig-line"></div><div>${esc(t.subjectTeacher)}</div></div>
  <div class="sig-cell"><div class="sig-line"></div><div>${esc(t.headTeacher)}</div></div>
  <div class="sig-cell"><div class="sig-line"></div><div>${esc(t.parent)}</div></div>
</div>
<div class="obs-hpc-note">${esc(t.hpcNote)}</div>`
}

/**
 * Main entry — returns the HTML body for PART C.
 * @param {object} opts
 *   language: 'Odia' | 'English' | 'Hindi' | 'Sanskrit'
 *   grade:    Roman
 *   loCodes:  [{ code, description, competency }]
 *   chapters: [{ name, ... }]
 */
export function renderObservationHTML({ language = 'Odia', grade = '', loCodes = [], chapters = [] } = {}) {
  const stage = stageOf(grade)
  if (stage === 'Foundational') return ''            // Rule 3 — no formal observation for I-II here.
  const t = lang(language)

  const projectMarks = stage === 'Preparatory' ? 15 : 10
  const includeDiary = stage === 'Middle'

  const writtenBlock = renderCriteriaTable(t, t.written, writtenWorkRows(stage), 10)
  const projectBlock = renderCriteriaTable(
    t,
    t.project,
    projectWorkRows(stage).map(x => [x.c, x.m]),
    projectMarks,
  )
  const diaryBlock = includeDiary ? renderCriteriaTable(t, t.diary, [
    ['Depth of content understanding and clarity of expression', 2],
    ['Originality (own language, independent thinking)', 2],
    ['Creativity', 1],
  ], 5) : ''

  return `
<div class="page-break">
  <div class="title-strip">${esc(t.title)} ${esc(t.total)}</div>
  ${writtenBlock}
  ${projectBlock}
  ${diaryBlock}
  ${renderProjectTitles(t, chapters)}
  ${renderRubric(t, loCodes)}
  ${renderSocioEmotional(t)}
  ${renderFreeText(t)}
  ${renderSignatures(t)}
</div>
<style>
  .obs-card { margin: 8px 0 10px; break-inside: avoid; page-break-inside: avoid; }
  .obs-title { font-weight:800; margin-bottom:4px; font-size:11.5pt; border-bottom:1px solid #333; padding-bottom:2px; }
  .obs-marks { font-weight:600; font-size:10.5pt; color:#333; }
  .obs-list { margin: 4px 0 0 20px; }
  .obs-signatures { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-top:16mm; text-align:center; font-size:10.5pt; }
  .sig-line { border-top:1px solid #000; margin-bottom:2px; }
  .obs-hpc-note { margin-top:12px; padding:6px 8px; border:1px dashed #666; font-size:10pt; text-align:center; }
</style>`
}
