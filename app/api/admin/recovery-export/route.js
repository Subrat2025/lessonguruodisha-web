// Dedicated route (kept out of the monolithic route.js). Admin-only.
// GET /api/admin/recovery-export?format=csv|xlsx&dateType=expiry|renewed|contacted
//     &from=YYYY-MM-DD&to=YYYY-MM-DD&bucket=&plan=&contact=&search=
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'
import { buildRecoveryRows, toCSV, toXLSX, logExportAudit } from '@/lib/recovery-export'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const payload = getUser(request)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const u = new URL(request.url)
  const q = Object.fromEntries(u.searchParams.entries())
  const format = (q.format === 'xlsx') ? 'xlsx' : 'csv'
  const params = {
    bucket: q.bucket || '', plan: q.plan || '', contact: q.contact || '', search: q.search || '',
    dateType: ['expiry', 'renewed', 'contacted'].includes(q.dateType) ? q.dateType : 'expiry',
    from: q.from || '', to: q.to || '',
  }

  try {
    const d = await getDb()
    const rows = await buildRecoveryRows(d, params)

    // audit (who, when, filters, row count)
    const admin = await d.collection('users').findOne({ id: payload.id }, { projection: { _id: 0, name: 1, mobile: 1 } })
    await logExportAudit(d, {
      adminId: payload.id, adminName: admin?.name || '', adminMobile: admin?.mobile || '',
      format, dateType: params.dateType, from: params.from, to: params.to,
      filters: { bucket: params.bucket, plan: params.plan, contact: params.contact, search: params.search },
      rowCount: rows.length,
    })

    const fnameFrom = params.from || 'all'
    const fnameTo = params.to || 'all'
    const filename = `recovery_${fnameFrom}_${fnameTo}.${format}`

    if (format === 'xlsx') {
      const buf = await toXLSX(rows, params)
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      })
    }
    const csv = toCSV(rows)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[recovery-export] failed:', e?.message || e)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
