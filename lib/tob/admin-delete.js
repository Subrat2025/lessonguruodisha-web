// === TOB === Admin Delete: safe two-step Trash → Permanent, with teacher-record
// protection, audit log, super-admin gate and 30-day auto-purge. New collections
// only: tobStubs (readable remnants), tobAuditLog. Touches only tob* + Cloudinary.
import { v4 as uuidv4 } from 'uuid'
import { TOB_COLL } from '@/lib/tob/store.js'
import { deleteAnyFile } from '@/lib/store/storage.js'

export const STUBS = 'tobStubs'
export const AUDIT = 'tobAuditLog'
const TRASH_DAYS = 30
const SUPER_MOBILES = ['9692604577']

export const isAdmin = (me) => me?.role === 'admin'
export const isSuperAdmin = (me) => !!me && (me.superAdmin === true || SUPER_MOBILES.includes(String(me.mobile || '')))

async function writeAudit(db, me, { action, items = [], scope = '', recordsKept = 0, extra = {} }) {
  try {
    await db.collection(AUDIT).insertOne({
      id: uuidv4(), at: new Date(), actorId: me?.id || null, actorName: me?.name || '', actorMobile: me?.mobile || '',
      action, scope, recordsKept, items: items.map(i => ({ id: i.id, title: i.title, type: i.type, class: i.class, subject_id: i.subject_id, chapterNo: i.chapterNo, setCode: i.setCode })), ...extra,
    })
  } catch (e) { console.error('[tob audit]', e?.message) }
}

// Public audit helper (publish/unpublish/import-publish are logged from route.js).
export async function logAudit(db, me, action, extra = {}) {
  try { await writeAudit(db, me, { action, scope: extra.scope || '', items: extra.items || [], recordsKept: extra.recordsKept || 0, extra }) } catch (_) {}
}

// ---- de-duplicate a course: keep NEWEST per type+chapter/set+term ----
export async function dedupePreview(db, { class: cls, subject }) {
  const items = await db.collection(TOB_COLL.items).find({ class: String(cls), subject_id: String(subject).toUpperCase(), status: { $ne: 'trashed' } }).toArray()
  const groups = {}
  for (const it of items) {
    const key = it.type === 'register' ? 'register' : it.type === 'set' ? `set:${it.setCode}:${it.term}` : `chapter:${it.chapterNo}:${it.term}`
    ;(groups[key] ||= []).push(it)
  }
  const duplicates = []
  for (const arr of Object.values(groups)) {
    if (arr.length <= 1) continue
    arr.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    for (const old of arr.slice(1)) duplicates.push({ id: old.id, title: old.title, type: old.type, chapterNo: old.chapterNo, setCode: old.setCode, term: old.term, status: old.status, keepId: arr[0].id })
  }
  return { class: String(cls), subject: String(subject).toUpperCase(), total: items.length, unique: Object.keys(groups).length, duplicates }
}
export async function dedupeApply(db, me, { class: cls, subject }) {
  const pre = await dedupePreview(db, { class: cls, subject })
  const ids = pre.duplicates.map(d => d.id)
  if (!ids.length) return { ok: true, trashed: 0, ids: [] }
  const r = await trashItems(db, me, ids)
  await writeAudit(db, me, { action: 'dedupe', scope: `Class ${cls} ${String(subject).toUpperCase()}`, extra: { trashed: ids.length } })
  return { ok: true, trashed: r.trashed, ids }
}

async function fetchItems(db, ids) { return db.collection(TOB_COLL.items).find({ id: { $in: ids } }).toArray() }

// How many teachers / records reference these items (so admin can be warned).
async function recordsImpact(db, itemIds) {
  if (!itemIds.length) return { records: 0, teachers: 0 }
  const recs = await db.collection('tobRecords').find({ itemId: { $in: itemIds } }).project({ teacherId: 1 }).toArray()
  return { records: recs.length, teachers: new Set(recs.map(r => r.teacherId)).size }
}

function daysLeft(trashedAt) { if (!trashedAt) return TRASH_DAYS; const gone = (Date.now() - new Date(trashedAt).getTime()) / 86400000; return Math.max(0, Math.ceil(TRASH_DAYS - gone)) }

// ---- impact preview (for the confirm dialog) ----
export async function deleteImpact(db, { ids, class: cls, subject_id, jobId }) {
  let items
  if (ids?.length) items = await fetchItems(db, ids)
  else if (jobId) items = await db.collection(TOB_COLL.items).find({ importJobId: jobId }).toArray()
  else items = await db.collection(TOB_COLL.items).find({ class: String(cls), subject_id: String(subject_id).toUpperCase() }).toArray()
  const itemIds = items.map(i => i.id)
  const impact = await recordsImpact(db, itemIds)
  return {
    count: items.length,
    items: items.map(i => ({ id: i.id, title: i.title, type: i.type, chapterNo: i.chapterNo, setCode: i.setCode, status: i.status, class: i.class, subject_id: i.subject_id })),
    class: items[0]?.class || cls, subject_id: items[0]?.subject_id || subject_id, subject_printed: items[0]?.subject_printed || '',
    published: items.filter(i => i.status === 'published').length,
    ...impact,
  }
}

// ---- Step 1: move to Trash (any admin) ----
export async function trashItems(db, me, ids) {
  const items = await fetchItems(db, ids)
  const now = new Date()
  for (const it of items) {
    if (it.status === 'trashed') continue
    await db.collection(TOB_COLL.items).updateOne({ id: it.id }, { $set: { status: 'trashed', trashedAt: now, prevStatus: it.status, trashedBy: me.id } })
  }
  const impact = await recordsImpact(db, ids)
  await writeAudit(db, me, { action: 'trash', items, recordsKept: impact.records })
  return { ok: true, trashed: items.length, recordsKept: impact.records }
}

export async function restoreItems(db, me, ids) {
  const items = await db.collection(TOB_COLL.items).find({ id: { $in: ids }, status: 'trashed' }).toArray()
  for (const it of items) await db.collection(TOB_COLL.items).updateOne({ id: it.id }, { $set: { status: it.prevStatus || 'draft' }, $unset: { trashedAt: '', prevStatus: '', trashedBy: '' } })
  await writeAudit(db, me, { action: 'restore', items })
  return { ok: true, restored: items.length }
}

// ---- Step 2: permanent delete (super-admin). Keeps teacher records; stores a stub. ----
export async function permanentDelete(db, me, ids, { auto = false } = {}) {
  const items = await fetchItems(db, ids)
  let recordsKept = 0
  for (const it of items) {
    const impact = await recordsImpact(db, [it.id]); recordsKept += impact.records
    // readable stub so teachers' records still show titles
    await db.collection(STUBS).updateOne({ itemId: it.id }, { $set: {
      itemId: it.id, class: it.class, subject_id: it.subject_id, type: it.type, chapterNo: it.chapterNo || null, setCode: it.setCode || null,
      title: it.title, cards: (it.cards || []).map(c => ({ part: c.part, num: c.num, title: c.title })), removed: true, removedAt: new Date(),
    } }, { upsert: true })
    // Cloudinary files
    if (it.htmlRef) { try { await deleteAnyFile(it.htmlRef) } catch (_) {} }
    await db.collection(TOB_COLL.items).deleteOne({ id: it.id })
  }
  await writeAudit(db, me, { action: auto ? 'auto-purge' : 'permanent-delete', items, recordsKept })
  return { ok: true, deleted: items.length, recordsKept }
}

// ---- whole course / import job ----
export async function listCourseItemIds(db, { class: cls, subject_id }) {
  const items = await db.collection(TOB_COLL.items).find({ class: String(cls), subject_id: String(subject_id).toUpperCase() }).project({ id: 1 }).toArray()
  return items.map(i => i.id)
}
export async function listJobItemIds(db, jobId) {
  const items = await db.collection(TOB_COLL.items).find({ importJobId: jobId }).project({ id: 1 }).toArray()
  return items.map(i => i.id)
}

// ---- Trash listing ----
export async function listTrash(db) {
  const items = await db.collection(TOB_COLL.items).find({ status: 'trashed' }).sort({ trashedAt: -1 }).toArray()
  return items.map(i => ({ id: i.id, title: i.title, type: i.type, chapterNo: i.chapterNo, setCode: i.setCode, class: i.class, subject_id: i.subject_id, trashedAt: i.trashedAt, daysLeft: daysLeft(i.trashedAt) }))
}

// ---- auto-purge (cron) ----
export async function purgeExpired(db, me, { days = TRASH_DAYS } = {}) {
  const cutoff = new Date(Date.now() - days * 86400000)
  const due = await db.collection(TOB_COLL.items).find({ status: 'trashed', trashedAt: { $lte: cutoff } }).project({ id: 1 }).toArray()
  const ids = due.map(d => d.id)
  if (!ids.length) { await writeAudit(db, me || { name: 'cron' }, { action: 'auto-purge', items: [], scope: `days=${days}` }); return { ok: true, deleted: 0 } }
  return permanentDelete(db, me || { id: null, name: 'cron', mobile: '' }, ids, { auto: true })
}

export async function auditLog(db, limit = 60) {
  return db.collection(AUDIT).find({}).sort({ at: -1 }).limit(limit).project({ _id: 0 }).toArray()
}

// Validate the "type the course name" confirmation. Uses subject_id (matches
// the Items filter chip shown to the admin), NOT subject_printed — some older
// duplicate rows carry a wrong printed name (e.g. "ଓଡ଼ିଆ" on MATH items).
export function confirmNameFor({ class: cls, subject_id, subject_printed }) { return `Class ${cls} ${String(subject_id || subject_printed || '').toUpperCase()}` }

// ===================================================================
// Single dispatcher. route.js calls this in one marked block (admin-gated).
// ===================================================================
export async function handleRoutes({ db, method, path, segs, q, body, me }) {
  const forbid = { status: 403, data: { error: 'Forbidden' } }
  if (!path.startsWith('/tob/admin/trash') && !path.startsWith('/tob/admin/restore') && !path.startsWith('/tob/admin/purge') && !path.startsWith('/tob/admin/delete-impact') && !path.startsWith('/tob/admin/dedupe') && !path.startsWith('/tob/admin/course/delete') && !path.startsWith('/tob/admin/job/delete') && !path.startsWith('/tob/admin/audit') && !path.startsWith('/tob/admin/superadmin') && path !== '/tob/cron/purge-trash') return null

  // cron (no user) — ack fast
  if (path === '/tob/cron/purge-trash' && method === 'POST') { const r = await purgeExpired(db, null, { days: TRASH_DAYS }); return { status: 200, data: { ok: true, ...r } } }

  if (!isAdmin(me)) return forbid
  const needSuper = () => { if (!isSuperAdmin(me)) return forbid; return null }

  if (path === '/tob/admin/delete-impact' && method === 'GET') { return { status: 200, data: await deleteImpact(db, { ids: q.ids ? q.ids.split(',') : null, class: q.class, subject_id: q.subject, jobId: q.jobId }) } }
  if (path === '/tob/admin/trash' && method === 'GET') { return { status: 200, data: { trash: await listTrash(db) } } }
  if (path === '/tob/admin/trash' && method === 'POST') { const ids = body?.ids || []; if (!ids.length) return { status: 400, data: { error: 'ids required' } }; return { status: 200, data: await trashItems(db, me, ids) } }
  if (path === '/tob/admin/restore' && method === 'POST') { const ids = body?.ids || []; return { status: 200, data: await restoreItems(db, me, ids) } }

  if (path === '/tob/admin/purge' && method === 'POST') { const s = needSuper(); if (s) return s; const ids = body?.ids || []; if (!ids.length) return { status: 400, data: { error: 'ids required' } }; return { status: 200, data: await permanentDelete(db, me, ids) } }
  if (path === '/tob/admin/purge-expired' && method === 'POST') { const s = needSuper(); if (s) return s; return { status: 200, data: await purgeExpired(db, me, { days: Number(body?.days ?? TRASH_DAYS) }) } }

  if (path === '/tob/admin/course/delete' && method === 'POST') {
    const s = needSuper(); if (s) return s
    const cls = body?.class, subj = String(body?.subject || '').toUpperCase()
    const expected = `Class ${cls} ${subj}`
    if (String(body?.confirmName || '').trim() !== expected) return { status: 400, data: { error: `Type "${expected}" to confirm.` } }
    const ids = await listCourseItemIds(db, { class: cls, subject_id: subj })
    return { status: 200, data: body?.mode === 'permanent' ? await permanentDelete(db, me, ids) : await trashItems(db, me, ids) }
  }
  if (path === '/tob/admin/dedupe-preview' && method === 'GET') { if (!q.class || !q.subject) return { status: 400, data: { error: 'class and subject required' } }; return { status: 200, data: await dedupePreview(db, { class: q.class, subject: q.subject }) } }
  if (path === '/tob/admin/dedupe' && method === 'POST') { if (!body?.class || !body?.subject) return { status: 400, data: { error: 'class and subject required' } }; return { status: 200, data: await dedupeApply(db, me, { class: body.class, subject: body.subject }) } }
  if (path === '/tob/admin/job/delete' && method === 'POST') {
    const ids = await listJobItemIds(db, body?.jobId)
    if (body?.mode === 'permanent') { const s = needSuper(); if (s) return s; return { status: 200, data: await permanentDelete(db, me, ids) } }
    return { status: 200, data: await trashItems(db, me, ids) }
  }

  if (path === '/tob/admin/audit' && method === 'GET') { return { status: 200, data: { log: await auditLog(db), isSuper: isSuperAdmin(me) } } }

  // super-admin settings — only a super-admin can grant/revoke the flag
  if (path === '/tob/admin/superadmin' && method === 'GET') { return { status: 200, data: { isSuper: isSuperAdmin(me), mobile: me?.mobile || '' } } }
  if (path === '/tob/admin/superadmin' && method === 'POST') { const s = needSuper(); if (s) return s; const mobile = String(body?.mobile || '').trim(); const flag = !!body?.flag; if (!mobile) return { status: 400, data: { error: 'mobile required' } }; await db.collection('users').updateOne({ mobile }, { $set: { superAdmin: flag } }); await writeAudit(db, me, { action: 'superadmin-set', scope: `${mobile}=${flag}` }); return { status: 200, data: { ok: true } } }

  return null
}
