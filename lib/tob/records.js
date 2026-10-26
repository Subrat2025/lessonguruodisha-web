// === TOB === Teacher Observation — "My Class Records": per-teacher class
// rosters + per-student task/project records (ticks, marks, remarks).
// NEW collections only (tobRosters, tobRecords). Private to the owning teacher.
// Children's names live here and are NEVER exposed in share images / OG.
import { v4 as uuidv4 } from 'uuid'

export const ROSTERS = 'tobRosters'
export const RECORDS = 'tobRecords'

export async function ensureRecordIndexes(db) {
  try {
    await db.collection(ROSTERS).createIndex({ id: 1 }, { unique: true })
    await db.collection(ROSTERS).createIndex({ teacherId: 1, class: 1, section: 1 })
    await db.collection(RECORDS).createIndex({ id: 1 }, { unique: true })
    await db.collection(RECORDS).createIndex({ teacherId: 1, itemId: 1, part: 1, term: 1, pos: 1, studentId: 1 }, { unique: true })
  } catch (_) {}
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()

// Parse a pasted / Excel-copied list into [{roll,name}]. Accepts lines like
// "1  Rahul", "1,Rahul", "Rahul" (tab/comma/multi-space separated).
export function parseStudentList(text) {
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = clean(raw)
    if (!line) continue
    const parts = raw.split(/\t|,|\s{2,}/).map(x => clean(x)).filter(Boolean)
    let roll = '', name = ''
    if (parts.length >= 2 && /^\d+$/.test(parts[0])) { roll = parts[0]; name = parts.slice(1).join(' ') }
    else name = parts.join(' ')
    if (name) out.push({ id: uuidv4(), roll, name })
  }
  return out.slice(0, 120)
}

// -------- Rosters --------
export async function listRosters(db, teacherId, { class: cls } = {}) {
  const m = { teacherId }
  if (cls) m.class = String(cls)
  return db.collection(ROSTERS).find(m).sort({ class: 1, section: 1, updatedAt: -1 }).project({ _id: 0 }).toArray()
}
export async function getRoster(db, teacherId, id) {
  return db.collection(ROSTERS).findOne({ id, teacherId }, { projection: { _id: 0 } })
}
export async function saveRoster(db, teacherId, { id, class: cls, section, title, students }) {
  const now = new Date()
  const list = Array.isArray(students) ? students.map(s => ({ id: s.id || uuidv4(), roll: clean(s.roll), name: clean(s.name) })).filter(s => s.name).slice(0, 120) : []
  if (id) {
    const existing = await db.collection(ROSTERS).findOne({ id, teacherId })
    if (!existing) return { ok: false, error: 'not found' }
    await db.collection(ROSTERS).updateOne({ id, teacherId }, { $set: { class: String(cls || existing.class), section: clean(section) || existing.section, title: clean(title) || existing.title, students: list, updatedAt: now } })
    return { ok: true, id }
  }
  const doc = { id: uuidv4(), teacherId, class: String(cls || ''), section: clean(section) || 'A', title: clean(title) || `ଶ୍ରେଣୀ ${cls || ''}`, students: list, createdAt: now, updatedAt: now }
  await db.collection(ROSTERS).insertOne(doc)
  return { ok: true, id: doc.id }
}
export async function deleteRoster(db, teacherId, id) {
  const r = await db.collection(ROSTERS).deleteOne({ id, teacherId })
  // also remove this teacher's records + gradebook rows tied to this roster
  await db.collection(RECORDS).deleteMany({ teacherId, rosterId: id })
  await db.collection('tobGradebook').deleteMany({ teacherId, rosterId: id })
  return { ok: r.deletedCount > 0 }
}

// -------- Records (per student per task/project) --------
function recKey(teacherId, { itemId, part, term, pos, studentId }) {
  return { teacherId, itemId, part, term: Number(term), pos: Number(pos), studentId }
}
export async function getRecord(db, teacherId, q) {
  return db.collection(RECORDS).findOne(recKey(teacherId, q), { projection: { _id: 0 } })
}
// All records for one task across a roster (for per-student view + summaries).
export async function recordsForTask(db, teacherId, { itemId, part, term, pos }) {
  return db.collection(RECORDS).find({ teacherId, itemId, part, term: Number(term), pos: Number(pos) }).project({ _id: 0 }).toArray()
}
// All records for a whole class+subject (for the gradebook summary later).
export async function recordsForCourse(db, teacherId, { class: cls, subject_id }) {
  return db.collection(RECORDS).find({ teacherId, class: String(cls), subject_id: String(subject_id).toUpperCase() }).project({ _id: 0 }).toArray()
}
export async function saveRecord(db, teacherId, body) {
  const { itemId, part, term, pos, studentId, rosterId, class: cls, subject_id } = body || {}
  if (!itemId || !part || !studentId) return { ok: false, error: 'itemId, part, studentId required' }
  const ticks = body.ticks && typeof body.ticks === 'object' ? body.ticks : {}
  const marks = body.marks === '' || body.marks == null ? null : Number(body.marks)
  const remarks = clean(body.remarks).slice(0, 500)
  const now = new Date()
  await db.collection(RECORDS).updateOne(
    recKey(teacherId, { itemId, part, term, pos, studentId }),
    { $set: { rosterId: rosterId || null, class: String(cls || ''), subject_id: String(subject_id || '').toUpperCase(), ticks, marks, remarks, updatedAt: now }, $setOnInsert: { id: uuidv4(), createdAt: now } },
    { upsert: true }
  )
  return { ok: true }
}

// ===================================================================
// === TOB === Single dispatcher for all "My Class Records" + Gradebook
// HTTP routes. route.js keeps only one small marked block that calls this.
// Returns {status,data} (JSON) | {status,binary,contentType,filename} | null.
// ===================================================================
export async function handleRoutes({ db, method, path, segs, q, body, me }) {
  const G = await import('@/lib/tob/gradebook.js')
  const mapPart = (p) => (p === 'project' ? 'B' : 'A')
  const noAuth = { status: 401, data: { error: 'Login required', code: 'LOGIN_REQUIRED' } }

  // ---- rosters ----
  if (path === '/tob/rosters' && method === 'GET') { if (!me) return noAuth; return { status: 200, data: { rosters: await listRosters(db, me.id, { class: q.class }) } } }
  if (path === '/tob/rosters' && method === 'POST') {
    if (!me) return noAuth; await ensureRecordIndexes(db)
    let students = Array.isArray(body?.students) ? body.students : null
    if (!students && body?.paste) students = parseStudentList(body.paste)
    return { status: 200, data: await saveRoster(db, me.id, { id: body?.id, class: body?.class, section: body?.section, title: body?.title, students: students || [] }) }
  }
  if (segs[1] === 'rosters' && segs[2] && segs[2] !== 'export' && method === 'GET') { if (!me) return noAuth; const r = await getRoster(db, me.id, segs[2]); return r ? { status: 200, data: { roster: r } } : { status: 404, data: { error: 'Not found' } } }
  if (segs[1] === 'rosters' && segs[2] && method === 'DELETE') { if (!me) return noAuth; return { status: 200, data: await deleteRoster(db, me.id, segs[2]) } }

  // ---- records ----
  if (path === '/tob/records' && method === 'GET') {
    if (!me) return noAuth
    if (q.studentId) return { status: 200, data: { record: await getRecord(db, me.id, { itemId: q.itemId, part: mapPart(q.part), term: q.term, pos: q.num, studentId: q.studentId }) } }
    return { status: 200, data: { records: await recordsForTask(db, me.id, { itemId: q.itemId, part: mapPart(q.part), term: q.term, pos: q.num }) } }
  }
  if (path === '/tob/records' && method === 'POST') { if (!me) return noAuth; await ensureRecordIndexes(db); return { status: 200, data: await saveRecord(db, me.id, { ...body, part: mapPart(body?.part) }) } }

  // ---- profile (school name for share images) ----
  if (path === '/tob/profile' && method === 'POST') { if (!me) return noAuth; const school = String(body?.school || '').trim().slice(0, 120); await db.collection('users').updateOne({ id: me.id }, { $set: { school } }); return { status: 200, data: { ok: true, school } } }

  // ---- gradebook (HPC) ----
  if (path === '/tob/gradebook' && method === 'GET') { if (!me) return noAuth; if (!q.rosterId || !q.subject) return { status: 400, data: { error: 'rosterId and subject required' } }; const roster = await getRoster(db, me.id, q.rosterId); if (!roster) return { status: 404, data: { error: 'Roster not found' } }; const gb = await G.getGradebook(db, me.id, { rosterId: q.rosterId, subject_id: q.subject, class: roster.class }); return { status: 200, data: { roster, ...gb } } }
  if (path === '/tob/gradebook' && method === 'POST') { if (!me) return noAuth; await G.ensureGbIndexes(db); return { status: 200, data: await G.saveGradebook(db, me.id, body) } }
  if (path === '/tob/gradebook/card' && method === 'GET') {
    if (!me) return noAuth
    const roster = await getRoster(db, me.id, q.rosterId); if (!roster) return { status: 404, data: { error: 'Roster not found' } }
    const student = (roster.students || []).find(s => s.id === q.studentId); if (!student) return { status: 404, data: { error: 'Student not found' } }
    const gb = await G.getGradebook(db, me.id, { rosterId: q.rosterId, subject_id: q.subject, class: roster.class })
    const any = await db.collection('tobItems').findOne({ class: String(roster.class), subject_id: String(q.subject).toUpperCase() }, { projection: { subject_printed: 1 } })
    const meta = { class: roster.class, subject_id: q.subject, subject_printed: any?.subject_printed, teacherName: me.name || '', school: me.school || '' }
    const { renderHtmlToPdf } = await import('@/lib/lesson-plan-security.js')
    const buf = await renderHtmlToPdf(G.hpcCardHtml(student, gb, meta), { orientation: 'portrait', margin: '10mm' })
    return { status: 200, binary: buf, contentType: 'application/pdf', filename: `HPC-${(student.name || 'student').replace(/\s+/g, '_')}.pdf` }
  }
  if (path === '/tob/gradebook/export' && method === 'GET') {
    if (!me) return noAuth
    const roster = await getRoster(db, me.id, q.rosterId); if (!roster) return { status: 404, data: { error: 'Roster not found' } }
    const gb = await G.getGradebook(db, me.id, { rosterId: q.rosterId, subject_id: q.subject, class: roster.class })
    const any = await db.collection('tobItems').findOne({ class: String(roster.class), subject_id: String(q.subject).toUpperCase() }, { projection: { subject_printed: 1 } })
    const meta = { class: roster.class, subject_id: q.subject, subject_printed: any?.subject_printed, title: roster.title, teacherName: me.name || '', school: me.school || '' }
    if (q.format === 'xlsx') { const buf = await G.buildGradebookExcel(roster, gb, meta); return { status: 200, binary: buf, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `HPC-Class${roster.class}-${q.subject}.xlsx` } }
    const { renderHtmlToPdf } = await import('@/lib/lesson-plan-security.js')
    const buf = await renderHtmlToPdf(G.gradebookPdfHtml(roster, gb, meta), { orientation: 'landscape', margin: '8mm' })
    return { status: 200, binary: buf, contentType: 'application/pdf', filename: `HPC-Class${roster.class}-${q.subject}.pdf` }
  }
  return null
}
