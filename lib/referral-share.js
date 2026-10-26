// Single source of truth for the referral SHARE MESSAGE used across the app
// (WhatsApp / Telegram / Facebook / Email / Copy / popup V2 / referral page).
//
// Placeholder:  {link} -> the teacher's own referral link.  (No price.)
//
// The admin can edit the template in Admin -> Referrals; this is the default.
// Keep the *stars* (WhatsApp bold), line breaks and emojis EXACTLY as-is.
// The Odia text below is LITERAL. A validator (assertOdiaSafe) rejects any
// non-Odia Indic characters (e.g. Tamil look-alikes) on save.

export const DEFAULT_REFERRAL_SHARE_TEMPLATE = `🔥 *ଶିକ୍ଷକ ବନ୍ଧୁ, ଏହା ଆପଣଙ୍କ ପାଇଁ!* 🔥
😩 Lesson Plan ଲେଖିବାରେ ରାତି ଅଧା ହେଉଛି?
✅ *ଏବେ ଆଉ Tension ନାହିଁ!*
📚 *LessonGuru Odisha* ରେ ଗୋଟିଏ ଜାଗାରେ ସବୁକିଛି:
📝 *Panchapadi Lesson Plan* - LO Code ସହିତ
📅 *Daily 7-Period Lesson Plan*
👥 *Multigrade Lesson Plan*
🧪 *ପ୍ରତି Chapter ର Unit Test*
📄 *FA / SA Question Paper*
❓ *Chapterwise Question - Answer*
🍲 *MCM Guide*
🎒 *Balvatika ରୁ Class 10* - ସମସ୍ତ ବିଷୟ
📖 *85+ ବହି, 1000+ Chapter*
➕ *ଆହୁରି ଅନେକ Feature!*
⏰ *ମିନିଟରେ* Download, ସିଧା Class ରେ ବ୍ୟବହାର
👍 Odisha ର ହଜାର ହଜାର ଶିକ୍ଷକ ଏବେ ବ୍ୟବହାର କରୁଛନ୍ତି!
🎁 *ବର୍ତ୍ତମାନ ବିଶେଷ Offer ଚାଲିଛି!*
👇 *ଏବେ ହିଁ Join କରନ୍ତୁ* 👇
{link}
🙏 ମୋ Link ରେ Join କରନ୍ତୁ!`

// Find characters that are Indic but NOT Odia (U+0B00–U+0B7F is Odia; everything
// else in the Indic planes is wrong — e.g. Tamil ு U+0BC1, ் U+0BCD).
//   Rejected: Devanagari/Bengali/Gurmukhi/Gujarati (U+0900–U+0AFF)
//             Tamil/Telugu/Kannada/Malayalam/Sinhala (U+0B80–U+0DFF)
// Allowed: Odia (U+0B00–U+0B7F), ASCII, ₹ (U+20B9), emojis, ZWJ, VS16, etc.
export function findNonOdiaIndicChars(text) {
  const bad = []
  const s = String(text == null ? '' : text)
  const chars = Array.from(s) // code-point aware (surrogate-safe)
  let idx = 0
  for (const ch of chars) {
    const cp = ch.codePointAt(0)
    const isBad = (cp >= 0x0900 && cp <= 0x0AFF) || (cp >= 0x0B80 && cp <= 0x0DFF)
    if (isBad) bad.push({ char: ch, code: 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'), index: idx })
    idx += ch.length
  }
  return bad
}

export function assertOdiaSafe(text) {
  const bad = findNonOdiaIndicChars(text)
  return { ok: bad.length === 0, bad }
}

export async function getReferralShareTemplate(d) {
  try {
    const row = await d.collection('settings').findOne({ key: 'referral_share_message' })
    const t = row?.value?.text
    if (typeof t === 'string' && t.trim()) return t
  } catch (_) {}
  return DEFAULT_REFERRAL_SHARE_TEMPLATE
}

export async function setReferralShareTemplate(d, text, adminId = null) {
  await d.collection('settings').updateOne(
    { key: 'referral_share_message' },
    { $set: { key: 'referral_share_message', value: { text: String(text == null ? '' : text), updatedAt: new Date(), updatedBy: adminId } } },
    { upsert: true },
  )
}

// Only {link} is substituted now. Any stray {price} is stripped to empty.
export function renderReferralShareMessage(template, { link } = {}) {
  return String(template == null ? '' : template)
    .replace(/\{price\}/g, '')
    .replace(/\{link\}/g, String(link == null ? '' : link))
}
