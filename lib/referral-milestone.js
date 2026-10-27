// ============================================================================
//  lib/referral-milestone.js  — Phase 3: 500-referral MILESTONE (separate from
//  the existing referral engine / stats.qualified, which stays untouched).
//
//  NEW count rule (confirmed with product owner):
//   • A referral counts when the referred teacher has EVER made a successful
//     paid Premium purchase — so the count does NOT drop when their plan later
//     expires. (Different from engine's stats.qualified, which needs a CURRENTLY
//     active sub. We DO NOT modify the old count.)
//   • Anti-fraud blocks: self-referral, same mobile as referrer, same email as
//     referrer, and duplicate mobile/email among the referred set (counted once).
//   • NOT feasible today (reported to admin): payment-account (UPI/card) dedupe
//     — the payments collection stores no VPA/card fingerprint; and device dedupe
//     — no device id is stored on users. The admin screen surfaces a fraud
//     summary for the signals we CAN see (duplicate mobile/email clusters).
//
//  "Paid Premium purchase" detection:
//   • payments: { status:'success' } that is NOT an add-on product
//     (ai-credits / answer_key_bundle / ajira-addon). Premium plan orders carry
//     no `product` tag, so $nin matches them (and missing-field docs).
//   • qrSubscriptionPayments: { status:'VERIFIED' } (manual UPI plan payments).
// ============================================================================
import { v4 as uuidv4 } from 'uuid'

const NON_PREMIUM_PRODUCTS = ['ai-credits', 'answer_key_bundle', 'ajira-addon', 'ajira', 'ai_credits']

const norm = (x) => String(x || '').replace(/\D/g, '').slice(-10)
const lower = (x) => String(x || '').trim().toLowerCase()

// Plans that represent a REAL paid Premium plan. Excludes the free tier AND the
// partner/combo grant (toolkit_combo = granted free via Teacher Utility Toolkit).
const FREE_GRANT_PLANS = ['', 'free', 'none', 'null', 'toolkit_combo', 'combo', 'trial']
const planIsPaid = (plan) => !FREE_GRANT_PLANS.includes(lower(plan))
// Subscription "source" values that mean the Premium was given FREE (never real money).
const FREE_GRANT_SOURCES = ['admin', 'admin_grant', 'admin-grant', 'admin_bonus', 'admin_ui', 'admin-grant-bulk', 'bulk_bonus', 'bonus', 'referral', 'referral-reward', 'referral_reward', 'reward', 'partner', 'partner_grant', 'toolkit', 'combo', 'trial', 'coupon', 'free', 'gift', 'manual']
const PAID_SUB_STATUSES = ['active', 'expired', 'cancelled', 'canceled', 'paused', 'grace', 'on-hold', 'on_hold', 'past_due']
const subMoneyId = (sub) => sub?.paymentId || sub?.razorpay_payment_id || sub?.razorpayPaymentId || sub?.orderId || sub?.razorpay_order_id || sub?.lastPaymentId || null

// REAL-money evidence purely from the user doc (NO db call). A referred teacher
// counts ONLY with proof of real money: a paid plan (not free/combo), NOT a free
// grant source, AND a positive amount or a payment/order id on the subscription.
// Free grants (admin/referral/partner/trial/coupon) and Rs0 are excluded.
export function subDocPaid(user) {
  if (!user) return false
  const sub = user.subscription || {}
  if (!planIsPaid(sub.plan)) return false
  if (FREE_GRANT_SOURCES.includes(lower(sub.source))) return false
  if (!PAID_SUB_STATUSES.includes(lower(sub.status)) && !sub.expiryDate && !sub.startDate) return false
  const amt = Number(sub.amount ?? sub.pricePaid ?? sub.paidAmount ?? 0)
  return amt > 0 || !!subMoneyId(sub)
}
// A paid-looking OLD subscription with NO way to tell if money changed hands
// (paid plan + active/expired, but no amount, no payment id, no free-grant tag,
// and no payments/QR row). Reported as a COUNT only — NOT counted as paid.
export function subDocAmbiguous(user) {
  const sub = user?.subscription || {}
  if (!planIsPaid(sub.plan)) return false
  if (FREE_GRANT_SOURCES.includes(lower(sub.source))) return false
  if (!PAID_SUB_STATUSES.includes(lower(sub.status)) && !sub.expiryDate) return false
  const amt = Number(sub.amount ?? sub.pricePaid ?? sub.paidAmount ?? 0)
  return !(amt > 0) && !subMoneyId(sub)
}

// Per-referrer REAL-paid counts + source breakdown in ONE aggregation (joins
// payments + verified QR). Returns { map, totals }. Deduped by phone, no self.
export async function computeAllReferrerCounts(d) {
  const rows = await d.collection('users').aggregate([
    { $match: { referredBy: { $type: 'string' } } },
    { $match: { $expr: { $ne: ['$referredBy', '$id'] } } },
    { $lookup: { from: 'payments', let: { uid: '$id' }, as: '_pay', pipeline: [
      { $match: { $expr: { $and: [
        { $eq: ['$userId', '$$uid'] },
        { $in: [{ $toLower: { $toString: { $ifNull: ['$status', ''] } } }, ['success', 'paid', 'captured', 'completed']] },
        { $ne: ['$refunded', true] },
        { $gt: [{ $toDouble: { $ifNull: ['$amount', 0] } }, 0] },
        { $not: [{ $in: [{ $ifNull: ['$product', ''] }, NON_PREMIUM_PRODUCTS] }] },
      ] } } }, { $limit: 1 },
    ] } },
    { $lookup: { from: 'qrSubscriptionPayments', let: { uid: '$id' }, as: '_qr', pipeline: [
      { $match: { $expr: { $and: [
        { $eq: ['$userId', '$$uid'] },
        { $in: [{ $toLower: { $toString: { $ifNull: ['$status', ''] } } }, ['verified', 'approved']] },
        { $ne: ['$refunded', true] },
      ] } } }, { $limit: 1 },
    ] } },
    { $addFields: {
      _hasPay: { $gt: [{ $size: '$_pay' }, 0] },
      _hasQr: { $gt: [{ $size: '$_qr' }, 0] },
      _plan: { $toLower: { $toString: { $ifNull: ['$subscription.plan', ''] } } },
      _status: { $toLower: { $toString: { $ifNull: ['$subscription.status', ''] } } },
      _src: { $toLower: { $toString: { $ifNull: ['$subscription.source', ''] } } },
      _amt: { $toDouble: { $ifNull: ['$subscription.amount', { $ifNull: ['$subscription.pricePaid', { $ifNull: ['$subscription.paidAmount', 0] }] }] } },
      _payId: { $ifNull: ['$subscription.paymentId', { $ifNull: ['$subscription.razorpay_payment_id', { $ifNull: ['$subscription.orderId', { $ifNull: ['$subscription.razorpay_order_id', null] }] }] }] },
      _m: { $ifNull: ['$mobile', '$id'] },
    } },
    { $addFields: {
      _paidPlan: { $and: [{ $not: [{ $in: ['$_plan', FREE_GRANT_PLANS] }] }, { $in: ['$_status', PAID_SUB_STATUSES] }] },
      _freeSrc: { $in: ['$_src', FREE_GRANT_SOURCES] },
      _subMoney: { $or: [{ $gt: ['$_amt', 0] }, { $ne: ['$_payId', null] }] },
    } },
    { $addFields: {
      _subReal: { $and: ['$_paidPlan', '$_subMoney', { $not: ['$_freeSrc'] }] },
    } },
    { $addFields: {
      _real: { $or: ['$_hasPay', '$_hasQr', '$_subReal'] },
      _amb: { $and: ['$_paidPlan', { $not: ['$_hasPay'] }, { $not: ['$_hasQr'] }, { $not: ['$_subMoney'] }, { $not: ['$_freeSrc'] }] },
      _free: { $and: ['$_paidPlan', '$_freeSrc', { $not: ['$_hasPay'] }, { $not: ['$_hasQr'] }] },
      _active: { $eq: ['$_status', 'active'] },
    } },
    { $group: { _id: { ref: '$referredBy', m: '$_m' },
      real: { $max: { $cond: ['$_real', 1, 0] } },
      amb: { $max: { $cond: ['$_amb', 1, 0] } },
      free: { $max: { $cond: ['$_free', 1, 0] } },
      active: { $max: { $cond: ['$_active', 1, 0] } },
      viaPay: { $max: { $cond: ['$_hasPay', 1, 0] } },
      viaQr: { $max: { $cond: [{ $and: ['$_hasQr', { $not: ['$_hasPay'] }] }, 1, 0] } },
      viaSub: { $max: { $cond: [{ $and: ['$_subReal', { $not: ['$_hasPay'] }, { $not: ['$_hasQr'] }] }, 1, 0] } },
    } },
    { $group: { _id: '$_id.ref',
      count: { $sum: '$real' }, ambiguous: { $sum: '$amb' }, excludedFree: { $sum: '$free' }, active: { $sum: '$active' },
      viaPay: { $sum: '$viaPay' }, viaQr: { $sum: '$viaQr' }, viaSub: { $sum: '$viaSub' } } },
  ], { allowDiskUse: true }).toArray()
  const map = new Map()
  const totals = { everPaid: 0, active: 0, ambiguous: 0, excludedFree: 0, viaPay: 0, viaQr: 0, viaSub: 0 }
  for (const r of rows) {
    if (!r._id) continue
    totals.everPaid += r.count; totals.active += r.active; totals.ambiguous += r.ambiguous
    totals.excludedFree += r.excludedFree; totals.viaPay += r.viaPay; totals.viaQr += r.viaQr; totals.viaSub += r.viaSub
    if (r.count > 0 || r.ambiguous > 0) map.set(r._id, { count: r.count, active: r.active, ambiguous: r.ambiguous })
  }
  return { map, totalEverPaid: totals.everPaid, totalActive: totals.active, totals }
}


export const DEFAULT_MILESTONE_CONFIG = {
  popupV2: false,              // REFERRAL_POPUP_V2 master switch (default OFF = old behaviour)
  milestoneEnabled: true,
  target: 500,
  // STEP 2: referral count X at which a teacher becomes an Ambassador (₹99/yr
  // plan + recharge + gift + District Head). Admin-editable, default 500.
  ambassadorRequiredReferrals: 500,
  rechargeLimit: 'up to ₹2,999',
  referralBaseUrl: 'https://lessonguruodisha.com',
  rewards: {
    recharge:     { enabled: true, title: '1 ବର୍ଷ Mobile Recharge', subtitle: 'ସମ୍ପୂର୍ଣ୍ଣ FREE' },
    gift:         { enabled: true, title: 'Gift Hamper',               subtitle: 'ଆପଣଙ୍କ ପାଇଁ ବିଶେଷ ଉପହାର' },
    districtHead: { enabled: true, title: 'District Head',            subtitle: 'LessonGuru Platform' },
  },
}

export async function getMilestoneConfig(d) {
  const row = await d.collection('settings').findOne({ key: 'referral_milestone_config' })
  const v = row?.value || {}
  const g = v.rewards?.gift || {}
  // Auto-migrate the OLD gift wording to the approved "Gift Hamper" copy, so a
  // previously-saved "Surprise Gift Box" value is upgraded without a manual DB
  // edit. A genuinely custom admin value (anything else) is left untouched.
  const giftTitle = (!g.title || g.title === 'Surprise Gift Box') ? 'Gift Hamper' : g.title
  const giftSubtitle = (!g.subtitle || g.subtitle === 'ଖୋଲିଲେ ଜାଣିବେ!') ? 'ଆପଣଙ୍କ ପାଇଁ ବିଶେଷ ଉପହାର' : g.subtitle
  return {
    ...DEFAULT_MILESTONE_CONFIG,
    ...v,
    rewards: {
      recharge:     { ...DEFAULT_MILESTONE_CONFIG.rewards.recharge,     ...(v.rewards?.recharge || {}) },
      gift:         { ...DEFAULT_MILESTONE_CONFIG.rewards.gift,         ...g, title: giftTitle, subtitle: giftSubtitle },
      districtHead: { ...DEFAULT_MILESTONE_CONFIG.rewards.districtHead, ...(v.rewards?.districtHead || {}) },
    },
  }
}

export async function saveMilestoneConfig(d, patch = {}) {
  const current = await getMilestoneConfig(d)
  const next = {
    ...current,
    ...patch,
    rewards: {
      recharge:     { ...current.rewards.recharge,     ...(patch.rewards?.recharge || {}) },
      gift:         { ...current.rewards.gift,         ...(patch.rewards?.gift || {}) },
      districtHead: { ...current.rewards.districtHead, ...(patch.rewards?.districtHead || {}) },
    },
  }
  // Coerce
  next.target = Math.max(1, parseInt(next.target, 10) || 500)
  next.ambassadorRequiredReferrals = Math.max(1, parseInt(next.ambassadorRequiredReferrals, 10) || 500)
  next.popupV2 = !!next.popupV2
  next.milestoneEnabled = !!next.milestoneEnabled
  await d.collection('settings').updateOne(
    { key: 'referral_milestone_config' },
    { $set: { key: 'referral_milestone_config', value: next, updatedAt: new Date() } },
    { upsert: true },
  )
  return next
}

// Has this user EVER paid for Premium (not an add-on)? Never drops on expiry.
// A payment that has been marked refunded (refunded:true) no longer counts.
async function everPaidPremium(d, user) {
  // 1) Fast path — the user doc already proves Premium (matches OLD admin source).
  if (subDocPaid(user)) return { paid: true, via: 'subscription', ref: user?.subscription?.plan || 'sub' }
  // 2) Fallback — a success payment or verified QR (covers edge cases / legacy rows
  //    where the embedded subscription wasn't written).
  const pay = await d.collection('payments').findOne({
    userId: user.id,
    $or: [{ status: { $in: ['success', 'paid', 'captured', 'completed', 'SUCCESS', 'Success', 'Captured', 'Paid'] } }, { paid: true }],
    product: { $nin: NON_PREMIUM_PRODUCTS },
    refunded: { $ne: true },
    amount: { $gt: 0 },
  })
  if (pay) return { paid: true, via: 'razorpay', ref: pay.razorpay_order_id || pay.id }
  const qr = await d.collection('qrSubscriptionPayments').findOne({ userId: user.id, status: { $in: ['VERIFIED', 'verified', 'APPROVED', 'approved'] }, refunded: { $ne: true } })
  if (qr) return { paid: true, via: 'qr', ref: qr.utrNumber || qr.transactionId || qr.id }
  return { paid: false }
}

// READ-ONLY: teachers who already earned a 100+ / continuous reward (from the
// old "every +50 = +1 year forever" ladder), plus how close they were to their
// next continuous step (e.g. "140 of 150"). Pure read, for the admin preview.
export async function listContinuousEarners(d, { limit = 50 } = {}) {
  const rewards = await d.collection('referral_rewards')
    .find({ $or: [{ continuous: true }, { milestoneCount: { $gte: 100 } }] })
    .project({ _id: 0, userId: 1, milestoneCount: 1, continuous: 1 })
    .toArray()
  const byUser = {}
  for (const r of rewards) {
    const u = (byUser[r.userId] = byUser[r.userId] || { highest: 0 })
    if ((r.milestoneCount || 0) > u.highest) u.highest = r.milestoneCount || 0
  }
  const ids = Object.keys(byUser)
  let computeReferralStats = null
  try { ({ computeReferralStats } = await import('./referral-engine.js')) } catch (_) {}
  const out = []
  for (const uid of ids) {
    const u = await d.collection('users').findOne({ id: uid }, { projection: { _id: 0, id: 1, name: 1, mobile: 1, email: 1 } })
    if (!u) continue
    let qualified = 0
    if (computeReferralStats) { try { const s = await computeReferralStats(d, u); qualified = s?.qualified || 0 } catch (_) {} }
    const highest = byUser[uid].highest
    // Next continuous step they were tracking towards (next multiple of 50 above
    // both their highest earned reward and their current count).
    const nextStep = Math.max(highest + 50, (Math.floor(qualified / 50) + 1) * 50)
    out.push({
      name: u.name || 'Teacher',
      mobileLast4: String(u.mobile || '').replace(/\D/g, '').slice(-4),
      highestReward: highest,
      qualified,
      nextStep,
    })
  }
  out.sort((a, b) => b.highestReward - a.highestReward || b.qualified - a.qualified)
  return { count: out.length, earners: out.slice(0, limit) }
}


// Compute the milestone count + fraud summary for one referrer.
export async function computeMilestoneReferrals(d, referrer) {
  const empty = { count: 0, qualified: [], fraud: [], fraudAvailable: { paymentAccount: false, device: false } }
  if (!referrer) return empty
  const referred = await d.collection('users')
    .find({ referredBy: referrer.id })
    .project({ _id: 0, id: 1, name: 1, mobile: 1, email: 1, createdAt: 1, subscription: 1, subscriptionExpiry: 1 })
    .toArray()

  const refMobile = norm(referrer.mobile)
  const refEmail = lower(referrer.email)
  const seenMobile = new Map(), seenEmail = new Map()
  const mobileClusters = {}, emailClusters = {}
  let blockedSelf = 0, dupSkipped = 0
  const qualified = []

  for (const u of referred) {
    if (u.id === referrer.id) { blockedSelf++; continue }
    const m = norm(u.mobile), e = lower(u.email)
    if (m && m === refMobile) { blockedSelf++; continue }
    if (e && e === refEmail) { blockedSelf++; continue }
    const pay = await everPaidPremium(d, u)
    if (!pay.paid) continue
    // Duplicate clusters among the referred set → count once.
    if (m) mobileClusters[m] = (mobileClusters[m] || 0) + 1
    if (e) emailClusters[e] = (emailClusters[e] || 0) + 1
    if (m && seenMobile.has(m)) { dupSkipped++; continue }
    if (e && seenEmail.has(e)) { dupSkipped++; continue }
    if (m) seenMobile.set(m, u.id)
    if (e) seenEmail.set(e, u.id)
    qualified.push({ id: u.id, name: u.name || '', via: pay.via })
  }

  const fraud = []
  const dupM = Object.entries(mobileClusters).filter(([, n]) => n > 1)
  const dupE = Object.entries(emailClusters).filter(([, n]) => n > 1)
  if (blockedSelf) fraud.push(`${blockedSelf} self/same-contact referral(s) blocked`)
  if (dupM.length) fraud.push(`${dupM.reduce((a, [, n]) => a + (n - 1), 0)} referral(s) share a phone number (counted once)`)
  if (dupE.length) fraud.push(`${dupE.reduce((a, [, n]) => a + (n - 1), 0)} referral(s) share an email (counted once)`)
  if (!fraud.length) fraud.push('No duplicate phone/email detected')

  return {
    count: qualified.length,
    qualified,
    fraud,
    // Honest capability report for the admin UI.
    fraudAvailable: { paymentAccount: false, device: false },
  }
}

// READ-ONLY milestone preview for admins: top-N referrers by the NEW all-time
// milestone count, alongside the OLD "premium" number (engine stats.qualified =
// referred teachers currently on an active Premium) for side-by-side comparison.
// Pure read — never writes, never sends anything.
export async function listMilestonePreview(d, { target, limit = 20 } = {}) {
  const cfg = await getMilestoneConfig(d)
  const tgt = target || cfg.target
  const { map, totalEverPaid, totalActive } = await computeAllReferrerCounts(d)
  const rows = [...map.entries()].map(([userId, v]) => ({ userId, milestoneCount: v.count, oldPremiumCount: v.active, reached: v.count >= tgt }))
  rows.sort((a, b) => b.milestoneCount - a.milestoneCount)
  const atOrAbove = rows.filter(x => x.milestoneCount >= tgt)
  // Names for the top + at-or-above subset only (one query).
  const idSet = [...new Set([...rows.slice(0, limit), ...atOrAbove].map(x => x.userId))]
  const users = idSet.length ? await d.collection('users').find({ id: { $in: idSet } }).project({ _id: 0, id: 1, name: 1, mobile: 1 }).toArray() : []
  const byId = Object.fromEntries(users.map(u => [u.id, u]))
  const dress = (x) => ({ ...x, name: byId[x.userId]?.name || 'Teacher', mobileLast4: String(byId[x.userId]?.mobile || '').replace(/\D/g, '').slice(-4) })
  return {
    target: tgt,
    totalReferrersWithPaid: rows.length,
    totalEverPaid,
    totalActive,
    top: rows.slice(0, limit).map(dress),
    atOrAboveTarget: atOrAbove.slice(0, 200).map(x => ({ name: byId[x.userId]?.name || 'Teacher', mobileLast4: String(byId[x.userId]?.mobile || '').replace(/\D/g, '').slice(-4), milestoneCount: x.milestoneCount })),
    calculatedAt: new Date().toISOString(),
  }
}

// READ-ONLY "Count check": reconcile the OLD Referrals-admin paid total with the
// NEW milestone total, plus the top-5 referrers with both numbers (names only).
export async function computeCountCheck(d, { topN = 5 } = {}) {
  const { map, totalEverPaid, totalActive, totals } = await computeAllReferrerCounts(d)
  // OLD admin "paid/premium" total = referred users with an ACTIVE sub (no dedupe) —
  // this is exactly what the legacy Referrals admin sums (totalSubscribed).
  const oldAdminActiveTotal = await d.collection('users').countDocuments({ referredBy: { $type: 'string' }, 'subscription.status': 'active' })
  const rows = [...map.entries()].map(([userId, v]) => ({ userId, ever: v.count, active: v.active }))
  rows.sort((a, b) => b.ever - a.ever)
  const top = rows.slice(0, topN)
  const users = top.length ? await d.collection('users').find({ id: { $in: top.map(x => x.userId) } }).project({ _id: 0, id: 1, name: 1 }).toArray() : []
  const byId = Object.fromEntries(users.map(u => [u.id, u]))
  return {
    oldAdminActiveTotal,                      // old admin, active, NOT deduped
    newMilestoneActiveDeduped: totalActive,   // our active (real-paid), deduped by phone
    newMilestoneEverPaid: totalEverPaid,      // our EVER real-paid, deduped by phone
    // Source breakdown of the ever-paid total:
    fromPayments: totals.viaPay,              // has a real Razorpay payments row (amount>0)
    fromQR: totals.viaQr,                     // verified QR payment (no Razorpay row)
    fromOldSubscription: totals.viaSub,       // old sub with a paid plan + amount/payment-id
    // Excluded (NOT counted as paid):
    excludedFreeGrants: totals.excludedFree,  // admin/referral/partner/trial/coupon free Premium
    ambiguousOldRecords: totals.ambiguous,    // paid-looking old sub, NO way to confirm real money
    refundedExcluded: 'yes',                  // refunds are skipped everywhere
    top: top.map(x => ({ name: byId[x.userId]?.name || 'Teacher', oldPremium: x.active, newMilestone: x.ever })),
    calculatedAt: new Date().toISOString(),
  }
}

export async function markMilestoneReward(d, { userId, reward, action, note = '', reason = '', adminId, adminName }) {
  const REWARDS = ['recharge', 'gift', 'districtHead']
  if (!userId || !REWARDS.includes(reward)) return { ok: false, error: 'bad-request' }
  const col = d.collection('referral_milestone_marks')
  let doc = await col.findOne({ userId })
  if (!doc) {
    doc = { id: uuidv4(), userId, recharge: null, gift: null, districtHead: null, history: [] }
    await col.insertOne(doc)
  }
  const now = new Date()
  if (action === 'give') {
    if (doc[reward]?.given) return { ok: false, error: 'already-given' } // no double-mark
    const mark = { given: true, by: adminId, byName: adminName || '', at: now, note: String(note || '').slice(0, 300) }
    await col.updateOne({ userId }, {
      $set: { [reward]: mark },
      $push: { history: { reward, action: 'give', by: adminId, byName: adminName || '', at: now, note: mark.note } },
    })
    await d.collection('referral_audit_logs').insertOne({
      id: uuidv4(), event: 'milestone-reward-given', userId, details: { reward, note: mark.note, adminId }, at: now,
    })
    return { ok: true, reward, mark }
  }
  if (action === 'undo') {
    if (!doc[reward]?.given) return { ok: false, error: 'not-given' }
    if (!reason) return { ok: false, error: 'reason-required' }
    await col.updateOne({ userId }, {
      $set: { [reward]: null },
      $push: { history: { reward, action: 'undo', by: adminId, byName: adminName || '', at: now, reason: String(reason).slice(0, 300) } },
    })
    await d.collection('referral_audit_logs').insertOne({
      id: uuidv4(), event: 'milestone-reward-undo', userId, details: { reward, reason, adminId }, at: now,
    })
    return { ok: true, reward, undone: true }
  }
  return { ok: false, error: 'bad-action' }
}

// List users who REACHED the milestone target (for the admin approval screen).
export async function listMilestoneReached(d, { target } = {}) {
  const cfg = await getMilestoneConfig(d)
  const tgt = target || cfg.target
  const { map } = await computeAllReferrerCounts(d)
  // Only referrers already AT/ABOVE the target (usually a tiny set) get detailed.
  const qualifying = [...map.entries()].filter(([, v]) => v.count >= tgt)
  const out = []
  for (const [rid, v] of qualifying) {
    const referrer = await d.collection('users').findOne({ id: rid }, { projection: { _id: 0, id: 1, name: 1, mobile: 1, email: 1, districtHead: 1, district: 1 } })
    if (!referrer) continue
    const r = await computeMilestoneReferrals(d, referrer)  // exact deduped count + fraud summary
    if (r.count < tgt) continue
    const marks = await d.collection('referral_milestone_marks').findOne({ userId: rid }, { projection: { _id: 0 } })
    out.push({
      userId: rid,
      name: referrer.name || 'Teacher',
      mobileMasked: String(referrer.mobile || '').replace(/(\d{2})\d{4}(\d{2,})/, '$1****$2'),
      count: r.count,
      fraud: r.fraud,
      fraudAvailable: r.fraudAvailable,
      marks: marks || { recharge: null, gift: null, districtHead: null, history: [] },
      districtHead: !!referrer.districtHead,
      district: referrer.district || null,
    })
  }
  out.sort((a, b) => b.count - a.count)
  return { target: tgt, reached: out, calculatedAt: new Date().toISOString() }
}
