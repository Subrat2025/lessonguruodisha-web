// Logged-in user's OWN milestone count (new rule: ever-paid, anti-fraud).
// Returns only the caller's own count + target. No other users' data.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'
import { getMilestoneConfig, computeMilestoneReferrals } from '@/lib/referral-milestone'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const payload = getUser(request)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const d = await getDb()
    const me = await d.collection('users').findOne({ id: payload.id }, { projection: { _id: 0, id: 1, name: 1, mobile: 1, email: 1 } })
    const cfg = await getMilestoneConfig(d)
    const r = await computeMilestoneReferrals(d, me)
    return NextResponse.json({ count: r.count, target: cfg.target })
  } catch (e) {
    console.error('[referral/my-milestone] failed:', e?.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
