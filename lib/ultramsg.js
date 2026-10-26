// /app/lib/ultramsg.js — thin wrapper for the UltraMsg WhatsApp Gateway API.
//   • sendWhatsApp({ to, body })  — server-to-user send
//   • Reads ULTRAMSG_INSTANCE_ID and ULTRAMSG_TOKEN from env (never expose to client).
//   • `to` MUST be a phone in E.164 without leading + (e.g. "919000990007")
//   • Truncates message to 4096 chars (WhatsApp Business API limit).

const BASE = 'https://api.ultramsg.com'

function normalisePhone(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return '91' + digits          // Indian mobile → prepend 91
  if (digits.startsWith('0') && digits.length === 11) return '91' + digits.slice(1)
  return digits
}

export async function sendWhatsApp({ to, body }) {
  // ⛔ UltraMsg has been RETIRED. All WhatsApp sending now goes through
  // BulkyMarketing (templates) + OTP; transactional/admin messages use in-app
  // notifications. This is a hard no-op kept so legacy call sites don't throw.
  return { ok: false, disabled: true, error: 'UltraMsg retired — using in-app notifications / BulkyMarketing' }
}

async function _ultramsgRetired_sendWhatsApp({ to, body }) {
  const token = process.env.ULTRAMSG_TOKEN
  if (!instance || !token) {
    return { ok: false, error: 'UltraMsg not configured (ULTRAMSG_INSTANCE_ID / ULTRAMSG_TOKEN missing)' }
  }
  const phone = normalisePhone(to)
  if (!phone) return { ok: false, error: 'Invalid phone number' }
  const msg = String(body || '').slice(0, 4000)
  if (!msg) return { ok: false, error: 'Empty message body' }

  try {
    const form = new URLSearchParams()
    form.set('token', token)
    form.set('to', phone)
    form.set('body', msg)
    form.set('priority', '1')
    const r = await fetch(`${BASE}/${instance}/messages/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    const j = await r.json().catch(() => ({}))
    if (r.ok && (j.sent === 'true' || j.sent === true)) {
      return { ok: true, id: j.id, phone, ultramsg: j }
    }
    return { ok: false, error: j.error || j.message || `HTTP ${r.status}`, ultramsg: j }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

/**
 * Auto-reply router for incoming WhatsApp messages received via the UltraMsg
 * webhook.  Given the raw text a user sent + their looked-up user record
 * (if any), returns the reply body string.
 *
 * Bilingual (Odia + English) — pattern-based, no LLM cost.
 */
export function buildAutoReply({ incomingText, user, appUrl }) {
  const txt = String(incomingText || '').trim().toLowerCase()
  const site = appUrl || 'https://lessonguruodisha.in'

  // 1) Password / login intent — ONLY works if sender matches a registered user
  if (/\b(password|pass\s*word|forgot|forgotten|login|reset|passwd|pwd)\b/i.test(txt) ||
      /ପାସୱାର୍ଡ|ପାସୱାର୍ଡ୍|ପ୍ରବେଶ|लॉगिन|पासवर्ड/.test(incomingText || '')) {
    if (!user) {
      return `🙏 Namaskar!\n\nWe couldn't find your account with this WhatsApp number.\n\nଏହି WhatsApp Number ସହ କୌଣସି account ମିଳିଲା ନାହିଁ।\n\n👉 Please sign up at:\n${site}\n\nଥରେ signup କରିବା ପରେ ଏଠିକୁ ଆସି "password" ଲେଖି message କରନ୍ତୁ। 🎓`
    }
    if (user.lastKnownPassword) {
      return (
        `🙏 ନମସ୍କାର ${user.name}!\n\n` +
        `Your Lesson Guru Odisha login credentials:\n\n` +
        `📱 Mobile: ${user.mobile}\n` +
        `🔑 Password: ${user.lastKnownPassword}\n\n` +
        `🌐 Login: ${site}\n\n` +
        `✨ Login ପରେ Password ବଦଳାଇବା ପାଇଁ Profile → Change Password ବ୍ୟବହାର କରନ୍ତୁ।\n\n` +
        `ଅଧିକ ସାହାଯ୍ୟ ପାଇଁ "menu" ଲେଖି message କରନ୍ତୁ।\n\nଧନ୍ୟବାଦ! 🎓`
      )
    }
    // User exists but no plaintext stored → self-signup or self-changed
    return (
      `🙏 ନମସ୍କାର ${user.name}!\n\n` +
      `Your password is not visible to us (you set it yourself at signup).\n\n` +
      `👉 Please use "Forgot Password" on the login page, or contact admin.\n\n` +
      `🌐 ${site}\n\n` +
      `Reply "menu" for more options.\n\nଧନ୍ୟବାଦ! 🎓`
    )
  }

  // 2) Plans / pricing intent
  if (/\b(plan|plans|price|premium|subscribe|subscription|pricing|rate|cost|buy|purchase)\b/i.test(txt) ||
      /ମୂଲ୍ୟ|ପ୍ୟାନ|ପ୍ରିମିୟମ|योजना|कीमत|मूल्य/.test(incomingText || '')) {
    return (
      `💎 Lesson Guru Odisha — Premium Plans\n\n` +
      `🆓 Free — ₹0 (limited access)\n` +
      `🌱 Monthly — ₹19 / 30 days\n` +
      `🌿 Quarterly — ₹49 / 90 days (Best Value)\n` +
      `🌸 Semi-Annual — ₹99 / 180 days  ⭐ SPECIAL OFFER!\n` +
      `⭐ Yearly — ₹219 / 365 days (Most Popular)\n` +
      `👑 Lifetime — ₹1999 (One-Time)\n\n` +
      `🌐 Subscribe: ${site}/plans\n\n` +
      `Reply "menu" for more options. 🎓`
    )
  }

  // 3) Help / commands menu
  if (/^(help|menu|start|hi|hello|hey|namaskar|ନମସ୍କାର|hii+|hola|\?|command)/i.test(txt) ||
      /^ନମସ୍କାର|^নমস্কার|^नमस्कार|^नमस्ते/.test(incomingText || '')) {
    const greeting = user ? `Namaskar ${user.name}! 🙏` : 'Namaskar! 🙏'
    return (
      `${greeting}\n\n` +
      `Welcome to *Lesson Guru Odisha* — Odisha's #1 lesson-plan platform for Government Teachers.\n\n` +
      `📋 Reply with:\n` +
      `  • *password* — get your login credentials\n` +
      `  • *plans* — see subscription pricing\n` +
      `  • *features* — what the app can do\n` +
      `  • *website* — open the app\n` +
      `  • *help* — this menu\n\n` +
      `🌐 ${site}\n\n` +
      `ଓଡ଼ିଆରେ ମଧ୍ୟ ଉତ୍ତର ଦିଆଯାଇଥାଏ। 🎓`
    )
  }

  // 4) Features intent
  if (/\b(feature|features|what|about|info|kya|kia)\b/i.test(txt) ||
      /ବିଶେଷତା|କଣ|ବିଷୟ/.test(incomingText || '')) {
    return (
      `✨ Lesson Guru Odisha Features\n\n` +
      `📚 Daily 7-Period Plan (Panchapadi + 5E)\n` +
      `⚡ Instant Daily Plan (single lesson)\n` +
      `🏫 Multigrade Plan (2-5 classes)\n` +
      `📝 Question Bank (chapter-wise Q&A)\n` +
      `🎯 594+ LO Codes auto-assigned\n` +
      `📱 Works offline (PWA)\n` +
      `🖨️ Print A4 landscape/portrait\n\n` +
      `🌐 ${site}\n\n` +
      `Reply "password" to log in. 🎓`
    )
  }

  // 5) Website / link
  if (/\b(website|link|url|app|open)\b/i.test(txt) || /ୱେବସାଇଟ୍|ଲିଙ୍କ/.test(incomingText || '')) {
    return `🌐 Open the app here:\n\n${site}\n\nReply "menu" for more options. 🎓`
  }

  // 6) Fallback — friendly welcome
  const greeting = user ? `Namaskar ${user.name}! 🙏` : 'Namaskar! 🙏'
  return (
    `${greeting}\n\n` +
    `I couldn't understand your message. Please reply with one of:\n\n` +
    `📋 *password* — get login credentials\n` +
    `💎 *plans* — subscription pricing\n` +
    `✨ *features* — what the app does\n` +
    `🌐 *website* — app link\n` +
    `❓ *help* — this menu\n\n` +
    `${site}\n\n🎓 Lesson Guru Odisha`
  )
}
