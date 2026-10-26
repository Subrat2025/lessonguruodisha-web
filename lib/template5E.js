// Lesson Guru Odisha — Class 9 & 10 (5E Model) HTML upload template generator
// Produces a fully-structured 5E lesson-plan HTML file that the admin can fill in
// and upload back through /admin/import/5e.
//
// The structure is the *exact* shape the backend parser (`/app/lib/html5eParser.js`)
// expects, so anything filled in correctly here will import without warnings:
//   • <section class="period"> blocks
//   • <h2 class="period-head">PERIOD N (Duration: 45 minutes)</h2>
//   • <div class="topic-banner"><strong>Topic:</strong> …</div>
//   • <table class="plan"> with rows of (<td class="lbl"> · <td class="content">)
//   • A `<td class="full" colspan="2"><table class="fivee">…</table></td>` row holding the 5E grid

const SECTIONS = [
  { label: 'Learning Outcomes (LO)',          placeholder: 'List the curriculum-linked learning outcomes for this period.' },
  { label: 'Competencies',                    placeholder: 'Core competencies the learner will build.' },
  { label: 'Learning Objectives',             placeholder: 'Specific, observable objectives for this period.' },
  { label: 'Previous Knowledge',              placeholder: 'What learners are expected to already know.' },
  { label: 'Teaching-Learning Materials (TLM)', placeholder: 'Chart, flash cards, textbook page X, audio clip, etc.' },
  { label: 'Board Work Plan',                 placeholder: 'Sketch / heading layout that the teacher will write on the board.' },
  { label: 'Competency-Based Questions',      placeholder: 'Questions that assess competency, not memorisation.' },
  { label: 'HOTS Questions',                  placeholder: 'Higher-Order Thinking Skill questions (analysis / synthesis / evaluation).' },
  { label: 'Real-Life Applications',          placeholder: 'How does this concept connect to everyday life?' },
  { label: 'ICT Integration',                 placeholder: 'YouTube link, PhET simulation, GeoGebra applet, slide URL, etc.' },
  { label: 'Art Integration',                 placeholder: 'Drawing / song / role-play / craft tied to the topic.' },
  { label: 'Inclusive Education',             placeholder: 'Adaptations for CWSN, slow learners, gifted learners.' },
  { label: 'Differentiated Instruction',      placeholder: 'Tiered tasks / flexible grouping ideas.' },
  { label: 'Formative Assessment',            placeholder: 'Quick checks during the lesson — thumbs-up, MCQ, exit slip.' },
  { label: 'Exit Ticket',                     placeholder: 'One short question students answer before leaving the class.' },
  { label: 'Homework',                        placeholder: 'Independent practice — book exercise, worksheet, project task.' },
  { label: 'Teacher Reflection',              placeholder: 'Post-class notes the teacher will fill after delivery.' },
]

const FIVE_E_STAGES = [
  { stage: '1. ENGAGE',     time: '5 min',  teacher: 'Hook activity (story / video / question).',                  student: 'Predict / share prior ideas.' },
  { stage: '2. EXPLORE',    time: '10 min', teacher: 'Set up exploration task and circulate.',                     student: 'Investigate / observe / record.' },
  { stage: '3. EXPLAIN',    time: '15 min', teacher: 'Consolidate findings, introduce key vocabulary & concept.',  student: 'Take notes / ask questions / discuss.' },
  { stage: '4. ELABORATE',  time: '10 min', teacher: 'Pose extension / real-life problem.',                        student: 'Apply concept to new context.' },
  { stage: '5. EVALUATE',   time: '5 min',  teacher: 'Give exit ticket / quick MCQ / oral check.',                 student: 'Demonstrate understanding.' },
]

function buildPeriodSection(periodNumber) {
  const planRows = SECTIONS.map(s => `
        <tr>
          <td class="lbl">${s.label}</td>
          <td class="content">
            <ul>
              <li>${s.placeholder}</li>
              <li>(Add more bullets here)</li>
            </ul>
          </td>
        </tr>`).join('')

  const fiveeRows = FIVE_E_STAGES.map(s => `
            <tr>
              <td>${s.stage}</td>
              <td>${s.time}</td>
              <td>${s.teacher}</td>
              <td>${s.student}</td>
            </tr>`).join('')

  return `
    <section class="period">
      <h2 class="period-head">PERIOD ${periodNumber} (Duration: 45 minutes)</h2>
      <div class="topic-banner"><strong>Topic:</strong> [Write the topic of Period ${periodNumber} here]</div>
      <table class="plan">
        <tbody>${planRows}
          <tr><td class="lbl" colspan="2">5E Teaching Process</td></tr>
          <tr>
            <td class="full" colspan="2">
              <table class="fivee">
                <thead>
                  <tr><th>Stage</th><th>Time</th><th>Teacher Activity</th><th>Student Activity</th></tr>
                </thead>
                <tbody>${fiveeRows}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </section>`
}

/**
 * Build a complete 5E HTML template document.
 * @param {Object} opts
 * @param {9|10} opts.classNumber – 9 or 10
 * @param {string} [opts.subject="English"]
 * @param {number} [opts.chapterNumber=1]
 * @param {string} [opts.chapterTitle="[Chapter title]"]
 * @param {number} [opts.totalPeriods=15] – number of period blocks to scaffold (5E lessons typically have 15)
 */
function build5ETemplate(opts = {}) {
  const classNumber = opts.classNumber === 10 ? 10 : 9
  const subject = opts.subject || 'English'
  const chapterNumber = opts.chapterNumber || 1
  const chapterTitle = opts.chapterTitle || '[Chapter title]'
  const totalPeriods = Math.max(1, Math.min(30, opts.totalPeriods || 15))

  const periods = Array.from({ length: totalPeriods }, (_, i) => buildPeriodSection(i + 1)).join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Class ${classNumber} ${subject} — Chapter ${chapterNumber}: ${chapterTitle} (5E Lesson Plan Template)</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color:#1f2937; max-width: 980px; margin: 24px auto; padding: 0 16px; line-height: 1.55; }
  h1, h2 { margin: 18px 0 8px; }
  .titlecard { background: linear-gradient(135deg,#4338ca,#7c3aed); color:#fff; padding:18px 22px; border-radius:14px; margin-bottom:16px; }
  .titlecard h1 { margin:0; font-size:20px; }
  .titlecard p { margin:4px 0 0; opacity:.9; font-size:14px; }
  .school table { width:100%; border-collapse: collapse; margin: 8px 0 18px; }
  .school td { border:1px solid #d1d5db; padding:6px 10px; font-size:13px; }
  section.period { border:1px solid #d1d5db; border-radius:10px; padding:14px 16px; margin: 18px 0; background:#fafafa; page-break-inside: avoid; }
  h2.period-head { background:#0ea5e9; color:#fff; padding:6px 12px; border-radius:6px; font-size:15px; }
  .topic-banner { background:#fef3c7; border-left:4px solid #f59e0b; padding:8px 12px; margin:8px 0 12px; font-size:14px; border-radius:6px; }
  table.plan { width:100%; border-collapse: collapse; margin-top:8px; }
  table.plan td { border:1px solid #cbd5e1; padding:8px 10px; vertical-align: top; font-size:13px; }
  table.plan td.lbl { width: 220px; background:#e0e7ff; font-weight:600; color:#3730a3; }
  table.plan td.content ul { margin:0; padding-left:18px; }
  table.plan td.full { padding: 0; }
  table.fivee { width:100%; border-collapse: collapse; }
  table.fivee th, table.fivee td { border:1px solid #cbd5e1; padding:8px 10px; font-size:13px; vertical-align: top; }
  table.fivee th { background:#fde68a; color:#92400e; font-weight:700; }
  .instructions { background:#ecfdf5; border:1px dashed #10b981; padding:12px 16px; border-radius:10px; font-size:13px; margin: 10px 0 20px; }
  .instructions code { background:#f1f5f9; padding:1px 5px; border-radius:4px; font-size:12px; }
</style>
</head>
<body>

  <!-- TITLE / COVER CARD ============================================== -->
  <div class="titlecard">
    <h1>Class ${classNumber} · ${subject}</h1>
    <p>Chapter ${chapterNumber}: ${chapterTitle}</p>
  </div>
  <p style="text-align:center; color:#6b7280; font-size:12px; margin:6px 0 18px;">SCERT Odisha · OCF-SE 2025 · 5E Instructional Model</p>

  <!-- SCHOOL / META TABLE — used by the parser to detect class & subject -->
  <div class="school">
    <table>
      <tr><td><strong>Class:</strong> ${classNumber}</td><td><strong>Subject:</strong> ${subject}</td></tr>
      <tr><td><strong>Chapter:</strong> ${chapterNumber} — ${chapterTitle}</td><td><strong>Total Periods:</strong> ${totalPeriods}</td></tr>
    </table>
  </div>

  <!-- AUTHORING INSTRUCTIONS — these are ignored by the parser, safe to leave. -->
  <div class="instructions">
    <p><strong>✍️ How to fill this template</strong></p>
    <ol>
      <li>Update the <code>Class</code>, <code>Subject</code>, <code>Chapter</code> and <code>Chapter title</code> fields above.</li>
      <li>For each <code>&lt;section class="period"&gt;</code> block, replace the topic in the yellow banner.</li>
      <li>Replace the placeholder bullets inside each section (Learning Outcomes, Competencies, etc.) with the real content. Keep one bullet per <code>&lt;li&gt;</code>.</li>
      <li>Fill in each row of the 5E grid (Teacher Activity / Student Activity / Time).</li>
      <li>Save as <code>.html</code> and upload it back through <strong>Admin → Class 9-10 5E → Upload</strong>.</li>
      <li>Delete extra period sections you don't need — most chapters have 15 periods but you can keep as few as 1.</li>
    </ol>
    <p>Tip: do not change the <code>class=&quot;lbl&quot;</code>, <code>class=&quot;content&quot;</code>, <code>class=&quot;period&quot;</code>, <code>class=&quot;period-head&quot;</code>, <code>class=&quot;topic-banner&quot;</code>, <code>table.plan</code> or <code>table.fivee</code> attributes — the parser relies on these.</p>
  </div>

  ${periods}

</body>
</html>`
}

module.exports = { build5ETemplate }
