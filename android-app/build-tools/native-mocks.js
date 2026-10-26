// Sample backend responses for the native screens, in the same shapes as app/api/[[...path]]/route.js.
const day = 86400000
const CLASSES = [
  { id: 'c0', name: 'Balvatika', nameOdia: 'ବାଳବାଟିକା', emoji: '🧸', order: 0 },
  ...Array.from({ length: 10 }, (_, i) => ({ id: 'c' + (i + 1), name: 'Class ' + (i + 1), nameOdia: 'ଶ୍ରେଣୀ ' + '୦୧୨୩୪୫୬୭୮୯'[i + 1 > 9 ? 1 : i + 1] + (i + 1 > 9 ? '୦' : ''), order: i + 1 })),
]
const BOOKS = [
  { id: 'b1', classId: 'c5', name: 'Gamata (Mathematics)', emoji: '🔢', order: 1, chaptersCount: 14, lessonsCount: 96 },
  { id: 'b2', classId: 'c5', name: 'Sahitya Surabhi (Odia)', emoji: '📜', order: 2, chaptersCount: 18, lessonsCount: 120 },
  { id: 'b3', classId: 'c5', name: 'Amara Parisara (EVS)', emoji: '🌿', order: 3, chaptersCount: 16, lessonsCount: 88 },
  { id: 'b4', classId: 'c5', name: 'English Reader', emoji: '🔤', order: 4, chaptersCount: 12, lessonsCount: 64 },
  { id: 'b5', classId: 'c5', name: 'Hindi (Swagatam)', emoji: '🪔', order: 5, chaptersCount: 10, lessonsCount: 52 },
]
const CHAPTERS = ['ସଂଖ୍ୟା ଜ୍ଞାନ (Numbers)', 'ଯୋଗ ଓ ବିୟୋଗ', 'ଗୁଣନ', 'ହରଣ', 'ଭଗ୍ନାଂଶ (Fractions)', 'ଦଶମିକ ସଂଖ୍ୟା', 'ମାପ', 'ସମୟ', 'ଜ୍ୟାମିତି']
  .map((n, i) => ({ id: 'ch' + (i + 1), classId: 'c5', bookId: 'b1', name: n, order: i + 1, totalPeriods: 4 + (i % 4) }))
const LESSONS = [
  'ଭଗ୍ନାଂଶର ଧାରଣା', 'ସମ ଭଗ୍ନାଂଶ', 'ଭଗ୍ନାଂଶ ତୁଳନା', 'ଭଗ୍ନାଂଶ ଯୋଗ', 'ଭଗ୍ନାଂଶ ବିୟୋଗ', 'ଦୈନନ୍ଦିନ ଜୀବନରେ ଭଗ୍ନାଂଶ',
].map((t, i) => ({ id: 'l' + (i + 1), classId: 'c5', bookId: 'b1', chapterId: 'ch5', title: t, period: i + 1, order: i + 1, loCodes: ['M507', 'M508'].slice(0, 1 + (i % 2)) }))

const step = (ta, sa, timing) => ({ teacherActivity: ta, studentActivity: sa, timing })
const FULL_LESSON = {
  ...LESSONS[0], topic: 'ଗୋଟିଏ ପୂର୍ଣ୍ଣର ସମାନ ଭାଗ', format: 'panchapadi',
  panchapadi: {
    prastabana: step('<p>ଶିକ୍ଷକ ଗୋଟିଏ ରୁଟି ଦେଖାଇ ପଚାରିବେ: <b>"ଏହାକୁ ଦୁଇ ଭାଇଙ୍କ ମଧ୍ୟରେ ସମାନ ଭାବେ କିପରି ବାଣ୍ଟିବା?"</b></p>', '<p>ପିଲାମାନେ ନିଜ ଅନୁଭୂତି କହିବେ — ପିଠା, କମଳା, ଚକୋଲେଟ୍ ବାଣ୍ଟିବା।</p>', '୫ ମିନିଟ୍'),
    anweshana: step('<p>କାଗଜକୁ ଦୁଇ ଓ ଚାରି ସମାନ ଭାଗରେ ଭାଙ୍ଗି <b>½</b> ଓ <b>¼</b> ଦେଖାଇବେ। ବୋର୍ଡରେ ଚିତ୍ର ଆଙ୍କିବେ।</p><ul><li>ଲବ (numerator) = ନିଆଯାଇଥିବା ଭାଗ</li><li>ହର (denominator) = ମୋଟ ସମାନ ଭାଗ</li></ul>', '<p>ପ୍ରତ୍ୟେକ ଦଳ କାଗଜ ଭାଙ୍ଗି ½, ¼, ⅓ ତିଆରି କରିବେ।</p>', '୧୫ ମିନିଟ୍'),
    alochana: step('<p>ଦଳଗତ ଆଲୋଚନା: କେଉଁ ଭାଗ ବଡ଼ — ½ ନା ¼? କାହିଁକି?</p>', '<p>କାର୍ଯ୍ୟପତ୍ରରେ ୫ଟି ଚିତ୍ରର ଭଗ୍ନାଂଶ ଲେଖିବେ।</p>', '୧୦ ମିନିଟ୍'),
    prayoga: step('<p>ଘରେ ଖାଦ୍ୟ ବାଣ୍ଟିବା ଉଦାହରଣ ଦେଇ ପ୍ରଶ୍ନ ପଚାରିବେ।</p>', '<p>ଶ୍ରେଣୀ ଗୃହରେ ଥିବା ବସ୍ତୁରୁ ଭଗ୍ନାଂଶ ଖୋଜିବେ।</p>', '୧୦ ମିନିଟ୍'),
    mulyayana: step('<p>ଶେଷରେ ୩ଟି ଛୋଟ ପ୍ରଶ୍ନ: "ପିଜାର ୮ ଭାଗରୁ ୩ ଭାଗ ଖାଇଲେ କେତେ ଭାଗ ବଳିଲା?"</p>', '<p>ପିଲାମାନେ ଉତ୍ତର ଲେଖି ସାଥୀ ସହ ମିଳାଇବେ।</p>', '୫ ମିନିଟ୍'),
  },
  learningOutcomes: ['M507 — ଗୋଟିଏ ପୂର୍ଣ୍ଣର ଅଂଶକୁ ଭଗ୍ନାଂଶ ରୂପେ ପ୍ରକାଶ କରେ', 'M508 — ସରଳ ଭଗ୍ନାଂଶ ତୁଳନା କରେ'],
  tlm: ['ରଙ୍ଗୀନ କାଗଜ', 'ରୁଟି / ଚିତ୍ର କାର୍ଡ', 'ଭଗ୍ନାଂଶ ଚାର୍ଟ'],
  homework: 'ଘରେ ୩ଟି ଜିନିଷ ସମାନ ଭାଗରେ ବାଣ୍ଟି ଭଗ୍ନାଂଶ ଲେଖି ଆଣିବ।',
}
const CTX = { class: CLASSES[5], book: BOOKS[0], chapter: CHAPTERS[4], siblings: LESSONS.map(l => ({ id: l.id, period: l.period, title: l.title })) }
const LIST_ITEM = (l) => ({ id: l.id, title: l.title, period: l.period, classId: 'c5', bookId: 'b1', chapterId: 'ch5', className: 'Class 5', bookName: 'Gamata (Mathematics)', chapterName: 'ଭଗ୍ନାଂଶ (Fractions)' })
const SEC_IMAGES = [['mango', 'Mango', '🥭', 'linear-gradient(135deg,#FBBF24,#F97316)'], ['lotus', 'Lotus', '🪷', 'linear-gradient(135deg,#F472B6,#DB2777)'], ['peacock', 'Peacock', '🦚', 'linear-gradient(135deg,#22D3EE,#2563EB)'], ['konark', 'Konark', '🛕', 'linear-gradient(135deg,#FB923C,#B91C1C)'], ['tiger', 'Tiger', '🐅', 'linear-gradient(135deg,#FCD34D,#EA580C)'], ['tree', 'Tree', '🌳', 'linear-gradient(135deg,#4ADE80,#15803D)']]
  .map(([id, label, emoji, gradient], i) => ({ id, label, emoji, gradient, order: i, active: true }))

function handler(user, opts = {}) {
  const premium = !!(user && user.subscription && user.subscription.status === 'active')
  return (method, path, q, body) => {
    if (path === '/auth/me') return user ? [200, { user, active: premium }] : [401, { error: 'Unauthorized' }]
    if (path === '/auth/login') return body && body.password === 'secret1' ? [200, { token: 'demo-token', user: opts.loginUser || user }] : [401, { error: 'Invalid credentials' }]
    if (path === '/auth/send-login-otp') return [200, { ok: true, mobile: '+91 98••••3210', isNew: false, expiresInSec: 300, resendInSec: 30 }]
    if (path === '/auth/verify-login-otp') return body.code === '123456' ? [200, { needsProfile: true, signupToken: 'st', mobile: body.mobile }] : [400, { error: 'Wrong code. Please check and try again.' }]
    if (path === '/security/images') return [200, { images: SEC_IMAGES }]
    if (path === '/classes') return [200, { classes: CLASSES }]
    if (path === '/books') return [200, { books: BOOKS.filter(b => !q.classId || b.classId === q.classId) }]
    if (path === '/chapters') return [200, { chapters: CHAPTERS, total: CHAPTERS.length }]
    if (path === '/lessons') return [200, { lessons: LESSONS, total: LESSONS.length }]
    if (path.startsWith('/lessons/')) {
      if (!user) return [401, { preview: true, lesson: { id: 'l1', period: 1, title: FULL_LESSON.title, topic: FULL_LESSON.topic, preview: FULL_LESSON.panchapadi.prastabana.teacherActivity }, ...CTX, message: 'Login required' }]
      if (!premium) return [402, { preview: true, code: 'NO_SUBSCRIPTION', lesson: { id: 'l1', period: 1, title: FULL_LESSON.title, topic: FULL_LESSON.topic, preview: FULL_LESSON.panchapadi.prastabana.teacherActivity + FULL_LESSON.panchapadi.anweshana.teacherActivity }, ...CTX }]
      return [200, { lesson: FULL_LESSON, ...CTX }]
    }
    if (path === '/settings/public') return [200, { settings: { showPdf: true, showWord: true } }]
    if (path === '/document-security/lesson-plan/config') return [200, { config: { allowPdf: true, allowWord: true } }]
    if (path === '/lesson-curriculum') return [200, { eligible: true, cg: { code: 'CG-3', text: 'ଗଣିତକୁ ଦୈନନ୍ଦିନ ଜୀବନ ସହ ଯୋଡ଼ିବା' }, competency: { code: 'C-3.1', text: 'ଭଗ୍ନାଂଶ ବୁଝିବା ଓ ବ୍ୟବହାର କରିବା' }, learningOutcomes: ['M507 ଭଗ୍ନାଂଶ ପ୍ରକାଶ କରେ'] }]
    if (path === '/search') return [200, { results: q.q && q.q.length > 1 ? LESSONS.map(LIST_ITEM).slice(0, 5) : [] }]
    if (path === '/me/recent') return [200, { lessons: LESSONS.slice(0, 4).map(LIST_ITEM) }]
    if (path === '/me/favorites') return method === 'POST' ? [200, { favorites: ['l1'] }] : [200, { lessons: LESSONS.slice(1, 3).map(LIST_ITEM) }]
    if (path === '/daily-plan/generate') {
      if (!premium) return [402, { error: 'Active subscription required' }]
      return [200, {
        date: body.date, day: 'ସୋମବାର', schoolName: body.schoolName,
        timetable: [{ name: 'ପ୍ରାର୍ଥନା', time: '9:30', kind: 'assembly' }, { name: 'ପିରିୟଡ୍ ୧', time: '10:00' }, { name: 'ପିରିୟଡ୍ ୨', time: '10:45' }, { name: 'ଜଳଖିଆ', time: '11:30', kind: 'break' }],
        periods: body.slots.map((s, i) => ({ periodNum: i + 1, time: ['10:00–10:45', '10:45–11:30'][i % 2], lessonId: s.lessonId, className: 'Class 5', subject: 'Gamata', chapterName: 'ଭଗ୍ନାଂଶ', title: LESSONS[i % 6].title, loCode: 'M507', loDescription: 'ଗୋଟିଏ ପୂର୍ଣ୍ଣର ଅଂଶକୁ ଭଗ୍ନାଂଶ ରୂପେ ପ୍ରକାଶ କରେ', panchapadi: FULL_LESSON.panchapadi, tlm: FULL_LESSON.tlm, homework: FULL_LESSON.homework })),
      }]
    }
    return null
  }
}

const now = Date.now()
const PREMIUM_USER = { id: 'demo', name: 'Sunita Mohanty', mobile: '9876543210', role: 'user', securitySetupCompleted: true, favorites: ['l2', 'l3'], subscription: { plan: 'yearly', status: 'active', startDate: new Date(now - 151 * day).toISOString(), expiryDate: new Date(now + 214 * day).toISOString() } }
const FREE_USER = { ...PREMIUM_USER, id: 'free', name: 'Rakesh Sahu', subscription: { status: 'none' }, favorites: [] }
const NEW_USER = { ...FREE_USER, securitySetupCompleted: false }
module.exports = { handler, PREMIUM_USER, FREE_USER, NEW_USER }
