// POST /api/sso/link  { code }  (Authorization: Bearer <session from OTP login>)
//
// Final step of the "Confirm it's you" flow: the user has just completed a real
// OTP login for the handoff phone. We re-check that the authenticated account's
// phone matches the handoff phone (SAME phone) before flipping toolkitLinked=true.
// A DIFFERENT phone -> rejected, no link. Admin accounts are never linked.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'
import { normalizeIndianMobile } from '@/lib/partner-grant'
import { readHandoff, deleteHandoff, setToolkitLinked, audit, isAdminAccount, ensureSsoIndexes } from '@/lib/sso-toolkit'

export const dynamic = 'force-dynamic'
const json = (b, init) => NextResponse.json(b, init)

export async function POST(request) {
  try {
    const payload = getUser(request)
    if (!payload) return json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const code = String(body?.code || '').trim()
    if (!code) return json({ error: 'Missing code' }, { status: 400 })

    const d = await getDb()
    await ensureSsoIndexes(d)
    const handoff = await readHandoff(d, code, { kind: 'confirm' })
    if (!handoff) return json({ error: 'Link expired. Please tap again in Teacher Utility.' }, { status: 400 })

    const user = await d.collection('users').findOne({ id: payload.id })
    if (!user) return json({ error: 'Account not found' }, { status: 404 })

    if (isAdminAccount(user)) {
      await audit(d, { result: 'link_admin_blocked', phoneLast4: String(user.mobile || '').slice(-4) })
      return json({ error: 'Not allowed' }, { status: 403 })
    }

    const handoffPhone = normalizeIndianMobile(handoff.phone)
    const userPhone = normalizeIndianMobile(user.mobile)
    if (!handoffPhone || !userPhone || handoffPhone !== userPhone) {
      await audit(d, { result: 'link_mismatch', phoneLast4: String(userPhone || '').slice(-4) })
      return json({ error: 'This OTP is for a different number than the Teacher Utility link.' }, { status: 403 })
    }

    await setToolkitLinked(d, user.id, true)
    await deleteHandoff(d, code) // one-time
    await audit(d, { result: 'linked', phoneLast4: userPhone.slice(-4) })
    return json({ ok: true })
  } catch (e) {
    console.error('[sso/link] failed:', e?.message)
    return json({ error: 'Failed' }, { status: 500 })
  }
}
