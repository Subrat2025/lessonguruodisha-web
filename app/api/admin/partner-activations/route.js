// Admin: Partner Activations list + CSV export + kill-switch toggle.
//   GET  /api/admin/partner-activations            → { enabled, activations }
//   GET  /api/admin/partner-activations?format=csv  → CSV download
//   PUT  /api/admin/partner-activations  { enabled } → toggle kill switch
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'
import { getPartnerSettings, setPartnerEnabled, listActivations, toCsv } from '@/lib/partner-grant'

export const dynamic = 'force-dynamic'
const json = (b, init) => NextResponse.json(b, init)

function guard(request) {
  const payload = getUser(request)
  if (!payload) return { err: json({ error: 'Unauthorized' }, { status: 401 }) }
  if (payload.role !== 'admin') return { err: json({ error: 'Admin only' }, { status: 403 }) }
  return { payload }
}

export async function GET(request) {
  const { err } = guard(request); if (err) return err
  try {
    const d = await getDb()
    const settings = await getPartnerSettings(d)
    const rows = await listActivations(d, { limit: 500 })
    const format = new URL(request.url).searchParams.get('format')
    if (format === 'csv') {
      return new NextResponse(toCsv(rows), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="partner-activations-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }
    return json({ ok: true, enabled: settings.enabled, count: rows.length, activations: rows })
  } catch (e) {
    console.error('[admin/partner-activations GET] failed:', e?.message)
    return json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PUT(request) {
  const { err, payload } = guard(request); if (err) return err
  try {
    const d = await getDb()
    const body = await request.json().catch(() => ({}))
    const next = await setPartnerEnabled(d, body?.enabled === true, payload.id)
    return json({ ok: true, ...next })
  } catch (e) {
    console.error('[admin/partner-activations PUT] failed:', e?.message)
    return json({ error: 'Failed' }, { status: 500 })
  }
}
