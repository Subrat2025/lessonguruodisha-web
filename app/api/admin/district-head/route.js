// Admin: assign / remove a District Head (manual only, fully audited).
// Rule: one District Head per district. If the district already has one, we
// return 409 with the existing head unless { force:true } (then the previous
// head is demoted). Stores districtHead=true, district, districtHeadSince,
// dhRole='district_head' (NO admin access is granted by this role).
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'
import { isValidDistrict } from '@/lib/odisha-districts'
import { v4 as uuidv4 } from 'uuid'

export const dynamic = 'force-dynamic'
const mask = (m) => String(m || '').replace(/(\d{2})\d{4}(\d{2,})/, '$1****$2')

export async function POST(request) {
  const payload = getUser(request)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  try {
    const d = await getDb()
    const body = await request.json().catch(() => ({}))
    const { userId, action } = body
    const district = String(body.district || '').trim()
    if (!userId || !['assign', 'remove'].includes(action)) return NextResponse.json({ error: 'bad-request' }, { status: 400 })
    const admin = await d.collection('users').findOne({ id: payload.id }, { projection: { _id: 0, name: 1 } })
    const target = await d.collection('users').findOne({ id: userId }, { projection: { _id: 0, id: 1, name: 1, mobile: 1 } })
    if (!target) return NextResponse.json({ error: 'user-not-found' }, { status: 404 })
    const now = new Date()

    if (action === 'remove') {
      await d.collection('users').updateOne({ id: userId }, { $set: { districtHead: false, districtHeadSince: null }, $unset: { dhRole: '' } })
      await d.collection('district_head_audit').insertOne({ id: uuidv4(), event: 'remove', userId, by: payload.id, byName: admin?.name || '', at: now })
      return NextResponse.json({ ok: true, action: 'remove' })
    }

    // assign
    if (!isValidDistrict(district)) return NextResponse.json({ error: 'invalid-district' }, { status: 400 })
    const existing = await d.collection('users').findOne(
      { districtHead: true, district, id: { $ne: userId } },
      { projection: { _id: 0, id: 1, name: 1, mobile: 1 } },
    )
    if (existing && !body.force) {
      return NextResponse.json({
        error: 'district-occupied',
        warning: `${district} already has a District Head: ${existing.name || mask(existing.mobile)}. Pass force to replace.`,
        existing: { name: existing.name || '', mobileMasked: mask(existing.mobile) },
      }, { status: 409 })
    }
    if (existing && body.force) {
      await d.collection('users').updateOne({ id: existing.id }, { $set: { districtHead: false, districtHeadSince: null }, $unset: { dhRole: '' } })
      await d.collection('district_head_audit').insertOne({ id: uuidv4(), event: 'auto-remove-on-replace', userId: existing.id, district, by: payload.id, byName: admin?.name || '', at: now })
    }
    await d.collection('users').updateOne({ id: userId }, { $set: { districtHead: true, district, districtHeadSince: now, dhRole: 'district_head' } })
    await d.collection('district_head_audit').insertOne({ id: uuidv4(), event: 'assign', userId, district, by: payload.id, byName: admin?.name || '', at: now })
    return NextResponse.json({ ok: true, action: 'assign', district })
  } catch (e) {
    console.error('[admin/district-head] failed:', e?.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
