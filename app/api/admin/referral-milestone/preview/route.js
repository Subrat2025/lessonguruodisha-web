// Admin READ-ONLY milestone preview: top-20 referrers by the NEW all-time
// milestone count (X/target) with the OLD "premium" number for comparison.
// Pure read — no writes, no messages. Phone numbers are masked to last-4.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'
import { listMilestonePreview, listContinuousEarners, computeCountCheck } from '@/lib/referral-milestone'

export const dynamic = 'force-dynamic'
const withTimeout = (p, ms, fb) => Promise.race([p, new Promise(r => setTimeout(() => r(fb), ms))])

async function requireAdmin(request) {
  const payload = getUser(request)
  if (!payload) return { error: 'Unauthorized', status: 401 }
  if (payload.role !== 'admin') return { error: 'Admin only', status: 403 }
  return { payload }
}

export async function GET(request) {
  const a = await requireAdmin(request)
  if (a.error) return NextResponse.json({ error: a.error }, { status: a.status })
  try {
    const d = await getDb()
    const url = new URL(request.url)
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20))
    const data = await withTimeout(listMilestonePreview(d, { limit }), 25000, { ok: false, error: 'timeout' })
    const countCheck = await withTimeout(computeCountCheck(d, { topN: 5 }), 20000, null)
    const continuous = await withTimeout(listContinuousEarners(d, { limit: 50 }), 15000, { count: 0, earners: [] })
    return NextResponse.json({ ok: true, ...data, countCheck, continuous })
  } catch (e) {
    console.error('[admin/referral-milestone/preview GET] failed:', e?.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
