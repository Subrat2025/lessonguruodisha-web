// =============================================================================
//  lib/whatsapp-bulky.js — BulkyMarketing (official WhatsApp Business API) OTP.
//  -----------------------------------------------------------------------------
//  Dedicated OTP sender built to the AUTHENTICATION-template contract:
//    POST {BASE}/create-message   (multipart/form-data)
//      appkey, authkey            ← env BULKY_APPKEY / BULKY_AUTHKEY (NEVER logged)
//      to          = 91 + 10-digit mobile
//      template_id = env BULKY_OTP_TEMPLATE_ID (e.g. "otptemplate")
//      language    = env BULKY_OTP_LANGUAGE (default "en_US")
//      variables[{variableKey1}] = <OTP>
//      buttons[{b1_type}]  = url
//      buttons[{b1_value}] = <OTP>      ← mandatory copy-code button for auth templates
//    (NO "schedule", NO "file" for OTP.)
//  Success == HTTP 2xx AND response.message_status === "Success".
//  All returned errors are SAFE (no OTP value, no keys) for logging.
//
//  Ultramsg is kept as a switchable fallback via env OTP_PROVIDER=bulky|ultramsg.
// =============================================================================

const BASE = process.env.BULKY_BASE_URL || 'https://live.bulkymarketing.com/api'

/** 10-digit Indian mobile → "91XXXXXXXXXX"; returns null when invalid. */
function to91(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length === 10) return '91' + digits
  if (digits.length === 12 && digits.startsWith('91')) return digits
  if (digits.length === 11 && digits.startsWith('0')) return '91' + digits.slice(1)
  return null
}

/** Send a one-time code through the BulkyMarketing authentication template. */
export async function sendBulkyOtp({ to, code }) {
  const appkey = process.env.BULKY_APPKEY || ''
  const authkey = process.env.BULKY_AUTHKEY || ''
  if (!appkey || !authkey) {
    return { ok: false, provider: 'bulky', status: 0, messageStatus: null, safeError: 'Bulkymarketing credentials not configured' }
  }
  const to91v = to91(to)
  if (!to91v) {
    return { ok: false, provider: 'bulky', status: 0, messageStatus: null, safeError: 'invalid recipient mobile' }
  }
  const template_id = process.env.BULKY_OTP_TEMPLATE_ID || 'otptemplate'
  const language = process.env.BULKY_OTP_LANGUAGE || 'en_US'

  const form = new FormData()
  form.append('appkey', appkey)
  form.append('authkey', authkey)
  form.append('to', to91v)
  form.append('template_id', template_id)
  form.append('language', language)
  // Authentication-template payload (keys per BulkyMarketing contract — braces literal)
  form.append('variables[{variableKey1}]', String(code))
  form.append('buttons[{b1_type}]', 'url')
  form.append('buttons[{b1_value}]', String(code))
  // NOTE: deliberately NOT appending 'schedule' or 'file' for OTP.

  let res, text
  try {
    res = await fetch(`${BASE}/create-message`, { method: 'POST', body: form })
    text = await res.text()
  } catch (_) {
    return { ok: false, provider: 'bulky', status: 0, messageStatus: null, safeError: 'network error contacting provider' }
  }
  let data
  try { data = JSON.parse(text) } catch { data = { raw: (text || '').slice(0, 200) } }

  // The provider can answer HTTP 200 while refusing the message (e.g. empty wallet), so read the
  // body the same way lib/wa-send-core.js classifies campaign sends.
  const ms = String(data?.message_status || '').toLowerCase()
  const blob = JSON.stringify(data || {}).toLowerCase()
  const refused = /insufficient|low\s*bal|recharge|not enough|wallet|expired|inactive|blocked|not approved|paused|rejected|invalid template/.test(blob)
  const ok = res.ok && ms === 'success' && !refused
  const providerRef = data?.message_id || data?.messageId || data?.id || data?.data?.message_id || data?.data?.id || null
  // SAFE detail for logs / admin diagnostics: the OTP is masked, credentials are never in the body.
  const detail = JSON.stringify(data || {}).split(String(code)).join('******').slice(0, 300)
  const safeError = ok ? null
    : `status=${res.status} message_status=${data?.message_status || 'n/a'}${refused ? ' refused' : ''}${data?.message ? ' msg=' + String(data.message).split(String(code)).join('******').slice(0, 140) : ''}`
  return { ok, provider: 'bulky', status: res.status, messageStatus: data?.message_status || null, providerRef, detail, safeError }
}

/** Ultramsg plain-text OTP fallback (no template) — used when OTP_PROVIDER=ultramsg. */
async function sendUltramsgOtp({ to, code }) {
  const { sendWhatsApp } = await import('@/lib/ultramsg.js')
  const body = `🔐 *Lesson Guru Odisha* verification code: *${code}*\n\nValid for 10 minutes. Do not share this code with anyone.`
  const r = await sendWhatsApp({ to, body })
  return {
    ok: !!r?.ok, provider: 'ultramsg', status: r?.ok ? 200 : 502,
    messageStatus: r?.ok ? 'Success' : 'Failed',
    safeError: r?.ok ? null : `ultramsg: ${r?.error || 'send failed'}`.slice(0, 160),
  }
}

/**
 * Provider-agnostic OTP sender. Routes by env OTP_PROVIDER (default "bulky").
 * Returns { ok, provider, status, messageStatus, safeError } — SAFE to log.
 */
export async function sendOtp({ to, code }) {
  // OTP is BulkyMarketing-only (otptemplate). UltraMsg fallback retired.
  const r = await sendBulkyOtp({ to, code })
  // Decrement internal balance estimate (OTP = AUTHENTICATION). OTP is NEVER
  // blocked by the wallet gate — this only keeps the estimate accurate.
  if (r?.ok) {
    try {
      const { getDb } = await import('@/lib/mongodb.js')
      const core = await import('@/lib/wa-send-core.js')
      await core.noteWhatsAppSpend(await getDb(), 'authentication', 1)
    } catch (_) {}
  }
  return r
}
