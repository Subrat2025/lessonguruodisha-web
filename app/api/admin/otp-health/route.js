// Admin — WhatsApp OTP health check.
//   GET  → provider config (presence only), OTP template approval status, wallet estimate,
//          last-24h OTP outcomes and the most recent failures with the provider's reply.
//   POST { mobile } → sends one real test OTP (a random code that is NOT stored, so it can't
//          be used to log in) and returns the provider's raw (OTP-masked) reply.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import * as Deletion from '@/lib/account-deletion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const fail = (e) => { const { status, body } = Deletion.errorBody(e); return NextResponse.json(body, { status }) }

export async function GET(request) {
  try {
    const d = await getDb()
    await Deletion.requireAdmin(request, d)
    const templateId = process.env.BULKY_OTP_TEMPLATE_ID || 'otptemplate'
    const config = {
      provider: 'BulkyMarketing',
      credentialsSet: !!(process.env.BULKY_APPKEY && process.env.BULKY_AUTHKEY),
      baseUrl: (process.env.BULKY_BASE_URL || 'https://live.bulkymarketing.com/api').replace(/^https?:\/\//, ''),
      templateId,
      language: process.env.BULKY_OTP_LANGUAGE || 'en_US',
    }

    let template = { found: false, status: null, error: null }
    if (config.credentialsSet) {
      try {
        const { getTemplates } = await import('@/lib/bulkymarketing.js')
        const data = await getTemplates()
        const arr = Array.isArray(data) ? data : (data?.templates || data?.data || data?.message_templates || [])
        const t = arr.find(x => [x?.name, x?.template_name, x?.template_id, x?.id].map(String).includes(templateId))
        if (t) template = { found: true, status: String(t.status || t.template_status || t.approval_status || 'unknown').toUpperCase(), category: t.category || null, language: t.language || t.lang || null, error: null }
        else template = { found: false, status: null, error: `No template named "${templateId}" on the BulkyMarketing account (${arr.length} templates found)` }
      } catch (e) { template.error = 'Could not reach BulkyMarketing: ' + String(e?.message || e).slice(0, 160) }
    }

    let wallet = null
    try { const core = await import('@/lib/wa-send-core.js'); wallet = await core.getWalletState(d) } catch (_) {}

    const since = new Date(Date.now() - 24 * 3600e3)
    const rows = await d.collection('otp_audit').find({ at: { $gte: since } }).sort({ at: -1 }).limit(2000).toArray()
    const counts = {}
    for (const r of rows) { const k = r.result + (r.reason ? ':' + r.reason : ''); counts[k] = (counts[k] || 0) + 1 }
    const recentProblems = rows.filter(r => r.result !== 'sent').slice(0, 25).map(r => ({
      at: r.at, purpose: r.purpose, last4: r.last4, result: r.result, reason: r.reason || null,
      providerStatus: r.providerStatus ?? null, messageStatus: r.messageStatus ?? null, detail: r.detail || null,
    }))
    const recentSent = rows.filter(r => r.result === 'sent').slice(0, 10).map(r => ({ at: r.at, purpose: r.purpose, last4: r.last4, providerRef: r.providerRef || null, messageStatus: r.messageStatus || null }))

    const problems = []
    if (!config.credentialsSet) problems.push('BulkyMarketing keys (BULKY_APPKEY / BULKY_AUTHKEY) are not set on this server.')
    if (template.error) problems.push(template.error)
    if (template.found && template.status !== 'APPROVED') problems.push(`OTP template "${templateId}" is ${template.status}, not APPROVED — WhatsApp will not deliver it.`)
    if (wallet && typeof wallet.balance === 'number' && wallet.balance <= 0) problems.push('BulkyMarketing wallet estimate is ₹0 — recharge the wallet.')
    const failed = rows.filter(r => r.result === 'failed').length
    if (failed && failed >= rows.filter(r => r.result === 'sent').length) problems.push(`${failed} OTP sends failed in the last 24 hours — see the provider replies below.`)

    return NextResponse.json({ config, template, wallet, last24h: { total: rows.length, counts }, recentProblems, recentSent, problems })
  } catch (e) { return fail(e) }
}

export async function POST(request) {
  try {
    const d = await getDb()
    const admin = await Deletion.requireAdmin(request, d)
    const body = await request.json().catch(() => ({}))
    const mobile = String(body.mobile || '').replace(/\D/g, '').slice(-10)
    if (!/^[6-9]\d{9}$/.test(mobile)) throw new Deletion.DeletionError('BAD_MOBILE', 'Enter a valid 10-digit WhatsApp number')
    const { sendBulkyOtp } = await import('@/lib/whatsapp-bulky.js')
    const code = String(Math.floor(100000 + Math.random() * 900000)) // never stored → cannot be used to log in
    const r = await sendBulkyOtp({ to: mobile, code })
    await d.collection('otp_audit').insertOne({ at: new Date(), last4: mobile.slice(-4), purpose: 'admin-test', ip: 'admin:' + admin.id,
      result: r.ok ? 'sent' : 'failed', providerStatus: r.status, messageStatus: r.messageStatus, providerRef: r.providerRef || null, detail: r.detail || r.safeError })
    return NextResponse.json({ ok: r.ok, providerStatus: r.status, messageStatus: r.messageStatus, providerRef: r.providerRef || null, reply: r.detail || r.safeError,
      hint: r.ok ? 'Accepted by BulkyMarketing. If it does not arrive within a minute, the template, the sending number or the wallet is the problem on the provider side.' : 'Rejected — the reply above says why.' })
  } catch (e) { return fail(e) }
}
