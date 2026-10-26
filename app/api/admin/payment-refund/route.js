// Admin: mark a Premium payment as REFUNDED (reason required, audited, admin-only).
// A refunded payment no longer counts for referrals/milestones (everPaidPremium
// skips refunded:true), and the existing reward-reversal is applied for the
// referrer of the refunded teacher. Not reversible without a note (unrefund
// requires an explicit reason too and is logged).
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function guard(request) {
  const payload = getUser(request)
  if (!payload) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (payload.role !== 'admin') return { err: NextResponse.json({ error: 'Admin only' }, { status: 403 }) }
  return { payload }
}

async function findPayment(d, paymentId) {
  let doc = await d.collection('payments').findOne({ id: paymentId })
  if (doc) return { coll: 'payments', doc }
  doc = await d.collection('payments').findOne({ razorpay_order_id: paymentId })
  if (doc) return { coll: 'payments', doc }
  doc = await d.collection('qrSubscriptionPayments').findOne({ id: paymentId })
  if (doc) return { coll: 'qrSubscriptionPayments', doc }
  return null
}

export async function POST(request) {
  const { err, payload } = guard(request); if (err) return err
  try {
    const d = await getDb()
    const body = await request.json().catch(() => ({}))
    const paymentId = String(body?.paymentId || '').trim()
    const reason = String(body?.reason || '').trim()
    const unrefund = body?.unrefund === true
    if (!paymentId) return NextResponse.json({ error: 'paymentId required' }, { status: 400 })
    if (!reason) return NextResponse.json({ error: 'A reason is required' }, { status: 400 })

    const found = await findPayment(d, paymentId)
    if (!found) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    const { coll, doc } = found

    if (!unrefund && doc.refunded === true) {
      return NextResponse.json({ ok: true, already: true, message: 'Already marked refunded' })
    }
    if (unrefund && !doc.refunded) {
      return NextResponse.json({ ok: true, already: true, message: 'Payment is not refunded' })
    }

    const now = new Date()
    const set = unrefund
      ? { refunded: false, unrefundedAt: now, unrefundReason: reason, unrefundedBy: payload.id }
      : { refunded: true, refundedAt: now, refundReason: reason, refundedBy: payload.id }
    await d.collection(coll).updateOne({ id: doc.id }, { $set: set })

    await d.collection('admin_logs').insertOne({
      id: (await import('uuid')).v4(),
      type: unrefund ? 'payment_unrefunded' : 'payment_refunded',
      severity: 'warn',
      paymentId: doc.id, collection: coll,
      userId: doc.userId || null, amount: doc.amount || null,
      reason, adminId: payload.id, createdAt: now,
    }).catch(() => {})

    // Apply the existing reward reversal for the referrer of the refunded teacher.
    let reversal = null
    if (!unrefund && doc.userId) {
      try {
        const { reverseRewardsForLapsedReferral } = await import('@/lib/referral-engine.js')
        reversal = await reverseRewardsForLapsedReferral(d, doc.userId, {
          adminId: payload.id, reason: `payment-refunded: ${reason}`,
        })
      } catch (e) { console.error('[payment-refund] reversal failed:', e?.message) }
    }

    return NextResponse.json({ ok: true, refunded: !unrefund, paymentId: doc.id, reversal })
  } catch (e) {
    console.error('[admin/payment-refund POST] failed:', e?.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
