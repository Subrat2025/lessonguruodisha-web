// Admin: unlink a Toolkit-linked account.
//   POST /api/admin/sso-toolkit/unlink  { userId } -> sets toolkitLinked=false
// The next Toolkit tap for that account will require OTP confirmation again.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'
import { setToolkitLinked, audit } from '@/lib/sso-toolkit'

export const dynamic = 'force-dynamic'
const json = (b, init) => NextResponse.json(b, init)

export async function POST(request) {
  const payload = getUser(request)
  if (!payload) return json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'admin') return json({ error: 'Admin only' }, { status: 403 })
  try {
    const d = await getDb()
    const body = await request.json().catch(() => ({}))
    const userId = String(body?.userId || '').trim()
    if (!userId) return json({ error: 'userId required' }, { status: 400 })
    const user = await d.collection('users').findOne({ id: userId })
    if (!user) return json({ error: 'User not found' }, { status: 404 })
    await setToolkitLinked(d, userId, false)
    await audit(d, { result: 'unlinked', phoneLast4: String(user.mobile || '').slice(-4) })
    return json({ ok: true })
  } catch (e) {
    console.error('[admin/sso-toolkit/unlink] failed:', e?.message)
    return json({ error: 'Failed' }, { status: 500 })
  }
}
