// ============================================================================
//  lib/ads-audience.js — ad audience (subscriber) gating.
//  Keeps the monolith route lean. Pure, side-effect-free except one settings
//  read. NEVER restricts logged-out visitors or free users — only ACTIVE
//  subscribers can be excluded, and only when the admin opts out (per-ad or
//  via the global master switch).
// ============================================================================

const SETTINGS_KEY = 'ads_show_to_subscribers'

// A user counts as an active subscriber when their subscription is active/trial
// and not past its expiry date. Everyone else (free, expired, logged-out) is NOT
// a subscriber for ad-audience purposes.
export function isActiveSubscriber(me) {
  const s = me?.subscription
  if (!s) return false
  const plan = String(s.plan || s.planId || '').toLowerCase()
  if (!plan || plan === 'free') return false // free tier is never a "subscriber"
  const status = String(s.status || '').toLowerCase()
  if (status !== 'active' && status !== 'trial') return false
  const exp = s.expiryDate || s.endDate || null
  if (!exp) return true
  const t = new Date(exp).getTime()
  if (Number.isNaN(t)) return true
  return t > Date.now()
}

// Global master switch — default ON (subscribers see ads) when unset.
export async function adsGlobalShowToSubscribers(d) {
  try {
    const row = await d.collection('settings').findOne({ key: SETTINGS_KEY })
    return !(row && row.value === false)
  } catch (_) {
    return true // fail-open: never hide ads due to a settings read error
  }
}

export async function setAdsGlobalShowToSubscribers(d, value) {
  const v = !!value
  await d.collection('settings').updateOne(
    { key: SETTINGS_KEY },
    { $set: { key: SETTINGS_KEY, value: v, updatedAt: new Date() } },
    { upsert: true },
  )
  return v
}

// Decide whether to hide a resolved live ad from THIS requester.
// Returns true ⇒ hide (requester is an active subscriber AND either the global
// master switch is OFF or this specific ad has showToSubscribers === false).
export async function shouldHideFromSubscriber(d, ad, me) {
  // Admins & staff always see ads (QA + the admin preview depend on it).
  const role = String(me?.role || '')
  if (role === 'admin' || role === 'section_uploader' || role === 'books_uploader') return false
  if (!isActiveSubscriber(me)) return false
  const globalOn = await adsGlobalShowToSubscribers(d)
  const adOn = ad?.showToSubscribers !== false
  return !(globalOn && adOn)
}
