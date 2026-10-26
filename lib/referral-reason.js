// ============================================================================
//  referral-reason.js  —  UI-only helpers for Phase 1 referral transparency.
//  Maps the reason CODES already produced by lib/referral-engine.js
//  (isQualifyingReferral) to friendly, human-readable explanations.
//
//  IMPORTANT: This file contains NO qualification logic. It only formats an
//  already-computed reason for display. The backend/referral-engine remains
//  the single source of truth for qualification/reward decisions.
// ============================================================================

// Friendly copy for each known reason code returned by the referral engine.
export const REFERRAL_REASON_LABELS = {
  qualified:
    'This referral currently satisfies the qualification rules and counts toward your referral milestone.',
  'no-active-subscription':
    'The referred user has not activated an active subscription yet.',
  'past-validity-window':
    "Subscribed after the campaign's qualification window.",
  'plan-not-eligible':
    'Subscribed using a plan that is not eligible for this referral campaign.',
  'expired-subscription':
    'The subscription record is currently marked active, but the expiry date has passed.',
  'same-mobile':
    'Referral did not qualify because the same mobile number was detected.',
  'same-email':
    'Referral did not qualify because the same email was detected.',
  'self-referral':
    'Self-referral is not eligible.',
}

// Returns a safe, friendly explanation for a reason code.
// Unknown codes are never invented — we log them and show a generic note.
export function friendlyReferralReason(reason) {
  if (!reason) return 'Status details are not available for this referral.'
  if (REFERRAL_REASON_LABELS[reason]) return REFERRAL_REASON_LABELS[reason]
  // Unknown reason code — do NOT invent copy; log for dev review.
  if (typeof console !== 'undefined') {
    console.warn('[referral] unknown qualification reason code:', reason)
  }
  return 'This referral does not currently meet the qualification rules for this campaign.'
}

// Derives the badge presentation from the server-computed booleans.
// Does NOT recompute qualification — purely reads entry.qualified / entry.subscribed.
// Returns: { key, label, counts, tone }
export function referralBadge(entry) {
  if (entry?.qualified) {
    return { key: 'qualified', label: 'Qualified', counts: true, tone: 'green' }
  }
  if (entry?.subscribed) {
    return { key: 'subscribed', label: 'Subscribed — Not Qualified', counts: false, tone: 'amber' }
  }
  return { key: 'pending', label: 'Pending', counts: false, tone: 'slate' }
}
