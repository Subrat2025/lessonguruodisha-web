// Admin: mark a milestone reward given / undo (no auto payouts).
// Saves who + date + note, blocks double-mark, undo requires a reason, audited.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'
import { markMilestoneReward } from '@/lib/referral-milestone'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  const payload = getUser(request)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  try {
    const d = await getDb()
    const body = await request.json().catch(() => ({}))
    const admin = await d.collection('users').findOne({ id: payload.id }, { projection: { _id: 0, name: 1 } })
    const res = await markMilestoneReward(d, {
      userId: body.userId, reward: body.reward, action: body.action,
      note: body.note, reason: body.reason, adminId: payload.id, adminName: admin?.name || '',
    })
    if (!res.ok) {
      const code = res.error === 'already-given' || res.error === 'not-given' || res.error === 'reason-required' ? 409 : 400
      return NextResponse.json({ error: res.error }, { status: code })
    }
    return NextResponse.json({ ok: true, ...res })
  } catch (e) {
    console.error('[admin/referral-milestone/mark] failed:', e?.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
