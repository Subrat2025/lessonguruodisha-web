// PUBLIC: all 30 districts with their District Head (ONLY if the head gave
// consent). Never returns phone, email or referral counts. A district with a
// non-consenting head shows as 'assigned (private)'; an unassigned one is empty.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { ODISHA_DISTRICTS } from '@/lib/odisha-districts'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const d = await getDb()
    const heads = await d.collection('users')
      .find({ districtHead: true }, { projection: { _id: 0, district: 1, name: 1, dhConsent: 1, dhSchool: 1, dhPhoto: 1, districtHeadSince: 1 } })
      .toArray()
    const byDistrict = {}
    for (const h of heads) if (h.district) byDistrict[h.district] = h
    const list = ODISHA_DISTRICTS.map((district) => {
      const h = byDistrict[district]
      if (!h) return { district, status: 'empty' }
      if (!h.dhConsent) return { district, status: 'private' }
      return {
        district, status: 'filled',
        head: {
          name: h.name || 'Teacher',
          school: h.dhSchool || null,
          photo: h.dhPhoto || null,
          since: h.districtHeadSince || null,
        },
      }
    })
    return NextResponse.json({ districts: list, total: ODISHA_DISTRICTS.length })
  } catch (e) {
    console.error('[district-heads] failed:', e?.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
