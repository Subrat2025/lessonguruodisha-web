// Admin READ-ONLY: Switch-OFF preview. Shows exactly which one-time rewards
// would be granted the moment the Continuous ladder is flipped OFF (unified X
// count, grandfathered). Writes nothing. Admin-only.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'
import { computeSwitchOffPreview } from '@/lib/referral-engine'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const payload = getUser(request)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  try {
    const d = await getDb()
    const res = await Promise.race([
      computeSwitchOffPreview(d, {}),
      new Promise((_, rej) => setTimeout(() => rej(new Error('switch-off-preview-timeout')), 25000)),
    ])
    return NextResponse.json({ ok: true, ...res })
  } catch (e) {
    console.warn('[admin/switch-off-preview] failed:', e?.message)
    // Non-fatal: return ok:false so the admin card can show a retry hint.
    return NextResponse.json({ ok: false, error: 'Preview is taking too long on this data size. Please retry.' })
  }
}
