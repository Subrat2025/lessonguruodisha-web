// ─────────────────────────────────────────────────────────────────
//  AI Credit Admin Audit Log — immutable insert-only trail
// ─────────────────────────────────────────────────────────────────
//
//  Every administrative action that modifies a user's AI Credit wallet,
//  changes a plan, or issues a manual refund MUST call `writeAudit`.  The
//  helper only ever INSERTS.  There is no update/delete surface on the
//  aiCreditAuditLog collection — corrections must be recorded as new
//  reversal rows (e.g. BONUS_REVERSED).
//
//  This lives beside the normal credit transaction log
//  (`aiCreditTransactions`) — the two collections deliberately duplicate
//  a little data because they answer different questions:
//
//      aiCreditTransactions → the wallet's ledger (mutable state)
//      aiCreditAuditLog     → who did what, when (financial audit)
//
//  Consumers:
//    • POST /admin/ai-credits/bonus         → BONUS_GRANTED
//    • POST /admin/ai-credits/grant         → CREDIT_ADJUSTED
//    • POST /admin/ai-credits/bulk-bonus    → BULK_BONUS_GRANTED (per user)
//    • POST /admin/ai-credits/plans         → PLAN_CREATED / PLAN_UPDATED
//    • POST /admin/ai-credits/costs         → COST_UPDATED
//    • Internal refund flows (optional)     → CREDIT_REVERSAL
//
//  Never depend on this collection for the wallet's balance — always read
//  from `aiCreditWallet` for the current balance.

import { v4 as uuidv4 } from 'uuid'
import { getDb } from './mongodb.js'

export const AUDIT_COLL = 'aiCreditAuditLog'

// Canonical action types.  Keep in sync with the admin UI dropdown.
export const AUDIT_ACTIONS = Object.freeze({
  BONUS_GRANTED:       'BONUS_GRANTED',
  BONUS_REVERSED:      'BONUS_REVERSED',
  BULK_BONUS_GRANTED:  'BULK_BONUS_GRANTED',
  CREDIT_ADJUSTED:     'CREDIT_ADJUSTED',
  MANUAL_REFUND:       'MANUAL_REFUND',
  CREDIT_REVERSAL:     'CREDIT_REVERSAL',
  PLAN_CREATED:        'PLAN_CREATED',
  PLAN_UPDATED:        'PLAN_UPDATED',
  PLAN_DISABLED:       'PLAN_DISABLED',
  COST_UPDATED:        'COST_UPDATED',
})

/**
 * Insert one immutable audit row.  Returns the generated audit `_id`.
 *
 * Required fields:
 *   action, adminId
 *
 * Recommended fields (validated softly):
 *   adminName, adminMobile,
 *   userId, amount, previousBalance, newBalance,
 *   reason, referenceId, source, metadata
 */
export async function writeAudit({
  action,
  adminId,
  adminName = null,
  adminMobile = null,
  userId = null,
  amount = null,
  previousBalance = null,
  newBalance = null,
  previousValue = null,
  newValue = null,
  planId = null,
  planName = null,
  reason = null,
  referenceId = null,
  source = null,
  ipAddress = null,
  metadata = null,
} = {}) {
  if (!action || !AUDIT_ACTIONS[action]) {
    throw new Error(`[audit] unknown action: ${action}`)
  }
  if (!adminId) throw new Error('[audit] adminId required')

  const d = await getDb()
  const _id = uuidv4()
  const doc = {
    _id,
    action,
    adminId,
    adminName,
    adminMobile,
    userId,
    amount: amount == null ? null : Number(amount),
    previousBalance: previousBalance == null ? null : Number(previousBalance),
    newBalance: newBalance == null ? null : Number(newBalance),
    previousValue,
    newValue,
    planId,
    planName,
    reason: reason || null,
    referenceId,
    source: source || 'admin_ui',
    ipAddress,
    metadata: metadata || null,
    timestamp: new Date(),
  }
  await d.collection(AUDIT_COLL).insertOne(doc)
  return _id
}

/**
 * Paginated read of the audit log.  Filters are all optional.
 */
export async function listAudit({
  userId = null,
  adminId = null,
  action = null,
  since = null,
  until = null,
  limit = 50,
  offset = 0,
} = {}) {
  const d = await getDb()
  const q = {}
  if (userId)  q.userId = userId
  if (adminId) q.adminId = adminId
  if (action)  q.action = action
  if (since || until) {
    q.timestamp = {}
    if (since) q.timestamp.$gte = new Date(since)
    if (until) q.timestamp.$lte = new Date(until)
  }
  const cursor = d.collection(AUDIT_COLL).find(q).sort({ timestamp: -1 })
    .skip(Number(offset) || 0).limit(Math.min(500, Math.max(1, Number(limit) || 50)))
  const [items, total] = await Promise.all([cursor.toArray(), d.collection(AUDIT_COLL).countDocuments(q)])
  return { items, total }
}

/**
 * Ensure a MongoDB TTL / index policy exists.  Safe to call every startup.
 * We DON'T set a TTL — audit records are supposed to live forever — but we
 * do want fast lookups by userId/adminId/action/timestamp.
 */
export async function ensureAuditIndexes() {
  const d = await getDb()
  const c = d.collection(AUDIT_COLL)
  try {
    await c.createIndex({ timestamp: -1 })
    await c.createIndex({ userId: 1, timestamp: -1 })
    await c.createIndex({ adminId: 1, timestamp: -1 })
    await c.createIndex({ action: 1, timestamp: -1 })
  } catch { /* index might already exist — safe to ignore */ }
}
