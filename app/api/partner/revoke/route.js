// POST /api/partner/revoke — reverse a combo activation when refunded on Toolkit.
// Body: { orderId, ts }  Header: X-Signature = HMAC-SHA256(rawBody, SECRET)
//
// Signature is ALWAYS required. The kill switch does NOT block revoke (refunds
// must always be reversible). Removes exactly the days granted for that orderId,
// silent (audit log only), idempotent.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { verifySignature, tsFresh, revokeCombo, ensurePartnerIndexes } from '@/lib/partner-grant'

export const dynamic = 'force-dynamic'
const json = (b, init) => NextResponse.json(b, init)

export async function POST(request) {
  try {
    const secret = process.env.PARTNER_GRANT_SECRET
    if (!secret) return json({ error: 'Partner grant not configured' }, { status: 500 })

    const raw = await request.text()
    const sig = request.headers.get('x-signature') || request.headers.get('X-Signature') || ''
    if (!verifySignature(raw, sig, secret)) return json({ error: 'Invalid signature' }, { status: 401 })

    let body
    try { body = JSON.parse(raw || '{}') } catch { return json({ error: 'Invalid JSON' }, { status: 400 }) }
    const { orderId, ts } = body || {}
    if (!tsFresh(ts)) return json({ error: 'Stale or invalid timestamp' }, { status: 400 })

    const d = await getDb()
    await ensurePartnerIndexes(d)
    const result = await revokeCombo(d, { orderId })
    return json(result)
  } catch (e) {
    const status = e?.httpStatus || 500
    if (status === 500) console.error('[partner/revoke] failed:', e?.message)
    return json({ error: status === 500 ? 'Failed' : e.message }, { status })
  }
}
