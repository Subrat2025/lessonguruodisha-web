// Admin: milestone settings (GET/PUT) + the "milestone reached" approval list.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'
import { getMilestoneConfig, saveMilestoneConfig, listMilestoneReached } from '@/lib/referral-milestone'
import { isContinuousLadderOn, setContinuousLadder } from '@/lib/referral-engine'

export const dynamic = 'force-dynamic'

const DEFAULT_NOTICE = {
  enabled: true,
  text: 'ନୂଆ ନିୟମ: 100 Refer କଲେ 1 ବର୍ଷ ମାଗଣା Premium (ଥରେ ମାତ୍ର)। 500 Refer ପୂରଣ କଲେ 1 ବର୍ଷ ମାଗଣା Mobile Recharge, Gift Hamper ଓ District Head ପଦବୀ, ସହିତ ବର୍ଷକୁ ମାତ୍ର ₹99 ରେ Premium। ଆଗରୁ ମିଳିଥିବା ପୁରସ୍କାର ଅପରିବର୍ତ୍ତିତ।',
}
async function getNotice(d) {
  const row = await d.collection('settings').findOne({ key: 'referral_notice' })
  return { ...DEFAULT_NOTICE, ...(row?.value || {}) }
}

// DB-backed Ambassador ₹99-plan kill switch — DEFAULT ON (true) when unset.
async function getKill(d) {
  const row = await d.collection('settings').findOne({ key: 'ambassador_plan_kill' })
  return row ? row.value !== false : true
}

async function requireAdmin(request) {
  const payload = getUser(request)
  if (!payload) return { error: 'Unauthorized', status: 401 }
  if (payload.role !== 'admin') return { error: 'Admin only', status: 403 }
  return { payload }
}

export async function GET(request) {
  const a = await requireAdmin(request)
  if (a.error) return NextResponse.json({ error: a.error }, { status: a.status })
  try {
    const d = await getDb()
    const withReached = new URL(request.url).searchParams.get('withReached') === '1'
    const config = await getMilestoneConfig(d)
    const continuousLadder = await isContinuousLadderOn(d)
    const notice = await getNotice(d)
    const ambassadorKill = await getKill(d)
    let target = Number(config?.target) || 500
    let reached = []
    // The "milestone reached" list is a heavy per-referrer computation that can
    // time out on large LIVE data — it MUST NOT block the settings card / V2
    // switch from loading. Compute it only on demand, and never hang (20s cap).
    if (withReached) {
      try {
        const res = await Promise.race([
          listMilestoneReached(d, {}),
          new Promise((_, rej) => setTimeout(() => rej(new Error('reached-timeout')), 20000)),
        ])
        if (res && typeof res === 'object') { target = res.target ?? target; reached = res.reached || [] }
      } catch (e) {
        console.warn('[admin/referral-milestone] reached compute slow/failed:', e?.message)
      }
    }
    return NextResponse.json({ ok: true, config, target, reached, continuousLadder, notice, ambassadorKill, reachedDeferred: !withReached })
  } catch (e) {
    console.error('[admin/referral-milestone GET] failed:', e?.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PUT(request) {
  const a = await requireAdmin(request)
  if (a.error) return NextResponse.json({ error: a.error }, { status: a.status })
  try {
    const d = await getDb()
    const body = await request.json().catch(() => ({}))
    // Continuous-ladder master switch (safety: default ON / old behaviour).
    if (typeof body?.continuousLadder === 'boolean') {
      await setContinuousLadder(d, body.continuousLadder)
    }
    // Ambassador ₹99-plan kill switch (DEFAULT ON). Admin can flip OFF here.
    if (typeof body?.ambassadorKill === 'boolean') {
      await d.collection('settings').updateOne(
        { key: 'ambassador_plan_kill' },
        { $set: { key: 'ambassador_plan_kill', value: body.ambassadorKill, updatedAt: new Date() } },
        { upsert: true },
      )
    }
    // Referral notice banner (edit text / hide).
    if (body?.referralNotice && typeof body.referralNotice === 'object') {
      const cur = await getNotice(d)
      const next = { ...cur, ...body.referralNotice }
      next.enabled = !!next.enabled
      next.text = String(next.text || '').slice(0, 500)
      await d.collection('settings').updateOne(
        { key: 'referral_notice' },
        { $set: { key: 'referral_notice', value: next, updatedAt: new Date() } },
        { upsert: true },
      )
    }
    const saved = await saveMilestoneConfig(d, body || {})
    const continuousLadder = await isContinuousLadderOn(d)
    const notice = await getNotice(d)
    const ambassadorKill = await getKill(d)
    return NextResponse.json({ ok: true, config: saved, continuousLadder, notice, ambassadorKill })
  } catch (e) {
    console.error('[admin/referral-milestone PUT] failed:', e?.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
