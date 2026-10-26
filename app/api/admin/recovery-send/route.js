// Dedicated route (kept out of the monolithic route.js). Admin-only.
// Phase 2 — Subscription Recovery "Auto Send via BulkyMarketing".
//   POST /api/admin/recovery-send
//     body { mode: 'dry-run' | 'send', userIds: [id,...] }
//   • dry-run  → local simulation only (NO provider call): counts, cost
//                estimate, wallet gate, approvals, previews, per-user status.
//   • send     → real safe-send via lib/wa-send-core + lib/bulkymarketing.
//                Blocked if the ₹300 OTP-reserve wallet gate fails.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'
import {
  resolveRecovery, buildDryRunSummary, executeRecoverySend, MAX_PER_CLICK,
} from '@/lib/recovery-send'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  const payload = getUser(request)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const mode = body?.mode === 'send' ? 'send' : 'dry-run'
  const userIds = Array.isArray(body?.userIds) ? body.userIds.map(String).filter(Boolean) : []
  if (!userIds.length) return NextResponse.json({ error: 'No users selected' }, { status: 400 })
  if (userIds.length > MAX_PER_CLICK) {
    return NextResponse.json({ error: `Max ${MAX_PER_CLICK} users per send. Deselect some and try again.` }, { status: 400 })
  }

  try {
    const d = await getDb()
    // Real request host (set by the platform per-environment; can't be faked by a
    // copied env var). Threaded into the allowlist so LIVE (lessonguruodisha.in)
    // is ALWAYS unguarded and PREVIEW is guarded.
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
    const items = await resolveRecovery(d, userIds, { host })
    const summary = await buildDryRunSummary(d, items)

    if (mode === 'dry-run') {
      return NextResponse.json({ ok: true, mode: 'dry-run', ...summary })
    }

    // Real send — honour the wallet gate (never bypass the OTP reserve).
    if (!summary.wallet.canSend) {
      return NextResponse.json(
        { error: summary.wallet.blockReason || 'Wallet gate blocked the send.', wallet: summary.wallet },
        { status: 409 },
      )
    }

    const admin = await d.collection('users').findOne({ id: payload.id }, { projection: { _id: 0, name: 1, mobile: 1 } })
    const report = await executeRecoverySend(d, { items, adminId: payload.id, adminName: admin?.name || '', host })

    // Audit log (who / when / outcome / filters).
    await d.collection('recoverySendAudit').insertOne({
      id: (globalThis.crypto?.randomUUID?.() || String(Date.now())), at: new Date(),
      adminId: payload.id, adminName: admin?.name || '', adminMobile: admin?.mobile || '',
      requested: userIds.length,
      sentCount: report.sentCount, failedCount: report.failedCount, skippedCount: report.skippedCount,
      spend: report.spend, currency: report.currency,
    }).catch(() => {})

    return NextResponse.json({
      ok: true, mode: 'send',
      report: {
        sentCount: report.sentCount, failedCount: report.failedCount, skippedCount: report.skippedCount,
        spend: report.spend, currency: report.currency,
        failed: report.failed.map(f => ({ name: f.name, mobile: f.mobile, error: f.error })),
        skipped: report.skipped.map(s => ({ name: s.name, mobile: s.mobile, reason: s.reason })),
      },
      wallet: summary.wallet,
    })
  } catch (e) {
    console.error('[recovery-send] failed:', e?.message || e)
    return NextResponse.json({ error: 'Send failed' }, { status: 500 })
  }
}
