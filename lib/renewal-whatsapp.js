'use client'
// ============================================================================
//  Renewal WhatsApp recovery helper (client-side, shared)
//  - Exact support number: +91 8093414633  → normalized to 918093414633
//  - Short punchy Odia recovery message (kept intact: emojis + line breaks)
//  - openRenewalWhatsApp(): native-first on phones (whatsapp:// scheme) with a
//    graceful fallback to wa.me web; desktop opens wa.me in a new tab.
//  NOTE: WhatsApp is only a CONTACT channel — it NEVER sends automatically and
//        NEVER replaces the existing Razorpay renewal flow.
// ============================================================================

export const RENEWAL_WA_NUMBER = '918093414633' // +91 8093414633

// Short, high-signal Odia message pre-filled into the WhatsApp composer.
export const SHORT_RENEWAL_MESSAGE =
`🚨 ଆପଣଙ୍କ Lesson Guru Premium ସମାପ୍ତ ହୋଇଛି!

🔥 ମାତ୍ର ₹୧୯/ମାସ ବା ₹୨୧୯/ବର୍ଷରେ ପୁଣି ଚାଲୁ କରନ୍ତୁ ✨

📚 Lesson Plans · 📝 FA/SA Papers · 📖 Question Bank · LO Codes ଓ ଆହୁରି ଅନେକ Teacher Resources!

👉 ମୁଁ ମୋର Premium RENEW କରିବାକୁ ଚାହୁଁଛି। ଦୟାକରି ସହାୟତା କରନ୍ତୁ। 🙏

🌐 LessonGuruOdisha.com`

const OD = ['୦', '୧', '୨', '୩', '୪', '୫', '୬', '୭', '୮', '୯']
const toOdia = (n) => String(n ?? '').replace(/[0-9]/g, (dg) => OD[+dg])

/**
 * Builds the WhatsApp message. When a Win-Back offer is passed (for long-expired
 * teachers), appends an honest comeback-discount line with the real code.
 */
export function buildRenewalWhatsAppMessage(winback = null) {
  let msg = SHORT_RENEWAL_MESSAGE
  if (winback && winback.discountValue > 0) {
    const off = winback.discountType === 'fixed'
      ? `₹${toOdia(winback.discountValue)}`
      : `${toOdia(winback.discountValue)}%`
    const code = winback.code ? ` (Code: ${winback.code})` : ''
    msg += `\n\n🎁 ୱାପସୀ ଉପହାର: ଆଜି RENEW କଲେ ଅତିରିକ୍ତ ${off} ଛାଡ଼!${code}\n✅ App ଖୋଲି Premium Plans କୁ ଗଲେ ଏହା ସ୍ୱୟଂଚାଳିତ ଭାବେ ଲାଗୁ ହେବ।`
  }
  return msg
}

/**
 * Opens WhatsApp with the renewal message pre-filled.
 * Does NOT auto-send — the user must press Send manually.
 */
export function openRenewalWhatsApp(message = SHORT_RENEWAL_MESSAGE) {
  if (typeof window === 'undefined') return
  const num = RENEWAL_WA_NUMBER
  const text = encodeURIComponent(message)
  const webUrl = `https://wa.me/${num}?text=${text}`

  const ua = navigator.userAgent || navigator.vendor || ''
  const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(ua)

  if (!isMobile) {
    // Desktop / web → WhatsApp Web fallback
    window.open(webUrl, '_blank', 'noopener,noreferrer')
    return
  }

  // Mobile → try to open the NATIVE WhatsApp app first, fall back to wa.me.
  const appUrl = `whatsapp://send?phone=${num}&text=${text}`
  let opened = false
  const onHide = () => { opened = true }
  document.addEventListener('visibilitychange', onHide, { once: true })
  window.addEventListener('pagehide', onHide, { once: true })

  // If the native app didn't take over within ~1.2s, use the universal wa.me
  // link (which itself opens the app when installed, else the browser).
  const fallback = setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide)
    if (!opened && document.visibilityState === 'visible') {
      window.location.href = webUrl
    }
  }, 1200)

  try {
    window.location.href = appUrl
  } catch (_) {
    clearTimeout(fallback)
    window.location.href = webUrl
  }
}


// ---------------------------------------------------------------------------
//  Normalize an Indian mobile number to WhatsApp international format.
//  Returns '918093412345' or null when the number is not valid.
// ---------------------------------------------------------------------------
export function normalizeIndianWhatsApp(raw) {
  if (!raw) return null
  let n = String(raw).replace(/\D/g, '')
  if (n.startsWith('0')) n = n.replace(/^0+/, '')     // strip leading zeros
  if (n.length === 10) n = '91' + n                    // bare 10-digit → +91
  // Valid Indian mobiles: 91 + 10 digits, and the subscriber starts 6-9.
  if (n.length === 12 && n.startsWith('91') && /^[6-9]/.test(n.slice(2))) return n
  // Some numbers may already be full international of other lengths — accept 11-15 digits.
  if (n.length >= 11 && n.length <= 15) return n
  return null
}

/**
 * Opens WhatsApp addressed to a SPECIFIC recipient number with a pre-filled
 * message (used by Admin → Subscription Recovery to message each expired user
 * on THEIR own number). Native app first, graceful wa.me fallback.
 * Returns true if a valid number was opened, false if the number was invalid.
 */
export function openWhatsAppTo(recipient, message = '') {
  if (typeof window === 'undefined') return false
  const num = normalizeIndianWhatsApp(recipient)
  if (!num) return false
  const text = encodeURIComponent(message)
  const webUrl = `https://wa.me/${num}?text=${text}`

  const ua = navigator.userAgent || navigator.vendor || ''
  const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(ua)

  if (!isMobile) {
    window.open(webUrl, '_blank', 'noopener,noreferrer')
    return true
  }

  const appUrl = `whatsapp://send?phone=${num}&text=${text}`
  let opened = false
  const onHide = () => { opened = true }
  document.addEventListener('visibilitychange', onHide, { once: true })
  window.addEventListener('pagehide', onHide, { once: true })
  const fallback = setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide)
    if (!opened && document.visibilityState === 'visible') window.location.href = webUrl
  }, 1200)
  try { window.location.href = appUrl } catch (_) { clearTimeout(fallback); window.location.href = webUrl }
  return true
}

// ---------------------------------------------------------------------------
//  Exact SHORT ODIA renewal message for Admin→User recovery (with optional
//  first-name greeting). Keeps Odia Unicode, emojis and line breaks intact.
// ---------------------------------------------------------------------------
export function buildAdminRecoveryMessage(firstName = '') {
  const greet = firstName ? `🙏 ନମସ୍କାର ${firstName} Sir/Madam,\n\n` : ''
  return `${greet}🚨🔥 ଆପଣଙ୍କ Lesson Guru Premium Expire ହୋଇଯାଇଛି!

କିନ୍ତୁ ମାତ୍ର ₹୧୯/ମାସରୁ ପୁଣି Premium ଚାଲୁ କରନ୍ତୁ! 🤯🔥

📚 Renew କଲେ ପାଆନ୍ତୁ:
✅ Panchapadi & 5E Lesson Plans
✅ Daily 7-Period & Multigrade Lesson Plan
✅ FA/SA Assessment & Question Papers
✅ Book Q&A & Chapterwise Question Bank
✅ Practice Worksheets & Homework
✅ New Books & Chapterwise Resources
✅ LO Codes & Learning Outcomes
✅ Teaching Notes, MCM Guide & Classroom Activities
🚀 ଆଗକୁ ଆହୁରି ନୂଆ Smart Teacher Features ଆସୁଛି!

💥 ମାତ୍ର ₹୧୯/ମାସ
🔥 ମାତ୍ର ₹୨୧୯/ବର୍ଷ

⏰ ସମୟ ବଞ୍ଚାନ୍ତୁ • School Work ସହଜ କରନ୍ତୁ • Smart Teacher ହୁଅନ୍ତୁ!

👇 ଆଜି ହିଁ RENEW କରନ୍ତୁ!
🌐 LessonGuruOdisha.com
📱 App: https://play.google.com/store/apps/details?id=com.wnapp.id1781430851106

💬 Renewal ସହାୟତା ପାଇଁ WhatsApp: 8093414633`
}
