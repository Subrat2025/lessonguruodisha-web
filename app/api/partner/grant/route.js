// POST /api/partner/grant — activate a Teacher Utility Toolkit combo.
// Body: { phone, name, days, orderId, comboType: 'master'|'duo', source, ts }
// Header: X-Signature = HMAC-SHA256(rawBody, PARTNER_GRANT_SECRET)
//
// Rejects: bad signature (constant-time), ts older than 5 min, days !== 365,
// invalid phone. Blocked (403) when the kill switch is OFF — but the signature
// is ALWAYS checked first. Idempotent by orderId (never double-adds days).
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { verifySignature, tsFresh, getPartnerSettings, grantCombo, ensurePartnerIndexes } from '@/lib/partner-grant'

export const dynamic = 'force-dynamic'
const json = (b, init) => NextResponse.json(b, init)

export async function POST(request) {
  try {
    const secret = process.env.PARTNER_GRANT_SECRET
    if (!secret) return json({ error: 'Partner grant not configured' }, { status: 500 })

    const raw = await request.text()
    const sig = request.headers.get('x-signature') || request.headers.get('X-Signature') || ''
    if (!verifySignature(raw, sig, secret)) return json({ error: 'Invalid signature' }, { status: 401 })

    const d = await getDb()
    await ensurePartnerIndexes(d)

    // Kill switch — grant only (revoke is always allowed). Signature already OK.
    const settings = await getPartnerSettings(d)
    if (!settings.enabled) return json({ error: 'Partner grant disabled' }, { status: 403 })

    let body
    try { body = JSON.parse(raw || '{}') } catch { return json({ error: 'Invalid JSON' }, { status: 400 }) }
    const { phone, name, days, orderId, comboType, source, ts } = body || {}

    if (!tsFresh(ts)) return json({ error: 'Stale or invalid timestamp' }, { status: 400 })

    const result = await grantCombo(d, { phone, name, days, orderId, comboType, source })
    return json(result)
  } catch (e) {
    const status = e?.httpStatus || 500
    if (status === 500) console.error('[partner/grant] failed:', e?.message)
    return json({ error: status === 500 ? 'Failed' : e.message }, { status })
  }
}
