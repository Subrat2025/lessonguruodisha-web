// Admin: read / update the support WhatsApp number (digits only, country code
// included, e.g. 918093414633). Stored in settings key 'support_whatsapp_number'.
// Consumed publicly via GET /api/settings/public -> { supportWhatsapp }.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'
const DEFAULT = '918093414633'

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
    const doc = await d.collection('settings').findOne({ key: 'support_whatsapp_number' })
    const number = (typeof doc?.value === 'string' && doc.value.replace(/\D/g, '')) || DEFAULT
    return NextResponse.json({ number })
  } catch (e) {
    console.error('[admin/support-whatsapp GET] failed:', e?.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PUT(request) {
  const { err, payload } = guard(request); if (err) return err
  try {
    const d = await getDb()
    const body = await request.json().catch(() => ({}))
    const digits = String(body?.number || '').replace(/\D/g, '')
    // Expect a country-code + 10-digit Indian mobile (12 digits, e.g. 91XXXXXXXXXX).
    if (digits.length < 11 || digits.length > 15) {
      return NextResponse.json({ error: 'Enter a valid number with country code (e.g. 918093414633)' }, { status: 400 })
    }
    await d.collection('settings').updateOne(
      { key: 'support_whatsapp_number' },
      { $set: { key: 'support_whatsapp_number', value: digits, updatedAt: new Date(), updatedBy: payload.id } },
      { upsert: true },
    )
    return NextResponse.json({ ok: true, number: digits })
  } catch (e) {
    console.error('[admin/support-whatsapp PUT] failed:', e?.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
