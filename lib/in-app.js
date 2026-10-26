// True inside the Lesson Guru Play Store app (user agent "LessonGuruApp/<ver> (Android)").
// The app sold on Play must not offer purchases (Google Play Payments policy), so purchase UI is
// hidden there. The direct APK (shared from the website / WhatsApp) identifies itself as
// "LessonGuruApp/<ver> (Android; direct)" and keeps the normal website buying flow (Razorpay/UPI).
export const inNativeApp = () => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /LessonGuruApp\//.test(ua) && !/LessonGuruApp\/[^)]*\bdirect\b/.test(ua)
}
