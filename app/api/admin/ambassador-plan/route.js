// Admin: read / update the Ambassador Renewal plan config (price, ON-OFF).
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'
import { getAmbassadorConfig, saveAmbassadorConfig } from '@/lib/ambassador-plan'

export const dynamic = 'force-dynamic'

function guard(request) {
  const payload = getUser(request)
  if (!payload) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (payload.role !== 'admin') return { err: NextResponse.json({ error: 'Admin only' }, { status: 403 }) }
  return { payload }
}

export async function GET(request) {
  const { err } = guard(request); if (err) return err
  try {
    const d = await getDb()
    const config = await getAmbassadorConfig(d)
    return NextResponse.json({ ok: true, config })
  } catch (e) {
    console.error('[admin/ambassador-plan GET] failed:', e?.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PUT(request) {
  const { err } = guard(request); if (err) return err
  try {
    const d = await getDb()
    const body = await request.json().catch(() => ({}))
    const config = await saveAmbassadorConfig(d, body || {})
    return NextResponse.json({ ok: true, config })
  } catch (e) {
    console.error('[admin/ambassador-plan PUT] failed:', e?.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
