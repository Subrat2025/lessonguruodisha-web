// Daily auto-repair: ensure every PAID store order granted its entitlements.
// Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb.js'
import { STORE_COLL } from '@/lib/store/security.js'
import * as StoreEnt from '@/lib/store/entitlements.js'
import { sendWhatsApp } from '@/lib/ultramsg.js'

function timingSafeEqual(a, b) {
  a = String(a || ''); b = String(b || '')
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

async function runRepair(runId) {
  try {
    const d = await getDb()
    const orders = await d.collection(STORE_COLL.orders).find({ status: 'paid' }).toArray()
    let repaired = 0
    const repairedOrders = []
    for (const o of orders) {
      const pids = []
      for (const it of o.items || []) { pids.push(it.productId); if (it.bundleItems?.length) pids.push(...it.bundleItems) }
      let missing = 0
      for (const pid of pids) {
        const e = await d.collection(STORE_COLL.entitlements).findOne({ userId: o.userId, productId: pid, revokedAt: null })
        if (!e) missing++
      }
      if (missing > 0) {
        await StoreEnt.grantForOrder(d, o)
        repaired++
        repairedOrders.push(o.id)
        if (o.userMobile) {
          const body = 'ଆପଣଙ୍କ କିଣାଯାଇଥିବା ଅଧ୍ୟାୟଭିତ୍ତିକ ମୂଲ୍ୟାୟନ ବର୍ତ୍ତମାନ ମୋ ଲାଇବ୍ରେରୀରେ ଉପଲବ୍ଧ। ଅସୁବିଧା ପାଇଁ କ୍ଷମା ପ୍ରାର୍ଥନା।'
          try { await sendWhatsApp({ to: o.userMobile, body }) } catch (_) {}
        }
      }
    }
    // Idempotency + audit log
    try { await d.collection('storeCoverJobs').updateOne({ id: `repair-${runId}` }, { $setOnInsert: { id: `repair-${runId}`, kind: 'repair', ordersChecked: orders.length, repaired, repairedOrders, at: new Date() } }, { upsert: true }) } catch (_) {}
    // Alert all admins if anything was repaired
    if (repaired > 0) {
      const admins = await d.collection('users').find({ role: 'admin' }).project({ mobile: 1 }).toArray()
      const msg = `⚠️ Store auto-repair: ${repaired}/${orders.length} paid order(s) were missing access and have been fixed. Orders: ${repairedOrders.join(', ')}`
      for (const a of admins) { if (a.mobile) { try { await sendWhatsApp({ to: a.mobile, body: msg }) } catch (_) {} } }
    }
  } catch (e) {
    console.error('[cron store-repair] failed', e?.message)
  }
}

export async function POST(request) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const secret = process.env.WEBHOOK_CRON_SECRET || ''
  if (!secret || !timingSafeEqual(token, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const runId = request.headers.get('x-webhook-id') || `run-${Date.now()}`
  // Background the work; ack immediately.
  runRepair(runId)
  return NextResponse.json({ ok: true, accepted: true, runId })
}
