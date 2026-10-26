// ---------------------------------------------------------------------------
//  Plan pricing engine — computes RENEWAL / UPGRADE / DOWNGRADE / NEW-purchase
//  quotes for the LessonGuru Odisha subscription flow.
//
//  Design rules (per PRD):
//    1. Same plan as current active sub          → RENEWAL, charge full price.
//    2. Higher-priced plan while active          → UPGRADE, charge (new − current).
//    3. Lower-priced plan while active           → DOWNGRADE, schedule after
//                                                   expiry, do NOT charge now.
//    4. No active sub                            → NEW purchase, charge full.
//  Never allow zero-cost renewals.  Never allow negative upgrade prices.
//  Never allow abuse by repeatedly renewing the same plan (safeguard: only
//  proceed if the current sub has > 0 remaining days; else treat as NEW).
// ---------------------------------------------------------------------------

/** Extract the currently-active OFFER (if any) that applies to a plan.
 *
 * Resolution order (highest priority wins):
 *   1. **Plan-attached offer** — inline offer on the plan itself (Admin → 💎 Plans)
 *   2. **Global offer**        — campaign from the offers collection (Admin → 🔥 Offers)
 *
 * A plan-attached offer must be `enabled` AND currently within its time window.
 * When date bounds are missing they are treated as ∞ (always valid).
 */
export async function getActiveOffer(d, planId, planObj = null) {
  const now = new Date()

  // 1) Plan-attached offer (winner if valid).  Accepts the plan object either
  //    passed in directly or looked up from settings.
  let plan = planObj
  if (!plan) {
    const doc = await d.collection('settings').findOne({ key: 'plans' })
    if (doc?.value?.length) plan = doc.value.find(p => p.id === planId) || null
  }
  const po = plan?.offer
  if (po && po.enabled) {
    const startsOk = !po.startsAt || new Date(po.startsAt) <= now
    const endsOk   = !po.endsAt   || new Date(po.endsAt)   >  now
    if (startsOk && endsOk && Number(po.discountValue) > 0) {
      return {
        id: `plan_${planId}`,          // synthetic id (namespaced) so analytics can differentiate
        source: 'plan',                 // marker so callers can spot this
        name: po.name || 'Plan Offer',
        badge: po.name || '💎 Special Offer',
        startsAt: po.startsAt || null,
        endsAt:   po.endsAt   || null,
        discountType:  po.discountType || 'percent',
        discountValue: Number(po.discountValue) || 0,
        autoHighlight: !!po.autoHighlight,
        applicablePlanIds: [planId],
        status: 'active',
      }
    }
  }

  // 2) Global offers (existing behaviour).
  const offers = await d.collection('offers').find({
    status: 'active',
    startsAt: { $lte: now },
    endsAt: { $gt: now },
  }).sort({ priority: -1, createdAt: -1 }).toArray()
  for (const o of offers) {
    const ap = Array.isArray(o.applicablePlanIds) ? o.applicablePlanIds : []
    if (!ap.length || ap.includes(planId)) return { ...o, source: 'global' }
  }
  return null
}

/** Given a plan and an offer, compute the ₹ off applied to the plan price. */
export function computeOfferDiscount(plan, offer) {
  if (!offer || !plan) return 0
  const price = Number(plan.price || 0)
  if (offer.discountType === 'percent') {
    const pct = Math.max(0, Math.min(100, Number(offer.discountValue || 0)))
    return Math.floor((price * pct) / 100)
  }
  if (offer.discountType === 'fixed') {
    return Math.max(0, Math.min(price, Number(offer.discountValue || 0)))
  }
  return 0
}

/** Resolve the offer that actually applies to a plan, mirroring getActiveOffer()'s
 *  precedence (plan-attached wins, else global-if-applicable). Pure + synchronous
 *  so the CLIENT Premium page can compute the SAME price the checkout will charge. */
export function resolvePlanOffer(plan, globalOffer, now = Date.now()) {
  if (!plan) return null
  const po = plan.offer
  if (po && po.enabled) {
    const startsOk = !po.startsAt || new Date(po.startsAt).getTime() <= now
    const endsOk   = !po.endsAt   || new Date(po.endsAt).getTime()   >  now
    if (startsOk && endsOk && Number(po.discountValue) > 0) {
      return {
        source: 'plan',
        name: po.name || 'Plan Offer',
        discountType: po.discountType || 'percent',
        discountValue: Number(po.discountValue) || 0,
        applicablePlanIds: [plan.id],
        endsAt: po.endsAt || null,
      }
    }
  }
  if (globalOffer) {
    const ap = Array.isArray(globalOffer.applicablePlanIds) ? globalOffer.applicablePlanIds : []
    const applies = !ap.length || ap.includes(plan.id)
    const startsOk = !globalOffer.startsAt || new Date(globalOffer.startsAt).getTime() <= now
    const endsOk   = !globalOffer.endsAt   || new Date(globalOffer.endsAt).getTime()   >  now
    if (applies && startsOk && endsOk) return globalOffer
  }
  return null
}

/** THE single source of truth for "what a teacher pays" for a plan bought fresh
 *  or renewed (no upgrade proration). Display MUST use this so the shown price
 *  always equals the charged price. Mirrors buildQuote()'s new/renew amount
 *  exactly: max(₹1, sellingPrice − offerDiscount). `offer` must already be the
 *  resolved offer for this plan (see resolvePlanOffer / getActiveOffer). */
export function getFinalPrice(plan, offer) {
  const price = Math.max(0, Number(plan?.price || 0))
  const discount = computeOfferDiscount(plan, offer)
  return Math.max(1, price - discount)
}

/** Determine whether the user has an ACTIVE subscription with remaining days. */
export function isCurrentlyActive(user) {
  const sub = user?.subscription
  if (!sub || sub.status !== 'active') return false
  const exp = sub.expiryDate ? new Date(sub.expiryDate) : null
  if (!exp) return false
  return exp.getTime() > Date.now()
}

/**
 * Build a `Quote` for the intended plan purchase.
 *
 * @param {object}   opts
 * @param {object}   opts.user            - Fresh user document (with subscription)
 * @param {object}   opts.plan            - Target plan (id, name, price, days)
 * @param {object[]} opts.allPlans        - All available plans (to find current)
 * @param {object|null} opts.offer        - Active offer for this plan (or null)
 * @returns {object}                      - Quote object safe to return to client
 */
export function buildQuote({ user, plan, allPlans, offer }) {
  if (!plan) throw new Error('plan is required')
  const planPrice = Math.max(0, Number(plan.price || 0))
  const active = isCurrentlyActive(user)
  const currentPlanId = user?.subscription?.plan || null
  const currentPlan = active && currentPlanId ? (allPlans || []).find(p => p.id === currentPlanId) : null
  const currentPrice = currentPlan ? Number(currentPlan.price || 0) : 0

  // Offer discount pre-computed once — applied to renewal / new / upgrade
  // but NOT to downgrade (downgrade never charges).
  const offerDiscount = computeOfferDiscount(plan, offer)
  const offerMeta = offer ? {
    id: offer.id, name: offer.name || 'Special Offer',
    badge: offer.badge || null, endsAt: offer.endsAt,
    discountType: offer.discountType, discountValue: offer.discountValue,
    autoHighlight: offer.autoHighlight || false,
  } : null

  // --- 1) Not currently active → simple NEW purchase (full price, offer applied)
  if (!active) {
    const amount = getFinalPrice(plan, offer)   // single source of truth · never ₹0
    return {
      action: 'new',
      planId: plan.id, planName: plan.name, planPrice,
      currentPlanId: null, currentPlanPrice: 0,
      offerDiscount, offer: offerMeta,
      amount,
      savings: offerDiscount,
      activatesOn: 'immediate',
      newValidityDays: plan.days,
      message: offerDiscount > 0
        ? `Get ${plan.name} for ₹${amount} (Save ₹${offerDiscount}).`
        : `Buy ${plan.name} for ₹${amount}.`,
      canPurchase: true,
    }
  }

  // --- 2) Same plan as current active sub → RENEWAL, charge full price
  if (currentPlanId === plan.id) {
    const amount = getFinalPrice(plan, offer)   // single source of truth · never ₹0
    return {
      action: 'renew',
      planId: plan.id, planName: plan.name, planPrice,
      currentPlanId, currentPlanPrice: currentPrice,
      offerDiscount, offer: offerMeta,
      amount,
      savings: offerDiscount,
      activatesOn: 'stack-on-expiry',
      currentExpiryDate: user.subscription.expiryDate,
      newValidityDays: plan.days,
      message: offerDiscount > 0
        ? `Renew ${plan.name} for ₹${amount} (Save ₹${offerDiscount}). Adds ${plan.days} more days on top of your existing subscription.`
        : `Renew ${plan.name} for ₹${amount}. Adds ${plan.days} more days on top of your existing subscription.`,
      canPurchase: true,
    }
  }

  // --- 3) Higher-priced plan while active → UPGRADE (simple diff)
  if (planPrice > currentPrice) {
    const rawUpgrade = planPrice - currentPrice
    // Apply offer to the upgrade amount too so campaigns stay honest.
    const amount = Math.max(1, rawUpgrade - offerDiscount)
    return {
      action: 'upgrade',
      planId: plan.id, planName: plan.name, planPrice,
      currentPlanId, currentPlanPrice: currentPrice, currentPlanName: currentPlan?.name || '',
      offerDiscount, offer: offerMeta,
      amount,
      upgradeDelta: rawUpgrade,
      savings: currentPrice + offerDiscount,   // shown as “You already paid ₹X — plus offer ₹Y off”
      activatesOn: 'immediate',
      newValidityDays: plan.days,
      currentExpiryDate: user.subscription.expiryDate,
      message: offerDiscount > 0
        ? `Upgrade to ${plan.name} for just ₹${amount} (₹${rawUpgrade} upgrade − ₹${offerDiscount} offer).`
        : `Upgrade to ${plan.name} for just ₹${amount} — you save ₹${currentPrice} from your current plan.`,
      canPurchase: true,
    }
  }

  // --- 4) Lower-priced plan while active → DOWNGRADE (schedule, no charge)
  return {
    action: 'downgrade',
    planId: plan.id, planName: plan.name, planPrice,
    currentPlanId, currentPlanPrice: currentPrice, currentPlanName: currentPlan?.name || '',
    offerDiscount: 0, offer: null,
    amount: 0,
    savings: 0,
    activatesOn: user.subscription.expiryDate,           // starts AFTER current expiry
    newValidityDays: plan.days,
    currentExpiryDate: user.subscription.expiryDate,
    message: `Your current ${currentPlan?.name || 'plan'} runs until ${new Date(user.subscription.expiryDate).toDateString()}.  ${plan.name} will activate automatically after that date.`,
    canPurchase: true,                                    // "purchase" = scheduling (no payment)
    scheduleOnly: true,
  }
}

// ---------------------------------------------------------------------------
//  Applies the resulting Quote to the user + payment records — used by the
//  Razorpay verify endpoint after payment succeeds, and by /subscribe (mocked).
//    - new / renew / upgrade  → activate immediately, extend/reset expiry.
//    - downgrade              → schedule for future activation (no charge now).
// ---------------------------------------------------------------------------
export function computeNextSubscriptionFromQuote(quote, plan) {
  const nowMs = Date.now()
  if (quote.action === 'downgrade') {
    // Schedule downgrade for after current expiry
    return {
      plan: quote.currentPlanId, // keep current plan active until expiry
      status: 'active',
      startDate: null,
      expiryDate: new Date(quote.currentExpiryDate),
      scheduledDowngrade: {
        planId: plan.id,
        activatesAt: new Date(quote.currentExpiryDate),
        days: plan.days,
      },
      activated: false,
    }
  }
  if (quote.action === 'renew') {
    // Stack days on top of existing expiry (never lose remaining days).
    const currentExpiry = quote.currentExpiryDate ? new Date(quote.currentExpiryDate).getTime() : nowMs
    const base = Math.max(nowMs, currentExpiry)
    return {
      plan: plan.id,
      status: 'active',
      startDate: new Date(nowMs),
      expiryDate: new Date(base + plan.days * 86400000),
      activated: true,
      isRenewal: true,
    }
  }
  // 'new' or 'upgrade' — start fresh from today.
  return {
    plan: plan.id,
    status: 'active',
    startDate: new Date(nowMs),
    expiryDate: new Date(nowMs + plan.days * 86400000),
    activated: true,
    isUpgrade: quote.action === 'upgrade',
  }
}
