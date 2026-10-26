// Logged-in District Head: get own status + set public-display consent / school.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const payload = getUser(request)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const d = await getDb()
  const u = await d.collection('users').findOne({ id: payload.id }, { projection: { _id: 0, districtHead: 1, district: 1, districtHeadSince: 1, dhConsent: 1, dhSchool: 1, dhRole: 1 } })
  return NextResponse.json({
    isDistrictHead: !!u?.districtHead,
    district: u?.district || null,
    since: u?.districtHeadSince || null,
    consent: !!u?.dhConsent,
    school: u?.dhSchool || '',
    role: u?.dhRole || null,
  })
}

export async function POST(request) {
  const payload = getUser(request)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const d = await getDb()
    const me = await d.collection('users').findOne({ id: payload.id }, { projection: { _id: 0, districtHead: 1 } })
    if (!me?.districtHead) return NextResponse.json({ error: 'not-a-district-head' }, { status: 403 })
    const body = await request.json().catch(() => ({}))
    const set = {}
    if (typeof body.consent === 'boolean') set.dhConsent = body.consent
    if (typeof body.school === 'string') set.dhSchool = body.school.slice(0, 120)
    if (!Object.keys(set).length) return NextResponse.json({ error: 'nothing-to-update' }, { status: 400 })
    await d.collection('users').updateOne({ id: payload.id }, { $set: set })
    return NextResponse.json({ ok: true, ...set })
  } catch (e) {
    console.error('[me/district-head-consent] failed:', e?.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
