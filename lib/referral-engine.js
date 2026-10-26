// ============================================================================
//  Referral Engine — Campaigns, Milestones, Continuous Rewards, Notifications
//  ============================================================================
//  Collections used:
//    referral_campaigns      — admin-configurable campaign definitions
//    referral_rewards        — every reward automatically granted (audit + idempotency)
//    referral_audit_logs     — every decision (qualified / rejected / rewarded) for admin review
//    referral_notifications  — user-facing bell notifications (new referral, reward, etc.)
//
//  PHASE 2 UPGRADES:
//    • Milestone map: 5=1mo, 15=3mo, 30=6mo, 50=1yr
//    • CONTINUOUS REWARDS: every additional +50 referrals after 50 = +1yr forever.
//    • Idempotency: unique { userId, campaignId, milestoneCount } — prevents duplicates.
//    • expiryBefore / expiryAfter tracked on every reward record.
//    • Notification generated on every reward unlock + on every new referral joined.
// ============================================================================
import { v4 as uuidv4 } from 'uuid'

const CONTINUOUS_STEP = 50
const CONTINUOUS_REWARD_DAYS = 365
const CONTINUOUS_LABEL = '1 Year Free Premium'
const SCHEMA_VERSION = 2

// Base milestones for the two ladder modes. Default (ladder ON) keeps the OLD
// behaviour so a deploy changes nothing. When an admin turns the ladder OFF the
// campaign is rewritten to MILESTONES_LADDER_OFF (adds a one-time 100 milestone,
// continuous disabled, max 5 rewards) and the ₹99 Ambassador plan unlocks.
const MILESTONES_LADDER_ON = [
  { count: 5,  label: '1 Month Free Premium',   rewardType: 'subscription-days', rewardDays: 30 },
  { count: 15, label: '3 Months Free Premium',  rewardType: 'subscription-days', rewardDays: 90 },
  { count: 30, label: '6 Months Free Premium',  rewardType: 'subscription-days', rewardDays: 180 },
  { count: 50, label: '1 Year Free Premium',    rewardType: 'subscription-days', rewardDays: 365 },
]
const MILESTONES_LADDER_OFF = [
  ...MILESTONES_LADDER_ON,
  { count: 100, label: '1 Year Free Premium', rewardType: 'subscription-days', rewardDays: 365 },
]

// -----------------------------------------------------------------------------
//  DEFAULT CAMPAIGN — auto-seeded on first request if the collection is empty.
//  Auto-migrated to schemaVersion=2 on read if it's still the default id and
//  admin hasn't customized milestones.
// -----------------------------------------------------------------------------
export const DEFAULT_CAMPAIGN = {
  id: 'default-refer-and-earn',
  name: '🎁 Refer Teachers → Get Free Premium',
  slug: 'refer-and-earn',
  enabled: true,
  paused: false,
  startDate: null,
  endDate: null,
  validityDays: 90,
  maxRewardsPerUser: null, // unlimited (continuous mode is infinite) — OLD default
  eligiblePlans: ['monthly', 'quarterly', 'half-yearly', 'yearly', 'lifetime', 'special-offer'],
  // Base milestones — sorted asc by count. rewardType: 'subscription-days'.
  milestones: MILESTONES_LADDER_ON,
  // Continuous stacking: after the last base milestone, every +N referrals gives +D days forever.
  continuous: {
    enabled: true,
    every: CONTINUOUS_STEP,
    rewardDays: CONTINUOUS_REWARD_DAYS,
    label: CONTINUOUS_LABEL,
  },
  showLeaderboard: true,
  leaderboardSize: 20,
  schemaVersion: SCHEMA_VERSION,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// -----------------------------------------------------------------------------
//  Auto-seed + auto-migrate on read.
// -----------------------------------------------------------------------------
export async function ensureDefaultCampaign(db) {
  const col = db.collection('referral_campaigns')
  const count = await col.countDocuments()
  if (count === 0) {
    await col.insertOne({ ...DEFAULT_CAMPAIGN })
    return DEFAULT_CAMPAIGN
  }
  // Auto-migrate the default campaign if it's still on schema v1.
  const def = await col.findOne({ id: DEFAULT_CAMPAIGN.id })
  if (def && (def.schemaVersion || 0) < SCHEMA_VERSION) {
    await col.updateOne({ id: DEFAULT_CAMPAIGN.id }, {
      $set: {
        milestones: DEFAULT_CAMPAIGN.milestones,
        continuous: DEFAULT_CAMPAIGN.continuous,
        maxRewardsPerUser: null,
        schemaVersion: SCHEMA_VERSION,
        updatedAt: new Date(),
      },
    })
  }
}


// ---- Continuous-ladder master switch (admin-controlled, default ON) ----
// ON  = OLD behaviour (continuous +1yr every 50, unlimited).
// OFF = NEW rule (one-time 5/15/30/50/100, max 5, Ambassador ₹99 unlocks).
export async function isContinuousLadderOn(db) {
  const row = await db.collection('settings').findOne({ key: 'referral_continuous_ladder' })
  return row ? row.value !== false : true // default ON
}

export async function setContinuousLadder(db, on) {
  const enabled = !!on
  await db.collection('settings').updateOne(
    { key: 'referral_continuous_ladder' },
    { $set: { key: 'referral_continuous_ladder', value: enabled, updatedAt: new Date() } },
    { upsert: true },
  )
  // Rewrite the default campaign to match the chosen mode. Never removes any
  // already-granted referral_rewards — only changes future grant rules.
  await ensureDefaultCampaign(db)
  await db.collection('referral_campaigns').updateOne(
    { id: DEFAULT_CAMPAIGN.id },
    { $set: {
      milestones: enabled ? MILESTONES_LADDER_ON : MILESTONES_LADDER_OFF,
      'continuous.enabled': enabled,
      maxRewardsPerUser: enabled ? null : 5,
      updatedAt: new Date(),
    } },
  )
  return enabled
}

// -----------------------------------------------------------------------------
//  STEP 2: Unified referral count for reward-giving.
//  • Ladder ON  → OLD behaviour: engine stats.qualified (currently-active subs).
//  • Ladder OFF → NEW rule: all-time "ever-paid" count X (computeMilestoneReferrals)
//    — the SAME X shown on the referral page / popup / premium / admin. This count
//    does NOT drop on plan expiry; it drops ONLY when a payment is refunded.
//  Safe: dynamic import avoids a static cycle with referral-milestone.js.
// -----------------------------------------------------------------------------
export async function getRewardEvalCount(db, referrer, ladderOn) {
  if (ladderOn) {
    const s = await computeReferralStats(db, referrer)
    return s.qualified
  }
  try {
    const { computeMilestoneReferrals } = await import('./referral-milestone.js')
    const r = await computeMilestoneReferrals(db, referrer)
    return r.count || 0
  } catch (e) {
    console.warn('[referral] getRewardEvalCount fallback to qualified:', e?.message)
    const s = await computeReferralStats(db, referrer)
    return s.qualified
  }
}
export async function getActiveCampaign(db) {
  await ensureDefaultCampaign(db)
  const now = new Date()
  const candidates = await db.collection('referral_campaigns')
    .find({ enabled: true, paused: { $ne: true } })
    .sort({ createdAt: -1 })
    .toArray()
  for (const c of candidates) {
    if (c.startDate && new Date(c.startDate) > now) continue
    if (c.endDate && new Date(c.endDate) < now) continue
    return c
  }
  return null
}

// -----------------------------------------------------------------------------
//  Effective milestones = base milestones + any continuous milestones that are
//  either already earned or the immediate next one after the highest earned.
//  Passing qualifiedCount ensures we always include the "next target" for UI.
// -----------------------------------------------------------------------------
export function getEffectiveMilestones(campaign, qualifiedCount = 0) {
  if (!campaign) return []
  const base = [...(campaign.milestones || [])].sort((a, b) => a.count - b.count)
  const cont = campaign.continuous
  if (!cont || !cont.enabled || !cont.every || cont.every <= 0) return base
  const maxBase = base.length ? base[base.length - 1].count : 50
  // Show at least: (a) all already-earned continuous milestones, (b) the next unearned one.
  const target = Math.max(qualifiedCount + cont.every, maxBase + cont.every)
  const list = [...base]
  for (let c = maxBase + cont.every; c <= target; c += cont.every) {
    list.push({
      count: c,
      label: cont.label || `+${cont.rewardDays} Days Free`,
      rewardType: 'subscription-days',
      rewardDays: cont.rewardDays,
      continuous: true,
    })
  }
  return list
}

// -----------------------------------------------------------------------------
//  Anti-fraud: is this referred user a legit qualified referral for THIS referrer?
// -----------------------------------------------------------------------------
export function isQualifyingReferral(referrer, referred, campaign) {
  if (!referrer || !referred || referrer.id === referred.id) return { ok: false, reason: 'self-referral' }
  if (referrer.mobile && referrer.mobile === referred.mobile) return { ok: false, reason: 'same-mobile' }
  if (referrer.email && referred.email && referrer.email.toLowerCase() === referred.email.toLowerCase()) {
    return { ok: false, reason: 'same-email' }
  }
  const sub = referred.subscription
  if (!sub || sub.status !== 'active') return { ok: false, reason: 'no-active-subscription' }
  if (!sub.expiryDate || new Date(sub.expiryDate) < new Date()) return { ok: false, reason: 'expired-subscription' }
  const plans = (campaign?.eligiblePlans || []).map(p => String(p).toLowerCase())
  if (plans.length > 0 && !plans.includes(String(sub.plan || '').toLowerCase())) {
    return { ok: false, reason: 'plan-not-eligible' }
  }
  if (campaign?.validityDays && referred.createdAt) {
    const start = new Date(referred.createdAt).getTime()
    const subscribedAt = sub.startDate ? new Date(sub.startDate).getTime() : Date.now()
    const days = (subscribedAt - start) / 86400000
    if (days > campaign.validityDays) return { ok: false, reason: 'past-validity-window' }
  }
  return { ok: true }
}

// -----------------------------------------------------------------------------
//  Count qualified referrals for a given referrer.  Also returns breakdown.
// -----------------------------------------------------------------------------
export async function computeReferralStats(db, referrer) {
  const campaign = await getActiveCampaign(db)
  if (!referrer) return { qualified: 0, pending: 0, total: 0, campaign, entries: [] }
  const referred = await db.collection('users')
    .find({ referredBy: referrer.id }).project({ _id: 0, password: 0 })
    .sort({ createdAt: -1 }).toArray()
  const entries = referred.map(u => {
    const check = isQualifyingReferral(referrer, u, campaign)
    return {
      userId: u.id, name: u.name,
      mobile: (u.mobile || '').replace(/(\d{2})\d{4}(\d{4})/, '$1****$2'),
      joinedAt: u.createdAt, plan: u.subscription?.plan || null,
      subscribed: !!(u.subscription && u.subscription.status === 'active'),
      qualified: check.ok, reason: check.ok ? 'qualified' : check.reason,
    }
  })
  const qualified = entries.filter(e => e.qualified).length
  const pending = entries.filter(e => !e.qualified && e.reason !== 'self-referral' && e.reason !== 'same-mobile' && e.reason !== 'same-email').length
  return { qualified, pending, total: entries.length, campaign, entries }
}

// -----------------------------------------------------------------------------
//  createNotification — internal helper. Safe (no-op if userId missing).
// -----------------------------------------------------------------------------
export async function createNotification(db, userId, { type, title, message, meta = {} }) {
  if (!userId || !type) return null
  const rec = {
    id: uuidv4(),
    userId,
    type,          // 'referral_joined' | 'reward_unlocked' | 'subscription_extended' | 'info'
    title: title || '',
    message: message || '',
    meta,
    read: false,
    readAt: null,
    createdAt: new Date(),
  }
  try {
    await db.collection('referral_notifications').insertOne(rec)
    return rec
  } catch (e) {
    console.warn('[referral] createNotification failed', e?.message)
    return null
  }
}

// Public helper: notify a referrer that a new user joined using their link.
export async function notifyReferralJoined(db, referrerId, referredName) {
  if (!referrerId) return null
  return createNotification(db, referrerId, {
    type: 'referral_joined',
    title: '🎉 New referral joined!',
    message: `${referredName || 'A new teacher'} joined using your referral link. When they subscribe, you'll earn a reward.`,
    meta: { referredName: referredName || null },
  })
}

// -----------------------------------------------------------------------------
//  Evaluate + apply milestone rewards atomically (idempotent — uses
//  referral_rewards uniqueness on {userId, campaignId, milestoneCount}).
//  Also creates a reward_unlocked notification for every newly-granted reward.
//  Returns { newlyEarned: [milestone], allEarned: [milestone] }.
// -----------------------------------------------------------------------------
export async function evaluateAndApplyRewards(db, referrerId) {
  const referrer = await db.collection('users').findOne({ id: referrerId })
  if (!referrer) return { newlyEarned: [], allEarned: [] }
  const stats = await computeReferralStats(db, referrer)
  const campaign = stats.campaign
  if (!campaign) return { newlyEarned: [], allEarned: [] }

  // STEP 2: pick the count that drives reward-giving.
  //  • Ladder ON  → stats.qualified (currently-active, old behaviour).
  //  • Ladder OFF → all-time ever-paid X (drops only on refund, not expiry).
  const ladderOn = await isContinuousLadderOn(db)
  const evalCount = await getRewardEvalCount(db, referrer, ladderOn)

  // Effective milestones = base + continuous (up to count + step).
  const milestones = getEffectiveMilestones(campaign, evalCount).sort((a, b) => a.count - b.count)

  const alreadyEarned = await db.collection('referral_rewards')
    .find({ userId: referrer.id, campaignId: campaign.id })
    .project({ _id: 0 }).toArray()
  const earnedCounts = new Set(alreadyEarned.map(r => r.milestoneCount))
  const eligible = milestones.filter(m => evalCount >= m.count)

  const newlyEarned = []
  const maxRewards = campaign.maxRewardsPerUser
  const alreadyPaidRewards = alreadyEarned.filter(r => r.rewardDays > 0).length

  // Keep a live reference to the referrer's subscription so multi-milestone
  // grants (e.g. jumped from 4 → 20 referrals) stack on top of each other.
  let currentSub = referrer.subscription || null

  for (const m of eligible) {
    if (earnedCounts.has(m.count)) continue
    if (maxRewards && m.rewardDays > 0 && alreadyPaidRewards + newlyEarned.filter(x => x.rewardDays > 0).length >= maxRewards) break

    const rewardId = uuidv4()
    const expiryBefore = currentSub?.expiryDate ? new Date(currentSub.expiryDate) : null
    let expiryAfter = expiryBefore
    let newSub = currentSub

    if (m.rewardType === 'subscription-days' && m.rewardDays > 0) {
      const base = expiryBefore && expiryBefore > new Date() ? expiryBefore : new Date()
      expiryAfter = new Date(base.getTime() + m.rewardDays * 86400000)
      newSub = {
        plan: currentSub?.plan || 'referral-reward',
        startDate: currentSub?.startDate || new Date(),
        expiryDate: expiryAfter,
        status: 'active',
        fromReferralReward: true,
      }
      await db.collection('users').updateOne({ id: referrer.id }, { $set: { subscription: newSub } })
      currentSub = newSub
    }

    const rec = {
      id: rewardId,
      userId: referrer.id,
      userName: referrer.name,
      userMobile: referrer.mobile,
      campaignId: campaign.id,
      campaignName: campaign.name,
      milestoneCount: m.count,
      milestoneLabel: m.label,
      rewardType: m.rewardType,
      rewardDays: m.rewardDays || 0,
      continuous: !!m.continuous,
      expiryBefore,
      expiryAfter,
      newExpiry: expiryAfter, // back-compat with existing UI
      grantedAt: new Date(),
    }
    await db.collection('referral_rewards').insertOne(rec)
    await db.collection('referral_audit_logs').insertOne({
      id: uuidv4(), event: 'reward-granted', userId: referrer.id, campaignId: campaign.id,
      details: { milestone: m.count, rewardDays: m.rewardDays, expiryBefore, expiryAfter, continuous: !!m.continuous }, at: new Date(),
    })

    // Notify user via bell.
    const modeSuffix = ''
    await createNotification(db, referrer.id, {
      type: 'reward_unlocked',
      title: `🎁 Reward unlocked: ${m.label}${modeSuffix}`,
      message: m.rewardDays > 0
        ? `You referred ${m.count} teachers! Your Premium was extended by ${m.rewardDays} days.`
        : `You referred ${m.count} teachers! ${m.label} unlocked.`,
      meta: {
        milestoneCount: m.count,
        milestoneLabel: m.label,
        rewardDays: m.rewardDays || 0,
        expiryBefore,
        expiryAfter,
        continuous: !!m.continuous,
      },
    })

    newlyEarned.push(rec)
  }

  return { newlyEarned, allEarned: [...alreadyEarned, ...newlyEarned] }
}

// -----------------------------------------------------------------------------
//  REWARD CLAWBACK  (Phase 2 — admin-triggered reversal; NO background cron)
//  ---------------------------------------------------------------------------
//  Reverses a SINGLE granted reward:
//    • Subtracts reward.rewardDays from the referrer's current subscription
//      expiry (restoring toward the expiry recorded before this reward).
//    • Marks the reward record { reversed:true } so the SAME milestone can
//      never be auto-granted again (evaluateAndApplyRewards loads ALL rewards —
//      reversed included — into earnedCounts, which blocks re-grant).
//    • Idempotent: a reward already reversed cannot be reversed twice.
//    • Writes a referral_audit_logs entry and a user bell notification.
//  Returns { ok, rewardId, expiryBeforeReversal, expiryAfterReversal } or
//          { ok:false, error, alreadyReversed? }.
// -----------------------------------------------------------------------------
export async function reverseReferralReward(db, rewardId, { adminId = null, reason = '', trigger = 'manual' } = {}) {
  if (!rewardId) return { ok: false, error: 'missing-reward-id' }
  const reward = await db.collection('referral_rewards').findOne({ id: rewardId })
  if (!reward) return { ok: false, error: 'reward-not-found' }
  if (reward.reversed) return { ok: false, error: 'already-reversed', alreadyReversed: true }

  const referrer = await db.collection('users').findOne({ id: reward.userId })
  const now = new Date()
  const curSub = referrer?.subscription || null
  const expiryBeforeReversal = curSub?.expiryDate ? new Date(curSub.expiryDate) : null
  let expiryAfterReversal = expiryBeforeReversal

  if (reward.rewardDays > 0 && expiryBeforeReversal) {
    expiryAfterReversal = new Date(expiryBeforeReversal.getTime() - reward.rewardDays * 86400000)
    const setFields = { 'subscription.expiryDate': expiryAfterReversal }
    // If subtracting the reward days drops the expiry to/under "now", the
    // subscription is effectively lapsed → reflect that in status.
    if (expiryAfterReversal <= now) setFields['subscription.status'] = 'expired'
    await db.collection('users').updateOne({ id: reward.userId }, { $set: setFields })
  }

  // Idempotency guard also enforced at write-time via { reversed: { $ne: true } }.
  const upd = await db.collection('referral_rewards').updateOne(
    { id: rewardId, reversed: { $ne: true } },
    { $set: {
        reversed: true,
        reversedAt: now,
        reversedBy: adminId,
        reversalReason: reason || '',
        reversalTrigger: trigger,
        expiryBeforeReversal,
        expiryAfterReversal,
      } },
  )
  if (upd.modifiedCount === 0) return { ok: false, error: 'already-reversed', alreadyReversed: true }

  await db.collection('referral_audit_logs').insertOne({
    id: uuidv4(), event: 'reward-reversed', userId: reward.userId, campaignId: reward.campaignId,
    details: {
      rewardId, milestone: reward.milestoneCount, rewardDays: reward.rewardDays,
      trigger, reason: reason || '', adminId, expiryBeforeReversal, expiryAfterReversal,
    }, at: now,
  })

  await createNotification(db, reward.userId, {
    type: 'reward_reversed',
    title: `Referral reward reversed: ${reward.milestoneLabel || 'Reward'}`,
    message: reward.rewardDays > 0
      ? `A referral reward of ${reward.rewardDays} days was reversed because a referred teacher's subscription was refunded or lapsed.`
      : `A referral reward was reversed.`,
    meta: {
      rewardId, milestoneCount: reward.milestoneCount, rewardDays: reward.rewardDays || 0,
      trigger, expiryBeforeReversal, expiryAfterReversal,
    },
  })

  return { ok: true, rewardId, milestoneCount: reward.milestoneCount, rewardDays: reward.rewardDays || 0, expiryBeforeReversal, expiryAfterReversal }
}

// -----------------------------------------------------------------------------
//  Auto-clawback helper: a referred user just lost their active subscription
//  (admin refund / deactivate / edit-to-inactive).  Recompute the referrer's
//  LIVE qualified count and reverse any still-active reward whose milestone the
//  referrer no longer meets.  Idempotent + fully reuses reverseReferralReward.
//  Returns { ok, qualifiedNow, reversed:[...] }.
// -----------------------------------------------------------------------------
export async function reverseRewardsForLapsedReferral(db, referredUserId, { adminId = null, reason = 'referred-user-lapsed' } = {}) {
  const referred = await db.collection('users').findOne({ id: referredUserId })
  if (!referred || !referred.referredBy) return { ok: true, qualifiedNow: null, reversed: [] }
  const referrer = await db.collection('users').findOne({ id: referred.referredBy })
  if (!referrer) return { ok: true, qualifiedNow: null, reversed: [] }

  const stats = await computeReferralStats(db, referrer)
  const campaign = stats.campaign
  // STEP 2: clawback basis matches the reward-giving count.
  //  • Ladder OFF → all-time ever-paid X (drops ONLY when a payment is refunded,
  //    so a mere plan expiry / deactivation never claws a reward back).
  //  • Ladder ON  → stats.qualified (old behaviour).
  const ladderOn = await isContinuousLadderOn(db)
  const qualifiedNow = await getRewardEvalCount(db, referrer, ladderOn)

  const activeRewards = await db.collection('referral_rewards')
    .find({ userId: referrer.id, ...(campaign ? { campaignId: campaign.id } : {}), reversed: { $ne: true } })
    .toArray()
  // Reverse rewards for milestones the referrer no longer satisfies.
  const toReverse = activeRewards.filter(r => Number(r.milestoneCount) > qualifiedNow)

  const reversed = []
  for (const r of toReverse) {
    const res = await reverseReferralReward(db, r.id, { adminId, reason, trigger: 'auto-lapse' })
    if (res.ok) reversed.push(res)
  }
  return { ok: true, qualifiedNow, reversed }
}

// -----------------------------------------------------------------------------
//  STEP 2 · P2 — SWITCH-OFF PREVIEW (read-only "what-if").
//  Projects exactly which one-time rewards would be granted the moment an admin
//  flips the Continuous ladder OFF — using the unified all-time X count and
//  honouring grandfathering (a milestone already in referral_rewards is never
//  re-granted). PURE READ: writes nothing, sends nothing.
//  Returns { ambassadorThreshold, teacherCount, totalFreeDays, ambassadorCount,
//            rows:[{ name, mobileLast4, X, milestone, newMilestones, freeDays,
//                    becomesAmbassador }] }.
// -----------------------------------------------------------------------------
export async function computeSwitchOffPreview(db, { limit = 1000 } = {}) {
  const { getMilestoneConfig, computeAllReferrerCounts } = await import('./referral-milestone.js')
  const cfg = await getMilestoneConfig(db)
  const ambThreshold = Math.max(1, parseInt(cfg?.ambassadorRequiredReferrals, 10) || 500)
  const offMilestones = [...MILESTONES_LADDER_OFF].sort((a, b) => a.count - b.count) // 5/15/30/50/100
  const minCount = offMilestones[0]?.count || 5

  const campaign = await getActiveCampaign(db)
  const campaignId = campaign?.id || DEFAULT_CAMPAIGN.id

  // ONE aggregation for every referrer's ever-paid count (no per-user loops).
  const { map } = await computeAllReferrerCounts(db)
  const qualifying = [...map.entries()].filter(([, v]) => v.count >= minCount || v.count >= ambThreshold)
  const ids = qualifying.map(([id]) => id)

  // Batch: already-granted milestones + names, in one query each.
  const earnedByUser = {}
  if (ids.length) {
    const rw = await db.collection('referral_rewards').find({ userId: { $in: ids }, campaignId }).project({ _id: 0, userId: 1, milestoneCount: 1 }).toArray()
    for (const r of rw) { (earnedByUser[r.userId] = earnedByUser[r.userId] || new Set()).add(r.milestoneCount) }
  }
  const users = ids.length ? await db.collection('users').find({ id: { $in: ids } }).project({ _id: 0, id: 1, name: 1, mobile: 1 }).toArray() : []
  const byId = Object.fromEntries(users.map(u => [u.id, u]))

  const rows = []
  let totalFreeDays = 0, ambassadorCount = 0
  const byDays = { 30: 0, 90: 0, 180: 0, 365: 0 }
  for (const [rid, v] of qualifying) {
    const X = v.count || 0
    const isAmbassador = X >= ambThreshold
    const earnedCounts = earnedByUser[rid] || new Set()
    const wouldGrant = offMilestones.filter(m => X >= m.count && !earnedCounts.has(m.count))
    const days = wouldGrant.reduce((a, m) => a + (m.rewardDays || 0), 0)
    if (wouldGrant.length === 0 && !isAmbassador) continue
    if (isAmbassador) ambassadorCount++
    totalFreeDays += days
    for (const m of wouldGrant) { if (byDays[m.rewardDays] != null) byDays[m.rewardDays]++ }
    rows.push({
      userId: rid,
      name: byId[rid]?.name || 'Teacher',
      mobileLast4: String(byId[rid]?.mobile || '').replace(/\D/g, '').slice(-4),
      X,
      milestone: wouldGrant.length ? wouldGrant[wouldGrant.length - 1].count : null,
      newMilestones: wouldGrant.map(m => m.count),
      freeDays: days,
      wouldGet: (wouldGrant.map(m => `${m.count}→${m.rewardDays}d`).join(', ') || '—') + (isAmbassador ? ' + Ambassador' : ''),
      becomesAmbassador: isAmbassador,
    })
  }
  rows.sort((a, b) => b.X - a.X)
  return { ambassadorThreshold: ambThreshold, teacherCount: rows.length, totalFreeDays, ambassadorCount, byDays, rows: rows.slice(0, limit), calculatedAt: new Date().toISOString() }
}

// Convenience: total qualified count only (fast path for badges).
export async function getQualifiedCount(db, referrerId) {
  const r = await db.collection('users').findOne({ id: referrerId })
  const s = await computeReferralStats(db, r)
  return s.qualified
}

// Leaderboard: top N referrers by qualified count.
export async function getLeaderboard(db, limit = 20) {
  const campaign = await getActiveCampaign(db)
  if (!campaign || !campaign.showLeaderboard) return []
  const referrers = await db.collection('users').find({ referralCode: { $exists: true } })
    .project({ _id: 0, id: 1, name: 1, referralCode: 1, mobile: 1 })
    .toArray()
  const rows = []
  for (const r of referrers) {
    const s = await computeReferralStats(db, r)
    if (s.qualified === 0) continue
    rows.push({
      userId: r.id,
      name: r.name || 'Teacher',
      qualified: s.qualified,
      total: s.total,
    })
  }
  rows.sort((a, b) => b.qualified - a.qualified)
  return rows.slice(0, limit)
}
