// ============================================================================
//  lib/ambassador-plan.js — "Ambassador Renewal" plan (₹99 / year).
//  Shown only to teachers who reached the 100-referral milestone (including
//  anyone who earned the old continuous rewards). It is a NORMAL paid plan:
//  same Razorpay / QR flow, receipt and order record. Admin edits price /
//  turns it ON-OFF via settings key 'ambassador_plan'.
// ============================================================================
export const AMBASSADOR_PLAN_ID = 'ambassador-yearly'

export const DEFAULT_AMBASSADOR_CONFIG = {
  enabled: true,
  priceInr: 99,
  days: 365,
  name: 'Ambassador Special',
  labelOdia: 'Ambassador Special · ₹99/ବର୍ଷ',
}

export async function getAmbassadorConfig(d) {
  const row = await d.collection('settings').findOne({ key: 'ambassador_plan' })
  return { ...DEFAULT_AMBASSADOR_CONFIG, ...(row?.value || {}) }
}

export async function saveAmbassadorConfig(d, patch = {}) {
  const cur = await getAmbassadorConfig(d)
  const next = { ...cur, ...patch }
  next.priceInr = Math.max(1, parseInt(next.priceInr, 10) || 99)
  next.days = Math.max(1, parseInt(next.days, 10) || 365)
  next.enabled = !!next.enabled
  await d.collection('settings').updateOne(
    { key: 'ambassador_plan' },
    { $set: { key: 'ambassador_plan', value: next, updatedAt: new Date() } },
    { upsert: true },
  )
  return next
}

// Plan object shaped like the normal plans so activateSubscription + verify work.
export function buildAmbassadorPlan(cfg) {
  const c = cfg || DEFAULT_AMBASSADOR_CONFIG
  return {
    id: AMBASSADOR_PLAN_ID,
    name: c.name || 'Ambassador Special',
    price: c.priceInr,
    days: c.days,
    enabled: c.enabled !== false,
    ambassadorOnly: true,   // hidden from normal users in the UI
    badge: 'Ambassador',
    tagline: c.labelOdia || 'Ambassador Special · ₹99/ବର୍ଷ',
  }
}

// Eligible to BUY the ₹99 Ambassador plan.
//  • Ladder ON  → legacy: earned a 100+/continuous reward, OR currently-active
//    qualified count ≥ 100 (nothing changes for existing grandfathered users).
//  • Ladder OFF → NEW rule: unified all-time X ≥ AMBASSADOR_REQUIRED_REFERRALS
//    (admin-editable, default 500).
export async function isAmbassadorEligible(d, user) {
  if (!user) return false
  let ladderOn = true
  try {
    const { isContinuousLadderOn } = await import('./referral-engine.js')
    ladderOn = await isContinuousLadderOn(d)
  } catch (_) {}

  if (!ladderOn) {
    // NEW rule — unified X vs admin threshold.
    try {
      const { getMilestoneConfig, computeMilestoneReferrals } = await import('./referral-milestone.js')
      const cfg = await getMilestoneConfig(d)
      const threshold = Math.max(1, parseInt(cfg?.ambassadorRequiredReferrals, 10) || 500)
      const r = await computeMilestoneReferrals(d, user)
      return (r.count || 0) >= threshold
    } catch (e) {
      console.warn('[ambassador] eligibility (ladder-off) failed:', e?.message)
      return false
    }
  }

  // Legacy (ladder ON).
  const rw = await d.collection('referral_rewards').findOne({
    userId: user.id, $or: [{ continuous: true }, { milestoneCount: { $gte: 100 } }],
  })
  if (rw) return true
  try {
    const { computeReferralStats } = await import('./referral-engine.js')
    const s = await computeReferralStats(d, user)
    if ((s?.qualified || 0) >= 100) return true
  } catch (_) {}
  return false
}

// Referral count to display on the Ambassador card — the UNIFIED all-time X
// (same number shown on the referral page / popup / premium / admin).
export async function getAmbassadorReferralCount(d, user) {
  try {
    const { computeMilestoneReferrals } = await import('./referral-milestone.js')
    const r = await computeMilestoneReferrals(d, user)
    return r.count || 0
  } catch (_) {
    try {
      const { computeReferralStats } = await import('./referral-engine.js')
      const s = await computeReferralStats(d, user)
      return s?.qualified || 0
    } catch (_) { return 0 }
  }
}
