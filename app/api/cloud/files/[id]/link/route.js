// Cloud Library — create a signed link to a file.
//   { purpose: 'open' }               15-minute link for viewers/download managers
//   { purpose: 'share', hours: 1-168 } link a teacher can send to colleagues (default 72h)
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import * as Cloud from '@/lib/cloud-files'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request, { params }) {
  try {
    const d = await getDb()
    const me = await Cloud.resolveUser(request, d)
    const { id } = await params
    const f = await Cloud.getOwnedFile(d, me, id)
    const body = await request.json().catch(() => ({}))
    const purpose = body.purpose === 'share' ? 'share' : 'open'
    const { token, expiresAt } = Cloud.signLink(f, { purpose, hours: body.hours })
    const fwdHost = request.headers.get('x-forwarded-host')
    const origin = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')
      || (fwdHost ? `${request.headers.get('x-forwarded-proto') || 'https'}://${fwdHost}` : new URL(request.url).origin)
    const url = `${origin}/api/cloud/files/${f.id}/download?t=${encodeURIComponent(token)}`
    return NextResponse.json({ url, expiresAt, purpose })
  } catch (e) {
    const { status, body } = Cloud.errorBody(e)
    return NextResponse.json(body, { status })
  }
}
