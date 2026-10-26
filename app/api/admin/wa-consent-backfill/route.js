// Admin: ONE-TIME safe backfill of WhatsApp marketing consent (waOptIn) for
// EXISTING users who have no waOptIn field yet (created before the consent
// checkbox existed).
//
// Rules (Option A):
//   • Only touches users with NO waOptIn field. Never changes anyone who has
//     already chosen true/false (toggle or STOP) -> they are 'alreadySet'.
//   • A no-field user that shows any opt-out signal (waOptOutReason set, or a
//     future marketingPausedUntil) is set to FALSE. Everyone else -> TRUE.
//   • Sets waOptInSource='existing_user' and waOptInUpdatedAt=now.
//   • Admins are excluded.
//
// GET  -> dry-run counts only (no writes).
// POST -> applies the change (and also returns the same counts).
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function guard(request) {
  const payload = getUser(request)
  if (!payload) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (payload.role !== 'admin') return { err: NextResponse.json({ error: 'Admin only' }, { status: 403 }) }
  return { payload }
}

const NO_FIELD = { role: { $ne: 'admin' }, waOptIn: { $exists: false } }
const optOutSignal = (now) => ({
  $or: [
    { waOptOutReason: { $exists: true, $nin: [null, ''] } },
    { marketingPausedUntil: { $gt: now } },
  ],
})

async function computeCounts(d, now) {
  const users = d.collection('users')
  const candidates = await users.countDocuments(NO_FIELD)
  const willSetFalse = await users.countDocuments({ $and: [NO_FIELD, optOutSignal(now)] })
  const willSetTrue = Math.max(0, candidates - willSetFalse)
  const alreadySet = await users.countDocuments({ role: { $ne: 'admin' }, waOptIn: { $exists: true } })
  return { candidates, willSetTrue, willSetFalse, alreadySet }
}

export async function GET(request) {
  const { err } = guard(request); if (err) return err
  try {
    const d = await getDb()
    const counts = await computeCounts(d, new Date())
    return NextResponse.json({ dryRun: true, ...counts })
  } catch (e) {
    console.error('[wa-consent-backfill GET] failed:', e?.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(request) {
  const { err, payload } = guard(request); if (err) return err
  try {
    const d = await getDb()
    const now = new Date()
    const counts = await computeCounts(d, now)
    const users = d.collection('users')
    const base = { waOptInSource: 'existing_user', waOptInUpdatedAt: now, waOptInBackfilledBy: payload.id }
    // Set FALSE for no-field users that show an opt-out signal.
    const falseRes = await users.updateMany(
      { $and: [NO_FIELD, optOutSignal(now)] },
      { $set: { waOptIn: false, waOptOutReason: 'existing_user_backfill', ...base } },
    )
    // Set TRUE for all remaining no-field users.
    const trueRes = await users.updateMany(
      { $and: [{ role: { $ne: 'admin' }, waOptIn: { $exists: false } }] },
      { $set: { waOptIn: true, ...base } },
    )
    return NextResponse.json({
      ok: true,
      applied: true,
      setFalse: falseRes.modifiedCount || 0,
      setTrue: trueRes.modifiedCount || 0,
      dryRunCounts: counts,
    })
  } catch (e) {
    console.error('[wa-consent-backfill POST] failed:', e?.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
