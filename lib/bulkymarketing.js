// =============================================================================
//  📱 Bulkymarketing WhatsApp API client
//  --------------------------------------
//  Wraps three server endpoints:
//    • /create-message-json   — bulk send  (uses this for campaigns)
//    • /create-message        — single send (used for OTP / one-off)
//    • /get_templates         — list approved templates
//
//  Credentials live in .env → BULKY_APPKEY / BULKY_AUTHKEY / BULKY_BASE_URL
// =============================================================================

const BASE = process.env.BULKY_BASE_URL || 'https://live.bulkymarketing.com/api'
const APPKEY = process.env.BULKY_APPKEY || ''
const AUTHKEY = process.env.BULKY_AUTHKEY || ''

// ── PREVIEW real-send allowlist (global chokepoint) ─────────────────────────
// Host-gated guard (see lib/wa-allowlist.js). Enforced ONLY when the flag is
// truthy AND the real request host is a *.preview.emergentagent.com domain.
// On lessonguruodisha.com it is ALWAYS off (even if the env flag was copied to
// LIVE). OTP uses a different client (lib/whatsapp-bulky.js) and is never affected.
import { sendAllowed } from './wa-allowlist.js'
const allowed = (mobile) => sendAllowed(mobile)

/** Ensure a phone number is in the E.164 shape Bulkymarketing expects — 91XXXXXXXXXX (India). */
export function normalizeMobile(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return '91' + digits              // 10-digit Indian → prefix 91
  if (digits.length === 12 && digits.startsWith('91')) return digits
  if (digits.length === 11 && digits.startsWith('0')) return '91' + digits.slice(1)
  if (digits.length === 13 && digits.startsWith('091')) return digits.slice(1)
  return digits.length >= 11 ? digits : null
}

/** Ping the API to list the WhatsApp templates that have been approved. */
export async function getTemplates() {
  if (!APPKEY || !AUTHKEY) throw new Error('Bulkymarketing credentials missing in .env')
  const form = new FormData()
  form.append('appkey', APPKEY)
  form.append('authkey', AUTHKEY)
  const res = await fetch(`${BASE}/get_templates`, { method: 'POST', body: form })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!res.ok) throw new Error(`get_templates ${res.status}: ${text.slice(0, 200)}`)
  return data
}

// ── Central approved-template gate ──────────────────────────────────────────
// Legacy templates that no longer exist on the account (the 22k failures).
// ALWAYS blocked, regardless of the live status fetch.
const ALWAYS_BLOCK = new Set(['user_registration_2', 'lesson_guru_activate_01', 'premium_offer1', 'panchapdi_photo'])
let _tplCache = { at: 0, set: null }
const TPL_CACHE_TTL_MS = 45 * 60 * 1000 // refresh approved list ~every 45 min (NOT per message)
async function approvedTemplateSet() {
  if (_tplCache.set && Date.now() - _tplCache.at < TPL_CACHE_TTL_MS) return _tplCache.set
  try {
    const data = await getTemplates()
    const arr = Array.isArray(data) ? data : (data?.templates || data?.data || data?.message_templates || [])
    const set = new Set()
    for (const t of (Array.isArray(arr) ? arr : [])) {
      const name = t.template_name || t.name || t.elementName || t.template || t.templateName
      const status = String(t.status || t.template_status || t.approval_status || '').toUpperCase()
      if (name && status === 'APPROVED') set.add(name)
    }
    _tplCache = { at: Date.now(), set }
    return set
  } catch (_) { return _tplCache.set } // provider error → last-known set, else null (fail-closed below)
}
/** Returns {ok} — ok:false means DO NOT send (skip + log). Same registry as Phase 1.
 *  NOTE: OTP does NOT go through this gate (it uses lib/whatsapp-bulky.js), so OTP
 *  always sends even if get_templates is down. Templated marketing/utility sends are
 *  fail-CLOSED: if approval status can't be determined, they are skipped + logged. */
export async function isTemplateSendable(template_id) {
  if (!template_id) return { ok: true }
  if (ALWAYS_BLOCK.has(template_id)) return { ok: false, reason: 'legacy_template_removed' }
  const set = await approvedTemplateSet()
  if (!set) return { ok: false, reason: 'status_unavailable' } // fail-closed
  if (!set.has(template_id)) return { ok: false, reason: 'not_approved' }
  return { ok: true }
}

/** Send to one number — used for OTP / single one-off messages. */
export async function sendSingle({ to, template_id, language = 'en_US', variables = {}, buttons = [], file, schedule }) {
  if (!APPKEY || !AUTHKEY) throw new Error('Bulkymarketing credentials missing in .env')
  const gate = await isTemplateSendable(template_id)
  if (!gate.ok) {
    console.warn('[bulky] SKIP non-approved template:', template_id, '-', gate.reason)
    return { ok: false, skipped: true, status: 0, data: { skipped: true, reason: gate.reason, template_id } }
  }
  const t = normalizeMobile(to)
  if (!t) throw new Error(`Invalid recipient: ${to}`)
  if (!allowed(t)) {
    console.warn('[bulky] BLOCKED non-allowlisted number (PREVIEW):', String(t).slice(-4))
    return { ok: false, skipped: true, status: 0, data: { skipped: true, reason: 'preview_allowlist_blocked', to: String(t).slice(-4) } }
  }
  const form = new FormData()
  form.append('appkey', APPKEY)
  form.append('authkey', AUTHKEY)
  form.append('to', t)
  form.append('template_id', template_id)
  form.append('language', language)
  if (file)     form.append('file', file)
  if (schedule) form.append('schedule', schedule)
  for (const [k, v] of Object.entries(variables || {})) form.append(`variables[${k}]`, String(v))
  ;(buttons || []).forEach((b, i) => {
    const idx = `b${i + 1}`
    if (b?.type)  form.append(`buttons[${idx}_type]`,  b.type)
    if (b?.value) form.append(`buttons[${idx}_value]`, b.value)
  })
  const res = await fetch(`${BASE}/create-message`, { method: 'POST', body: form })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  return { ok: res.ok, status: res.status, data }
}

/**
 * Send a JSON bulk batch (Bulkymarketing accepts an array of numbers).
 * Keep batch sizes ≤ 100 to stay safely under most WhatsApp BSP limits.
 */
export async function sendBulk({ toList, template_id, language = 'en_US', variables = {}, buttons = [], file, schedule }) {
  if (!APPKEY || !AUTHKEY) throw new Error('Bulkymarketing credentials missing in .env')
  const gate = await isTemplateSendable(template_id)
  if (!gate.ok) {
    console.warn('[bulky] SKIP bulk non-approved template:', template_id, '-', gate.reason)
    return { ok: false, skipped: true, status: 0, data: { skipped: true, reason: gate.reason, template_id }, sentCount: 0 }
  }
  const to = (toList || []).map(normalizeMobile).filter(Boolean)
  if (to.length === 0) return { ok: false, status: 400, data: { error: 'empty recipient list' } }
  // PREVIEW safety: drop any non-allowlisted numbers before they reach the provider.
  const allowedTo = to.filter(allowed)
  if (allowedTo.length < to.length) {
    console.warn(`[bulky] PREVIEW allowlist dropped ${to.length - allowedTo.length} of ${to.length} bulk recipient(s)`)
  }
  if (allowedTo.length === 0) {
    console.warn('[bulky] BLOCKED bulk send — no allowlisted numbers (PREVIEW)')
    return { ok: false, skipped: true, status: 0, data: { skipped: true, reason: 'preview_allowlist_blocked' }, sentCount: 0 }
  }
  const payload = { appkey: APPKEY, authkey: AUTHKEY, to: allowedTo, template_id, language }
  if (Object.keys(variables || {}).length) payload.variables = variables
  if ((buttons || []).length) payload.buttons = buttons
  if (file)     payload.file = file
  if (schedule) payload.schedule = schedule
  const res = await fetch(`${BASE}/create-message-json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  return { ok: res.ok, status: res.status, data, sentCount: allowedTo.length }
}

/**
 * Send with automatic exponential-backoff retry.  Used by the campaign runner.
 * Retries only on 429 (rate-limit) and 5xx.  Auth / 4xx errors fail fast.
 */
export async function sendBulkWithRetry(args, { maxRetries = 3, baseDelayMs = 1500 } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await sendBulk(args)
    if (r.ok) return { ...r, attempts: attempt + 1 }
    const shouldRetry = r.status === 429 || (r.status >= 500 && r.status < 600)
    if (!shouldRetry || attempt === maxRetries) return { ...r, attempts: attempt + 1 }
    await new Promise(rs => setTimeout(rs, baseDelayMs * Math.pow(2, attempt)))
  }
}
