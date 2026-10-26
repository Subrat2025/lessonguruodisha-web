// Admin: edit the referral SHARE MESSAGE template (Admin -> Referrals).
//   GET /api/admin/referral-share -> { template, default, preview, currentYearlyPrice }
//   PUT /api/admin/referral-share { text } -> saves template
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'
import {
  DEFAULT_REFERRAL_SHARE_TEMPLATE, getReferralShareTemplate, setReferralShareTemplate, renderReferralShareMessage, findNonOdiaIndicChars,
} from '@/lib/referral-share'

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
    const template = await getReferralShareTemplate(d)
    const sampleLink = (process.env.NEXT_PUBLIC_BASE_URL || 'https://lessonguruodisha.in').replace(/\/+$/, '') + '/?ref=LGSAMPLE'
    const preview = renderReferralShareMessage(template, { link: sampleLink })
    return json({ ok: true, template, default: DEFAULT_REFERRAL_SHARE_TEMPLATE, preview })
  } catch (e) {
    console.error('[admin/referral-share GET] failed:', e?.message)
    return json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PUT(request) {
  const { err, payload } = guard(request); if (err) return err
  try {
    const d = await getDb()
    const body = await request.json().catch(() => ({}))
    const text = String(body?.text == null ? '' : body.text)
    if (!text.trim()) return json({ error: 'Message cannot be empty' }, { status: 400 })
    // Reject any non-Odia Indic characters (e.g. Tamil look-alikes) so the
    // WhatsApp message can never be saved with broken letters.
    const bad = findNonOdiaIndicChars(text)
    if (bad.length) {
      const sample = bad.slice(0, 5).map(b => `"${b.char}" (${b.code})`).join(', ')
      return json({ error: `Message contains ${bad.length} non-Odia character(s): ${sample}. Please use only Odia letters, English, ₹ and emojis.` }, { status: 400 })
    }
    await setReferralShareTemplate(d, text, payload.id)
    const sampleLink = (process.env.NEXT_PUBLIC_BASE_URL || 'https://lessonguruodisha.in').replace(/\/+$/, '') + '/?ref=LGSAMPLE'
    const preview = renderReferralShareMessage(text, { link: sampleLink })
    return json({ ok: true, template: text, preview })
  } catch (e) {
    console.error('[admin/referral-share PUT] failed:', e?.message)
    return json({ error: 'Failed' }, { status: 500 })
  }
}
