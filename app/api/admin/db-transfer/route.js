// Admin only. Copy the whole database to a new MongoDB (moving hosts). The source is only read.
// GET  /api/admin/db-transfer  -> progress of the current/last copy
// POST /api/admin/db-transfer  { targetUrl, targetDb, password, confirm: 'COPY' } -> starts the copy
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser, verifyPassword } from '@/lib/auth'
import { startTransfer, transferState } from '@/lib/db-transfer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function admin(request, d) {
  const p = getUser(request)
  if (!p) throw Object.assign(new Error('Unauthorized'), { status: 401 })
  if (p.role !== 'admin') throw Object.assign(new Error('Admin only'), { status: 403 })
  const u = await d.collection('users').findOne({ id: p.id }, { projection: { _id: 0, id: 1, name: 1, mobile: 1, password: 1, role: 1 } })
  if (!u || u.role !== 'admin') throw Object.assign(new Error('Admin only'), { status: 403 })
  return u
}
const fail = (e) => NextResponse.json({ error: e.message || 'Failed' }, { status: e.status || 500 })

export async function GET(request) {
  try {
    const d = await getDb()
    await admin(request, d)
    return NextResponse.json({ ...transferState(), dbName: d.databaseName })
  } catch (e) { return fail(e) }
}

export async function POST(request) {
  try {
    const d = await getDb()
    const u = await admin(request, d)
    const body = await request.json().catch(() => ({}))
    if (body.confirm !== 'COPY') throw Object.assign(new Error('Type COPY to confirm.'), { status: 400 })
    if (!u.password || !(await verifyPassword(String(body.password || ''), u.password))) {
      throw Object.assign(new Error('Wrong admin password.'), { status: 403 })
    }
    const st = await startTransfer(d, { targetUrl: body.targetUrl, targetDb: body.targetDb, by: `${u.name || ''} ${u.mobile || ''}`.trim() })
    console.log(`[db-transfer] started by ${u.id} -> ${st.target}`)
    return NextResponse.json(st)
  } catch (e) { return fail(e) }
}
