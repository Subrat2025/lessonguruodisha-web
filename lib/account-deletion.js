// ============================================================================
//  Account deletion (Google Play "account deletion" requirement).
//
//  A teacher requests deletion in the app or at /delete-account. The request is
//  recorded in `accountDeletionRequests` and the teacher is signed out
//  everywhere. An admin processes it (Admin → 🗑️ Account Deletions), which:
//    • deletes the teacher's Cloud Library files (bytes + metadata)
//    • anonymises the user document — name, mobile, email, school, password and
//      profile fields are removed, login is disabled — while keeping the user id,
//      so payment / order records required for tax law still reference a row.
//  Requests not processed within 30 days show as overdue in the admin list.
// ============================================================================
import { v4 as uuidv4 } from 'uuid'
import * as Cloud from '@/lib/cloud-files'

export const REQUESTS = 'accountDeletionRequests'
export const SLA_DAYS = 30

// Personal fields removed on processing. Anything else on the user document that is
// personal data should be added here.
const PII_FIELDS = ['name', 'email', 'school', 'district', 'block', 'designation', 'photo', 'avatar',
  'password', 'securityImageId', 'favorites', 'dhSchool', 'udise', 'address', 'whatsapp']

export class DeletionError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status }
}

export function publicRequest(r) {
  if (!r) return null
  const due = new Date(new Date(r.requestedAt).getTime() + SLA_DAYS * 864e5)
  return {
    id: r.id, userId: r.userId, name: r.name, mobile: r.mobile, reason: r.reason || '',
    status: r.status, requestedAt: r.requestedAt, processedAt: r.processedAt || null,
    processedBy: r.processedBy || null, cancelledAt: r.cancelledAt || null,
    dueAt: due, overdue: r.status === 'pending' && due < new Date(),
    result: r.result || null,
  }
}

export async function getOpenRequest(d, userId) {
  return d.collection(REQUESTS).findOne({ userId, status: 'pending' })
}

export async function requestDeletion(d, me, { reason } = {}) {
  if (me.role === 'admin') throw new DeletionError('ADMIN_ACCOUNT', 'Admin accounts cannot be deleted from here. Remove the admin role first.', 403)
  const existing = await getOpenRequest(d, me.id)
  if (existing) return { request: publicRequest(existing), existing: true }
  const req = {
    id: uuidv4(), userId: me.id, name: me.name || '', mobile: me.mobile || '',
    reason: typeof reason === 'string' ? reason.trim().slice(0, 500) : '',
    status: 'pending', requestedAt: new Date(),
  }
  await d.collection(REQUESTS).insertOne(req)
  // sign the teacher out on every device (same mechanism as single-device login)
  await d.collection('users').updateOne({ id: me.id }, { $set: { activeSessionId: 'deletion-requested-' + req.id, deletionRequestedAt: req.requestedAt } })
  return { request: publicRequest(req), existing: false }
}

export async function listRequests(d, { status } = {}) {
  const filter = ['pending', 'processed', 'cancelled'].includes(status) ? { status } : {}
  const rows = await d.collection(REQUESTS).find(filter).sort({ requestedAt: -1 }).limit(500).toArray()
  const counts = {}
  for (const s of ['pending', 'processed', 'cancelled']) counts[s] = await d.collection(REQUESTS).countDocuments({ status: s })
  return { requests: rows.map(publicRequest), counts }
}

export async function cancelRequest(d, admin, id) {
  const r = await d.collection(REQUESTS).findOne({ id })
  if (!r) throw new DeletionError('NOT_FOUND', 'Request not found', 404)
  if (r.status !== 'pending') throw new DeletionError('NOT_PENDING', 'Only pending requests can be cancelled', 409)
  await d.collection(REQUESTS).updateOne({ id }, { $set: { status: 'cancelled', cancelledAt: new Date(), processedBy: admin.id } })
  await d.collection('users').updateOne({ id: r.userId }, { $set: { deletionRequestedAt: null } })
  return publicRequest({ ...r, status: 'cancelled', cancelledAt: new Date(), processedBy: admin.id })
}

export async function processRequest(d, admin, id) {
  const r = await d.collection(REQUESTS).findOne({ id })
  if (!r) throw new DeletionError('NOT_FOUND', 'Request not found', 404)
  if (r.status !== 'pending') throw new DeletionError('NOT_PENDING', 'This request was already ' + r.status, 409)
  const user = await d.collection('users').findOne({ id: r.userId })

  // 1) Cloud Library files
  let filesDeleted = 0, bytesDeleted = 0
  if (user) {
    const files = await d.collection(Cloud.FILES).find({ userId: user.id }).toArray()
    for (const f of files) {
      const res = await Cloud.deleteFile(d, user, f.id)
      filesDeleted++
      bytesDeleted += res.bytes || 0
    }
  }

  // 2) anonymise the account (keep the id so legally-retained payment records still resolve)
  if (user) {
    const set = {
      name: 'Deleted user', mobile: 'deleted-' + user.id, deleted: true, deletedAt: new Date(),
      suspended: true, activeSessionId: 'deleted-' + uuidv4(), role: 'deleted',
    }
    const unset = {}
    for (const k of PII_FIELDS) if (k in user && !(k in set)) unset[k] = '' // a path can't be both $set and $unset
    await d.collection('users').updateOne({ id: user.id }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) })
  }

  const result = { filesDeleted, bytesDeleted, userFound: !!user }
  await d.collection(REQUESTS).updateOne({ id }, {
    $set: { status: 'processed', processedAt: new Date(), processedBy: admin.id, result, name: 'Deleted user', mobile: '' },
  })
  return publicRequest({ ...r, status: 'processed', processedAt: new Date(), processedBy: admin.id, result, name: 'Deleted user', mobile: '' })
}

export function errorBody(e) {
  if (e instanceof DeletionError || e instanceof Cloud.CloudError) return { status: e.status, body: { error: e.message, code: e.code } }
  console.error('[account-deletion] unexpected error:', e?.stack || e?.message || e)
  return { status: 500, body: { error: 'Something went wrong. Please try again.', code: 'SERVER_ERROR' } }
}

export async function requireAdmin(request, d) {
  const me = await Cloud.resolveUser(request, d)
  if (me.role !== 'admin') throw new DeletionError('FORBIDDEN', 'Admins only', 403)
  return me
}
