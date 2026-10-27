// === TOB === Phase D — class-wide HPC gradebook (per teacher, per roster).
// Pulls saved per-student records to SUGGEST written/project marks, lets the
// teacher enter FA/SA/diary and (for Foundational) levels, and exports the
// filled R1–R7 as PDF + Excel. New collection only: tobGradebook. Private.
import { TOB_FRAMEWORK, stageForClass } from '@/lib/tob/validate.js'

export const GB = 'tobGradebook'
const r1 = (n) => (n == null || n === '' || isNaN(n)) ? null : Math.round(Number(n) * 10) / 10
const OD = '୦୧୨୩୪୫୬୭୮୯'
const od = (n) => String(n == null ? '' : n).replace(/[0-9]/g, x => OD[+x])

export async function ensureGbIndexes(db) {
  try { await db.collection(GB).createIndex({ teacherId: 1, rosterId: 1, subject_id: 1, term: 1, studentId: 1 }, { unique: true }) } catch (_) {}
}

export function frameworkFor(cls) {
  const stage = stageForClass(cls)
  const fw = TOB_FRAMEWORK[stage]
  return { stage, marks: !!fw.marks, written: fw.written || 0, project: fw.project || 0, diary: fw.diary || 0, total: fw.total || 0, levels: fw.levels || null }
}

// Suggest written (avg of the student's task marks) & project (avg of project
// marks) per term, from saved records for this class+subject.
async function autoSuggest(db, teacherId, { class: cls, subject_id }) {
  const recs = await db.collection('tobRecords').find({ teacherId, class: String(cls), subject_id: String(subject_id).toUpperCase() }).project({ _id: 0, studentId: 1, part: 1, term: 1, marks: 1 }).toArray()
  const acc = {} // studentId -> term -> {A:[], B:[]}
  for (const r of recs) {
    if (r.marks == null || isNaN(r.marks)) continue
    const t = Number(r.term) || 1
    acc[r.studentId] = acc[r.studentId] || { 1: { A: [], B: [] }, 2: { A: [], B: [] } }
    ;(acc[r.studentId][t] || (acc[r.studentId][t] = { A: [], B: [] }))[r.part].push(Number(r.marks))
  }
  const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null
  const out = {}
  for (const sid of Object.keys(acc)) {
    out[sid] = {}
    for (const t of [1, 2]) { const g = acc[sid][t] || { A: [], B: [] }; out[sid][t] = { written: r1(avg(g.A)), project: r1(avg(g.B)), nTasks: g.A.length, nProjects: g.B.length } }
  }
  return out
}

export async function getGradebook(db, teacherId, { rosterId, subject_id, class: cls }) {
  const saved = await db.collection(GB).find({ teacherId, rosterId, subject_id: String(subject_id).toUpperCase() }).project({ _id: 0 }).toArray()
  const byKey = {}
  for (const s of saved) byKey[`${s.studentId}|${s.term}`] = s
  const suggest = await autoSuggest(db, teacherId, { class: cls, subject_id })
  return { fw: frameworkFor(cls), saved: byKey, suggest }
}

// Compute HPC totals for one saved/entered row.
export function computeRow(fw, row) {
  if (!fw.marks) return { level: row?.level || '', teacherObs: null, termTotal: null }
  const written = Math.min(Number(row?.written) || 0, fw.written)
  const project = Math.min(Number(row?.project) || 0, fw.project)
  const diary = Math.min(Number(row?.diary) || 0, fw.diary)
  const teacherObs = Math.min(written + project + diary, fw.total)
  const fa = Math.min(Number(row?.fa) || 0, 25)
  const sa = Math.min(Number(row?.sa) || 0, 50)
  const termTotal = Math.min(teacherObs + fa + sa, 100)
  return { written, project, diary, fa, sa, teacherObs, termTotal }
}

export async function saveGradebook(db, teacherId, body) {
  const { rosterId, subject_id, term, studentId, class: cls } = body || {}
  if (!rosterId || !subject_id || !studentId || !term) return { ok: false, error: 'rosterId, subject_id, term, studentId required' }
  const termKey = isNaN(Number(term)) ? String(term) : Number(term)
  const set = { class: String(cls || ''), updatedAt: new Date() }
  if (termKey === 'D') { set.partD = Array.isArray(body.partD) ? body.partD.map(x => ({ key: String(x.key || ''), label: String(x.label || ''), level: String(x.level || ''), remark: String(x.remark || '').slice(0, 300) })) : [] }
  else { Object.assign(set, { written: r1(body.written), project: r1(body.project), diary: r1(body.diary), fa: r1(body.fa), sa: r1(body.sa), level: String(body.level || '') }) }
  await db.collection(GB).updateOne(
    { teacherId, rosterId, subject_id: String(subject_id).toUpperCase(), term: termKey, studentId },
    { $set: set, $setOnInsert: { createdAt: new Date() } }, { upsert: true }
  )
  return { ok: true }
}

// Part D — socio-emotional competencies (not the official govt form).
export const PART_D = [
  { key: 'self', label: 'ଆତ୍ମ-ସଚେତନତା' },
  { key: 'social', label: 'ସାମାଜିକ ଦକ୍ଷତା ଓ ସହଯୋଗ' },
  { key: 'emotion', label: 'ଭାବନା ନିୟନ୍ତ୍ରଣ' },
  { key: 'curiosity', label: 'କୌତୂହଳ ଓ ସୃଜନଶୀଳତା' },
]

// One-page printable HPC card for a single child (owner teacher only).
export function hpcCardHtml(student, gb, meta) {
  const fw = gb.fw
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const C = { indigo: '#241a5e', sky: '#1577a8', green: '#1f7a46', saffron: '#f7b32b' }
  const row = (t) => {
    const sv = gb.saved[`${student.id}|${t}`] || {}; const sg = gb.suggest[student.id]?.[t] || {}
    const r = { written: sv.written ?? sg.written, project: sv.project ?? sg.project, diary: sv.diary, fa: sv.fa, sa: sv.sa, level: sv.level }
    return { ...r, ...computeRow(fw, r) }
  }
  const partD = (gb.saved[`${student.id}|D`]?.partD) || PART_D.map(p => ({ ...p, level: '', remark: '' }))
  const termBlock = (t, label, color) => {
    const x = row(t)
    if (!fw.marks) return `<div class="tcard"><div class="th" style="color:${color}">${label}</div><div class="lv">ସ୍ତର: <b>${esc(x.level || '—')}</b></div></div>`
    return `<div class="tcard"><div class="th" style="color:${color}">${label}</div>
      <table><tr><td>ଲିଖିତ /${od(fw.written)}</td><td>${esc(x.written ?? '—')}</td></tr>
      <tr><td>ପ୍ରକଳ୍ପ /${od(fw.project)}</td><td>${esc(x.project ?? '—')}</td></tr>
      ${fw.diary ? `<tr><td>ଡାଏରୀ /${od(fw.diary)}</td><td>${esc(x.diary ?? '—')}</td></tr>` : ''}
      <tr class="sub"><td>ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ /୨୫</td><td><b>${esc(x.teacherObs ?? '—')}</b></td></tr>
      <tr><td>FA /୨୫</td><td>${esc(x.fa ?? '—')}</td></tr>
      <tr><td>SA /୫୦</td><td>${esc(x.sa ?? '—')}</td></tr>
      <tr class="tot"><td>ଟର୍ମ ମୋଟ /୧୦୦</td><td><b>${esc(x.termTotal ?? '—')}</b></td></tr></table></div>`
  }
  return `<!doctype html><html><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Baloo+Bhaina+2:wght@700;800&family=Noto+Sans+Oriya:wght@400;600;700&display=swap" rel="stylesheet">
  <style>@page{size:A4;margin:12mm}*{box-sizing:border-box}
  body{font-family:'Noto Sans Oriya','Baloo Bhaina 2',sans-serif;color:#1f2937;font-size:12px;margin:0}
  .hd{border:2px solid ${C.indigo};border-radius:12px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center}
  .hd .t{font-family:'Baloo Bhaina 2';color:${C.indigo};font-size:18px;font-weight:800}
  .meta{margin:10px 0;font-size:12.5px}.meta b{color:${C.indigo}}
  .terms{display:flex;gap:10px}.tcard{flex:1;border:1px solid #d9d4ec;border-radius:10px;padding:8px 10px}
  .th{font-family:'Baloo Bhaina 2';font-weight:800;font-size:14px;margin-bottom:4px}
  table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #eee;padding:3px 2px;font-size:12px}
  td:last-child{text-align:right;width:70px}.sub td{color:${C.indigo}}.tot td{border-top:2px solid ${C.saffron};font-size:13px}
  .lv{font-size:14px;margin-top:6px}
  h3{font-family:'Baloo Bhaina 2';color:${C.sky};font-size:14px;margin:14px 0 4px}
  .pd{width:100%;border-collapse:collapse}.pd th,.pd td{border:1px solid #d9d4ec;padding:5px 7px;font-size:12px;text-align:left}
  .pd th{background:#eef2ff;color:${C.indigo}}
  .sign{display:flex;justify-content:space-between;margin-top:26px;font-size:12px}
  .sign div{border-top:1px solid #333;padding-top:3px;width:40%;text-align:center}
  .foot{margin-top:14px;text-align:center;color:#8a93a8;font-size:10.5px}
  </style></head><body>
  <div class="hd"><div class="t">ସାମଗ୍ରିକ ପ୍ରଗତି କାର୍ଡ (HPC) — ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ</div><div style="text-align:right;font-size:11px">${esc(meta.school || '')}</div></div>
  <div class="meta"><b>ନାମ:</b> ${esc(student.name)} &nbsp; <b>ରୋଲ୍:</b> ${esc(student.roll || '—')} &nbsp; <b>ଶ୍ରେଣୀ:</b> ${esc(meta.class)} &nbsp; <b>ବିଷୟ:</b> ${esc(meta.subject_printed || meta.subject_id)} &nbsp; <b>ସ୍ତର:</b> ${esc(fw.stage)}</div>
  <div class="terms">${termBlock(1, 'ଟର୍ମ ୧', C.sky)}${termBlock(2, 'ଟର୍ମ ୨', C.green)}</div>
  <h3>ଭାଗ D — ସାମାଜିକ-ଭାବପ୍ରବଣ ବିକାଶ (ସ୍ତର)</h3>
  <table class="pd"><tr><th>ଦକ୍ଷତା</th><th style="width:90px">ସ୍ତର</th><th>ଶିକ୍ଷକଙ୍କ ମନ୍ତବ୍ୟ</th></tr>
  ${partD.map(p => `<tr><td>${esc(p.label)}</td><td>${esc(p.level || '—')}</td><td>${esc(p.remark || '')}</td></tr>`).join('')}</table>
  <div class="sign"><div>ଶ୍ରେଣୀ ଶିକ୍ଷକ ${meta.teacherName ? '(' + esc(meta.teacherName) + ')' : ''}</div><div>ପ୍ରଧାନ ଶିକ୍ଷକ</div></div>
  <div class="foot">LessonGuru ଶିକ୍ଷକ ସହାୟକ — SCERT ମୂଲ୍ୟାୟନ ଢାଞ୍ଚା ୨୦୨୬-୨୭ ଅନୁଯାୟୀ · ଏହା ସରକାରୀ HPC ଫର୍ମ ନୁହେଁ</div>
  </body></html>`
}

// ----- exports -----
function rowsForExport(roster, gb) {
  const fw = gb.fw
  return (roster.students || []).map(s => {
    const mk = (t) => {
      const saved = gb.saved[`${s.id}|${t}`] || {}
      const sug = gb.suggest[s.id]?.[t] || {}
      const row = { written: saved.written ?? sug.written, project: saved.project ?? sug.project, diary: saved.diary, fa: saved.fa, sa: saved.sa, level: saved.level }
      return { ...row, ...computeRow(fw, row) }
    }
    return { student: s, t1: mk(1), t2: mk(2) }
  })
}

export async function buildGradebookExcel(roster, gb, meta) {
  const XLSX = await import('xlsx')
  const fw = gb.fw
  const rows = rowsForExport(roster, gb)
  const header = fw.marks
    ? ['Roll', 'Name',
       'T1 Written/' + fw.written, 'T1 Project/' + fw.project, ...(fw.diary ? ['T1 Diary/' + fw.diary] : []), 'T1 TObs/25', 'T1 FA/25', 'T1 SA/50', 'T1 Total/100',
       'T2 Written/' + fw.written, 'T2 Project/' + fw.project, ...(fw.diary ? ['T2 Diary/' + fw.diary] : []), 'T2 TObs/25', 'T2 FA/25', 'T2 SA/50', 'T2 Total/100']
    : ['Roll', 'Name', 'T1 Level', 'T2 Level']
  const data = rows.map(r => fw.marks
    ? [r.student.roll || '', r.student.name,
       r.t1.written ?? '', r.t1.project ?? '', ...(fw.diary ? [r.t1.diary ?? ''] : []), r.t1.teacherObs ?? '', r.t1.fa ?? '', r.t1.sa ?? '', r.t1.termTotal ?? '',
       r.t2.written ?? '', r.t2.project ?? '', ...(fw.diary ? [r.t2.diary ?? ''] : []), r.t2.teacherObs ?? '', r.t2.fa ?? '', r.t2.sa ?? '', r.t2.termTotal ?? '']
    : [r.student.roll || '', r.student.name, r.t1.level || '', r.t2.level || ''])
  const ws = XLSX.utils.aoa_to_sheet([
    [`HPC Teacher Observation — ${meta.title || ''}`],
    [`Class ${meta.class} · ${meta.subject_printed || meta.subject_id} · ${fw.stage}${meta.school ? ' · ' + meta.school : ''}`],
    [], header, ...data,
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'HPC R1-R7')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

export function gradebookPdfHtml(roster, gb, meta) {
  const fw = gb.fw
  const rows = rowsForExport(roster, gb)
  const C = { indigo: '#241a5e', sky: '#1577a8', green: '#1f7a46' }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const th = fw.marks
    ? `<th>Roll</th><th>ନାମ</th>
       <th>Written/${fw.written}</th><th>Project/${fw.project}</th>${fw.diary ? `<th>Diary/${fw.diary}</th>` : ''}<th>TObs/25</th><th>FA/25</th><th>SA/50</th><th>Total/100</th>`
    : `<th>Roll</th><th>ନାମ</th><th>Level</th>`
  const termTable = (t) => `<table><thead><tr>${th}</tr></thead><tbody>${rows.map(r => {
    const x = t === 1 ? r.t1 : r.t2
    return fw.marks
      ? `<tr><td>${esc(r.student.roll)}</td><td class="nm">${esc(r.student.name)}</td><td>${esc(x.written)}</td><td>${esc(x.project)}</td>${fw.diary ? `<td>${esc(x.diary)}</td>` : ''}<td><b>${esc(x.teacherObs)}</b></td><td>${esc(x.fa)}</td><td>${esc(x.sa)}</td><td><b>${esc(x.termTotal)}</b></td></tr>`
      : `<tr><td>${esc(r.student.roll)}</td><td class="nm">${esc(r.student.name)}</td><td>${esc(x.level)}</td></tr>`
  }).join('')}</tbody></table>`
  return `<!doctype html><html><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Baloo+Bhaina+2:wght@700;800&family=Noto+Sans+Oriya:wght@400;600;700&display=swap" rel="stylesheet">
  <style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}
  body{font-family:'Noto Sans Oriya','Baloo Bhaina 2',sans-serif;color:#1f2937;font-size:11px;margin:0}
  h1{font-family:'Baloo Bhaina 2';color:${C.indigo};font-size:20px;margin:0}
  .sub{color:#555;margin:2px 0 10px;font-size:12px}
  h2{font-family:'Baloo Bhaina 2';color:${C.sky};font-size:15px;margin:14px 0 4px}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:center}
  th{background:#eef2ff;color:${C.indigo};font-weight:700}
  td.nm{text-align:left}
  .foot{margin-top:14px;color:${C.indigo};font-weight:700;font-size:11px;display:flex;justify-content:space-between}
  </style></head><body>
  <h1>HPC — ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ ରେକର୍ଡ (R1–R7)</h1>
  <div class="sub">ଶ୍ରେଣୀ ${esc(meta.class)} · ${esc(meta.subject_printed || meta.subject_id)} · ${esc(fw.stage)}${meta.school ? ' · ' + esc(meta.school) : ''} · ${esc(roster.title || '')}</div>
  <h2>ଟର୍ମ ୧ · Term 1</h2>${termTable(1)}
  <h2>ଟର୍ମ ୨ · Term 2</h2>${termTable(2)}
  <div class="foot"><span>LessonGuruOdisha.com</span><span>${esc(meta.teacherName || '')}</span></div>
  </body></html>`
}
