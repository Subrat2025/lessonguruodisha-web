// ============================================================================
// Landing Page Tracking Helpers
// ============================================================================
// Thin wrappers around Facebook Pixel (fbq), Google Analytics 4 (gtag),
// Microsoft Clarity (clarity) and Hotjar (hj).  All calls are safe no-ops when
// the underlying script has not loaded (missing ID) — this lets us ship the
// tracking code today and drop the actual IDs later without any code changes.
// ============================================================================

const isBrowser = () => typeof window !== 'undefined'

/** Track a Facebook Pixel event.  Safe no-op if fbq is not loaded. */
export const fbTrack = (event, params = {}) => {
  if (!isBrowser()) return
  try {
    if (typeof window.fbq === 'function') {
      window.fbq('track', event, params)
    }
  } catch {}
}

/** Track a custom (non-standard) Facebook Pixel event. */
export const fbTrackCustom = (event, params = {}) => {
  if (!isBrowser()) return
  try {
    if (typeof window.fbq === 'function') {
      window.fbq('trackCustom', event, params)
    }
  } catch {}
}

/** Send a GA4 event.  Safe no-op if gtag is not loaded. */
export const gaTrack = (event, params = {}) => {
  if (!isBrowser()) return
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', event, params)
    }
  } catch {}
}

/** Tag a Clarity event.  Safe no-op if Clarity is not loaded. */
export const clarityTrack = (event, value) => {
  if (!isBrowser()) return
  try {
    if (typeof window.clarity === 'function') {
      window.clarity('event', event)
      if (value != null) window.clarity('set', event, String(value))
    }
  } catch {}
}

/**
 * Fire ONE unified conversion event across every platform.
 *   fb   → Facebook Pixel event name (standard or custom)
 *   ga   → GA4 event name (snake_case)
 *   props→ additional params (currency, value, content_name, etc.)
 */
export const track = ({ fb, ga, custom = false, props = {} } = {}) => {
  if (fb) {
    if (custom) fbTrackCustom(fb, props)
    else fbTrack(fb, props)
  }
  if (ga) gaTrack(ga, props)
  if (ga) clarityTrack(ga, props?.content_name || '')
}
