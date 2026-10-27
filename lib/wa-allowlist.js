// ============================================================================
//  lib/wa-allowlist.js — PREVIEW real-send allowlist, gated on the ACTUAL host.
//
//  Why host-based (not env-only): Emergent may copy preview env values into LIVE
//  on deploy (observed with STORAGE_WRITE). So we must NOT trust the env flag
//  alone. The guard is enforced ONLY when BOTH are true:
//     (1) WA_ALLOWLIST_ENFORCE is truthy, AND
//     (2) the request's real host is a *.preview.emergentagent.com domain.
//  On the production domain (lessonguruodisha.com) the guard is ALWAYS off,
//  whatever the env says — because the request Host header is set by the
//  platform per-environment and cannot be faked by a copied env var.
//
//  Host resolution order:
//   • an explicitly-passed host (route threads request Host → most reliable)
//   • the current request's Host / X-Forwarded-Host (works in route handlers
//     AND in platform crons, which POST to {{BASE_URL}} with the real host)
//   • NEXT_PUBLIC_BASE_URL (last-resort fallback for non-request contexts)
//  Unknown host → treated as NON-preview → guard stays OFF (safe for LIVE).
// ============================================================================
import { headers } from 'next/headers'

function hostFromRequestCtx() {
  try {
    const h = headers()
    return String(h.get('x-forwarded-host') || h.get('host') || '').toLowerCase()
  } catch (_) {
    return '' // called outside a request scope → unknown host
  }
}

// Normalize a host (strip port) and decide if it's a preview domain.
// IMPORTANT: when the host is unknown (no request context), return false so the
// guard is OFF. We never guess from NEXT_PUBLIC_BASE_URL — LIVE must never block
// a send because of a guessed URL. (Preview background jobs are paused anyway.)
export function isPreviewHost(explicitHost) {
  const raw = String(explicitHost || hostFromRequestCtx() || '').toLowerCase()
  const host = raw.split(',')[0].trim().split(':')[0] // first host, no port
  if (!host) return false
  return /(^|\.)preview\.emergentagent\.com$/.test(host)
}

// Enforce ONLY when the flag is truthy AND we are on a preview host.
export function allowlistEnforced(explicitHost) {
  const flag = String(process.env.WA_ALLOWLIST_ENFORCE || '').trim().toLowerCase()
  const flagOn = flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on'
  return flagOn && isPreviewHost(explicitHost)
}

export function allowlistSet() {
  const raw = process.env.WA_PREVIEW_ALLOWLIST || '9692604577,7008144614'
  return new Set(String(raw).split(/[^\d]+/).map(s => s.slice(-10)).filter(s => s.length === 10))
}

export function isAllowlisted(mobile) {
  const m = String(mobile || '').replace(/\D/g, '').slice(-10)
  return allowlistSet().has(m)
}

// Convenience for the provider chokepoint: may this number be sent to?
export function sendAllowed(mobile, explicitHost) {
  if (!allowlistEnforced(explicitHost)) return true
  return isAllowlisted(mobile)
}
