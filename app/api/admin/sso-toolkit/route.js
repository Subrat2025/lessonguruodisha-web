// Admin: Toolkit auto-login (SSO) — per-host kill switch + audit log (last 50).
//   GET /api/admin/sso-toolkit  -> { settings, currentHostType, audit }
//   PUT /api/admin/sso-toolkit  { hostType:'preview'|'live', enabled } -> toggle
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'
import { isPreviewHost } from '@/lib/wa-allowlist'
import { getSsoSettings, setSsoEnabled, listAudit, listLinkedUsers, ensureSsoIndexes } from '@/lib/sso-toolkit'

export const dynamic = 'force-dynamic'
const json = (b, init) => NextResponse.json(b, init)

function guard(request) {
  const payload = getUser(request)
  if (!payload) return { err: json({ error: 'Unauthorized' }, { status: 401 }) }
  if (payload.role !== 'admin') return { err: json({ error: 'Admin only' }, { status: 403 }) }
  return { payload }
}

function hostTypeOf(request) {
  const h = request.headers
  const host = String(h.get('x-forwarded-host') || h.get('host') || '').toLowerCase()
  return isPreviewHost(host) ? 'preview' : 'live'
}

export async function GET(request) {
  const { err } = guard(request); if (err) return err
  try {
    const d = await getDb()
    await ensureSsoIndexes(d)
    const settings = await getSsoSettings(d)
    const auditRows = await listAudit(d, { limit: 50 })
    const linked = await listLinkedUsers(d, { limit: 100 })
    return json({ ok: true, settings, currentHostType: hostTypeOf(request), audit: auditRows, linked })
  } catch (e) {
    console.error('[admin/sso-toolkit GET] failed:', e?.message)
    return json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PUT(request) {
  const { err, payload } = guard(request); if (err) return err
  try {
    const d = await getDb()
    const body = await request.json().catch(() => ({}))
    const hostType = body?.hostType === 'live' ? 'live' : 'preview'
    const settings = await setSsoEnabled(d, { hostType, enabled: body?.enabled === true, adminId: payload.id })
    return json({ ok: true, settings })
  } catch (e) {
    console.error('[admin/sso-toolkit PUT] failed:', e?.message)
    return json({ error: 'Failed' }, { status: 500 })
  }
}
