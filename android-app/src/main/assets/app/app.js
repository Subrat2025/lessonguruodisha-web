/* Lesson Guru Odisha — in-app hub.
 * Served at https://lessonguruodisha.in/__app/ so it shares localStorage (em_token)
 * and cookies with the live platform. Works offline from bundled assets.
 */
(function () {
  'use strict'

  // ------------------------------------------------------------ native bridge
  const N = window.LGApp || null
  const native = {
    info() { try { return N ? JSON.parse(N.getInfo()) : {} } catch (e) { return {} } },
    haptic(k) { try { N && N.haptic(k || 'tap') } catch (e) {} },
    share(s, t) { if (N) N.share(s, t); else if (navigator.share) navigator.share({ title: s, text: t }).catch(() => {}) },
    external(u) { if (N) N.openExternal(u); else window.open(u, '_blank') },
    rate() { N ? N.rateApp() : toast('Thanks for your love! ⭐') },
    statusBar(style) { try { N && N.setStatusBarStyle && N.setStatusBarStyle(style) } catch (e) {} },
  }

  const info = native.info()
  const DIRECT = !!info.direct // direct APK (not the Play Store version): buying is allowed
  if (info.sat != null) document.documentElement.style.setProperty('--sat', info.sat + 'px')
  if (info.sab != null) document.documentElement.style.setProperty('--sab', info.sab + 'px')

  // ------------------------------------------------------------ storage helpers
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v) } catch (e) { return d } },
    raw(k) { try { return localStorage.getItem(k) } catch (e) { return null } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} },
    del(k) { try { localStorage.removeItem(k) } catch (e) {} },
  }
  const $ = (s, r) => (r || document).querySelector(s)
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s))
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const OD_DIGITS = '୦୧୨୩୪୫୬୭୮୯'
  const od = (n) => String(n).replace(/\d/g, d => OD_DIGITS[d])

  // ------------------------------------------------------------ icons (24px line set)
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11h5v-6h4v6h5V9"/>',
    grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="2.2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2.2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2.2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.2"/>',
    crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    calendarBig: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18M9 15.5l2 2 4-4"/>',
    book: '<path d="M2 5.5C2 4.7 2.7 4 3.5 4H9a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5h-6A1.5 1.5 0 0 1 2 16z"/><path d="M22 5.5c0-.8-.7-1.5-1.5-1.5H15a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5h6A1.5 1.5 0 0 0 22 16z"/>',
    layers: '<path d="M12 2 2 7l10 5 10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    steps: '<path d="M3 21h4v-4h4v-4h4V9h4V5h2"/>',
    paper: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    spark: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    bank: '<ellipse cx="12" cy="5" rx="8.5" ry="3"/><path d="M3.5 5v14c0 1.7 3.8 3 8.5 3s8.5-1.3 8.5-3V5"/><path d="M3.5 12c0 1.7 3.8 3 8.5 3s8.5-1.3 8.5-3"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
    users: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-1a6 6 0 0 1 12 0v1M16 3.1a4 4 0 0 1 0 7.8M22 21v-1a6 6 0 0 0-4-5.7"/>',
    bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M16 14h.01"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M8.2 13.3 7 22l5-3 5 3-1.2-8.7"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    dash: '<rect x="3" y="3" width="8" height="10" rx="2"/><rect x="13" y="3" width="8" height="6" rx="2"/><rect x="13" y="11" width="8" height="10" rx="2"/><rect x="3" y="15" width="8" height="6" rx="2"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    share: '<circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="m8.3 10.8 7.4-4.1M8.3 13.2l7.4 4.1"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21 7 14.2 2 9.3l6.9-1z"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 21l2.2-5.4A8.5 8.5 0 1 1 21 11.5z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    chev: '<path d="m9 18 6-6-6-6"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    refund: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 8v4l3 2"/>',
    login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
    gift: '<rect x="3" y="8" width="18" height="5" rx="1.5"/><path d="M12 8v13M19 13v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    cloud: '<path d="M17.5 19H7a5 5 0 1 1 1.1-9.9A6 6 0 0 1 19.6 11 4 4 0 0 1 17.5 19z"/>',
    cloudUp: '<path d="M17.5 19H7a5 5 0 1 1 1.1-9.9A6 6 0 0 1 19.6 11 4 4 0 0 1 17.5 19z"/><path d="M12 16v-6M9.5 12.5 12 10l2.5 2.5"/>',
    more: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    open: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  }
  function icon(name, size, sw) {
    return `<svg width="${size || 24}" height="${size || 24}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`
  }
  function hydrateIcons(root) {
    $$('[data-icon]', root).forEach(el => {
      const big = el.dataset.icon === 'calendarBig'
      el.innerHTML = icon(el.dataset.icon, big ? 30 : (el.classList.contains('ic') ? 20 : 22), big ? 2.1 : 2)
    })
  }

  // ------------------------------------------------------------ content
  const G = {
    violet: ['linear-gradient(135deg,#8B5CF6,#4F46E5)', 'rgba(99,70,229,.9)'],
    sunset: ['linear-gradient(135deg,#FF8A00,#FF2D78)', 'rgba(255,45,120,.9)'],
    teal: ['linear-gradient(135deg,#06B6D4,#10B981)', 'rgba(16,185,129,.9)'],
    rose: ['linear-gradient(135deg,#FB7185,#E11D48)', 'rgba(225,29,72,.9)'],
    amber: ['linear-gradient(135deg,#FBBF24,#F97316)', 'rgba(249,115,22,.9)'],
    blue: ['linear-gradient(135deg,#38BDF8,#6366F1)', 'rgba(99,102,241,.9)'],
    green: ['linear-gradient(135deg,#4ADE80,#14B8A6)', 'rgba(20,184,166,.9)'],
    fuchsia: ['linear-gradient(135deg,#E879F9,#8B5CF6)', 'rgba(168,85,247,.9)'],
    indigo: ['linear-gradient(135deg,#818CF8,#3730A3)', 'rgba(55,48,163,.9)'],
    slate: ['linear-gradient(135deg,#94A3B8,#475569)', 'rgba(71,85,105,.9)'],
    gold: ['linear-gradient(135deg,#FCD34D,#D97706)', 'rgba(217,119,6,.9)'],
  }

  const TOOLS = [
    { id: 'lessons', path: '/lessons', t: 'Lesson Plans', o: 'ଶିକ୍ଷଣ ଯୋଜନା', d: 'Balvatika to Class 10, chapter-wise & NCF aligned', cat: 'plan', g: 'violet', i: 'book', b: 'HOT' },
    { id: 'daily', path: '/daily-plan', t: 'Daily Plan', o: 'ଆଜିର ଶିକ୍ଷଣ ଯୋଜନା', d: "Today's ready-to-teach plan for your class", cat: 'plan', g: 'blue', i: 'calendar' },
    { id: 'panchapadi', path: '/panchapadi', t: 'Panchapadi', o: 'ପଞ୍ଚପଦୀ', d: '5-step Panchapadi plans with activities', cat: 'plan', g: 'sunset', i: 'steps', b: 'HOT' },
    { id: 'abp', path: '/abp', t: 'Annual Plan', o: 'ବାର୍ଷିକ ପାଠ୍ୟ ଖସଡ଼ା', d: 'Month-wise chapters for the whole year', cat: 'plan', g: 'rose', i: 'layers', b: 'NEW' },
    { id: 'instant', path: '/instant-plan', t: 'Instant Plan', o: 'ମାତ୍ର ୩୦ ସେକେଣ୍ଡରେ', d: 'Generate a daily plan in 30 seconds', cat: 'plan', g: 'fuchsia', i: 'bolt', b: 'AI' },
    { id: 'multigrade', path: '/multigrade', t: 'Multigrade', o: 'ବହୁ ଶ୍ରେଣୀ', d: 'Plans for 2–3 classes taught together', cat: 'plan', g: 'green', i: 'users' },
    { id: 'ajira', path: '/ajira-pathya-jojana', t: 'Ajira Pathya Jojana', o: 'ଆଜିର ପାଠ୍ୟ ଯୋଜନା', d: "Today's pathya jojana, ready to print", cat: 'plan', g: 'amber', i: 'paper' },
    { id: 'assess', path: '/assessments', t: 'Assessments', o: 'ମୂଲ୍ୟାୟନ', d: 'Chapter-wise tests & answer keys', cat: 'assess', g: 'rose', i: 'target' },
    { id: 'qp', path: '/question-papers', t: 'Question Papers', o: 'ପ୍ରଶ୍ନପତ୍ର', d: 'Build & download print-ready papers', cat: 'assess', g: 'teal', i: 'paper', b: 'HOT' },
    { id: 'qbank', path: '/qbank', t: 'Question Bank', o: 'ପ୍ରଶ୍ନ ଭଣ୍ଡାର', d: 'Thousands of questions by chapter', cat: 'assess', g: 'blue', i: 'bank' },
    { id: 'lo', path: '/learning-outcomes', t: 'Learning Outcomes', o: 'ଶିକ୍ଷଣ ଫଳାଫଳ', d: 'Search LO codes & competencies', cat: 'assess', g: 'indigo', i: 'pulse' },
    { id: 'mcm', path: '/mcm-test', t: 'MCM Test', o: 'MCM ପରୀକ୍ଷା', d: 'Practice & verify MCM tests', cat: 'assess', g: 'violet', i: 'award' },
    { id: 'res', path: '/resources', t: 'Resource Library', o: 'ପାଠାଗାର', d: 'Worksheets, TLMs & teacher resources', cat: 'res', g: 'green', i: 'folder' },
    { id: 'tob', path: '/tob', t: 'Teacher Observation', o: 'ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ', d: 'Observation book & gradebook', cat: 'res', g: 'slate', i: 'eye' },
    { id: 'library', path: '/store/library', t: 'My Library', o: 'ମୋ ପାଠାଗାର', d: 'Packs and papers on your account', cat: 'me', g: 'sunset', i: 'bag' },
    { id: 'isearch', path: '/instant-search', t: 'Instant Search', o: 'ତୁରନ୍ତ ଖୋଜ', d: 'Find any lesson, chapter or topic', cat: 'ai', g: 'teal', i: 'search' },
    { id: 'wallet', path: '/ai-wallet', t: 'AI Wallet', o: 'AI କ୍ରେଡିଟ୍', d: 'Credits for AI worksheets & papers', cat: 'ai', g: 'fuchsia', i: 'wallet' },
    { id: 'dash', path: '/dashboard', t: 'My Dashboard', o: 'ମୋ ଡ୍ୟାସବୋର୍ଡ', d: 'Recent lessons, payments & plan', cat: 'me', g: 'indigo', i: 'dash' },
    { id: 'fav', path: '/favorites', t: 'Favourites', o: 'ପସନ୍ଦ', d: 'Lessons you saved', cat: 'me', g: 'rose', i: 'heart' },
    { id: 'hist', path: '/history', t: 'History', o: 'ଇତିହାସ', d: 'Everything you opened recently', cat: 'me', g: 'slate', i: 'clock' },
    { id: 'cloud', path: '#cloud', t: 'Cloud Library', o: 'କ୍ଲାଉଡ୍ ପାଠାଗାର', d: 'Your PDFs, safe on every phone', cat: 'me', g: 'teal', i: 'cloud' },
    { id: 'plan', path: '/my-plan', t: 'My Plan', o: 'ମୋ ପ୍ଲାନ୍', d: 'Your Premium status', cat: 'me', g: 'gold', i: 'crown' },
    { id: 'profile', path: '#profile', t: 'Profile & Settings', o: 'ପ୍ରୋଫାଇଲ୍', d: 'Account, security, help', cat: 'me', g: 'indigo', i: 'user' },
  ]
  const CATS = [['all', 'All'], ['plan', 'Lesson Plans'], ['assess', 'Assessment'], ['ai', 'AI Tools'], ['res', 'Resources'], ['me', 'My Stuff']]
  const CAT_SUB = { plan: 'ଶିକ୍ଷଣ ଯୋଜନା', assess: 'ମୂଲ୍ୟାୟନ', ai: 'AI ସାଧନ', res: 'ସମ୍ବଳ', me: 'ମୋ ଜିନିଷ' }
  const QUICK = ['lessons', 'panchapadi', 'qp', 'assess', 'daily', 'qbank', 'abp']

  const CLASSES = [{ n: 'B', t: 'Balvatika', o: 'ବାଳବାଟିକା' }].concat(
    Array.from({ length: 10 }, (_, i) => ({ n: String(i + 1), t: 'Class ' + (i + 1), o: 'ଶ୍ରେଣୀ ' + od(i + 1) })))
  const CLASS_G = ['sunset', 'violet', 'teal', 'rose', 'blue', 'amber', 'green', 'fuchsia', 'indigo', 'sunset', 'teal']

  const TIPS = [
    ['Start every class with a 2-minute recall question — it boosts retention more than re-reading.', 'ପ୍ରତି କ୍ଲାସ ଆରମ୍ଭରେ ୨ ମିନିଟ୍ ପୂର୍ବ ଜ୍ଞାନ ପ୍ରଶ୍ନ ପଚାରନ୍ତୁ।'],
    ['Call children by name and praise effort, not just answers. Confidence grows fast.', 'ପିଲାଙ୍କୁ ନାମରେ ଡାକନ୍ତୁ ଓ ଚେଷ୍ଟାକୁ ପ୍ରଶଂସା କରନ୍ତୁ।'],
    ['Use local examples — market, farm, festival — to explain new concepts.', 'ନୂଆ ଧାରଣା ପାଇଁ ସ୍ଥାନୀୟ ଉଦାହରଣ ବ୍ୟବହାର କରନ୍ତୁ।'],
    ['Pair a stronger learner with one who needs help. Both learn more.', 'ଦକ୍ଷ ଶିକ୍ଷାର୍ଥୀଙ୍କୁ ସାହାଯ୍ୟ ଦରକାର ଥିବା ପିଲା ସହ ଯୋଡ଼ନ୍ତୁ।'],
    ['End with a one-line exit question to see who understood today’s lesson.', 'ଶେଷରେ ଗୋଟିଏ ଛୋଟ ପ୍ରଶ୍ନ ପଚାରି ବୁଝାମଣା ଯାଞ୍ଚ କରନ୍ତୁ।'],
    ['Wait 5 seconds after asking a question. More hands will go up.', 'ପ୍ରଶ୍ନ ପଚାରିବା ପରେ ୫ ସେକେଣ୍ଡ ଅପେକ୍ଷା କରନ୍ତୁ।'],
    ['Draw it! A quick sketch on the board makes abstract ideas concrete.', 'ବୋର୍ଡରେ ଛୋଟ ଚିତ୍ର ଆଙ୍କି ବୁଝାନ୍ତୁ।'],
    ['Give homework that takes 15 minutes, not an hour. Consistency beats volume.', 'ଅଳ୍ପ କିନ୍ତୁ ନିୟମିତ ଗୃହକାର୍ଯ୍ୟ ଦିଅନ୍ତୁ।'],
    ['Celebrate small wins on a class wall — progress you can see motivates everyone.', 'ଛୋଟ ସଫଳତାକୁ ମଧ୍ୟ ଉତ୍ସବ ପରି ପାଳନ କରନ୍ତୁ।'],
    ['Plan tomorrow’s lesson today. Five minutes of planning saves thirty in class.', 'ଆସନ୍ତାକାଲିର ଯୋଜନା ଆଜି ହିଁ କରନ୍ତୁ।'],
    ['Let learners explain to the class — teaching is the best way to learn.', 'ପିଲାଙ୍କୁ ମଧ୍ୟ ବୁଝାଇବାକୁ ସୁଯୋଗ ଦିଅନ୍ତୁ।'],
    ['Mix it up: story, song, game or group work keeps young minds engaged.', 'ଗପ, ଗୀତ, ଖେଳ ଓ ଦଳଗତ କାର୍ଯ୍ୟ ମିଶାନ୍ତୁ।'],
  ]
  const OD_MONTHS = ['ଜାନୁଆରୀ', 'ଫେବୃଆରୀ', 'ମାର୍ଚ୍ଚ', 'ଅପ୍ରେଲ', 'ମେ', 'ଜୁନ', 'ଜୁଲାଇ', 'ଅଗଷ୍ଟ', 'ସେପ୍ଟେମ୍ବର', 'ଅକ୍ଟୋବର', 'ନଭେମ୍ବର', 'ଡିସେମ୍ବର']
  const OD_DAYS = ['ରବିବାର', 'ସୋମବାର', 'ମଙ୍ଗଳବାର', 'ବୁଧବାର', 'ଗୁରୁବାର', 'ଶୁକ୍ରବାର', 'ଶନିବାର']
  const SUPPORT_WA = '918093414633'

  // ------------------------------------------------------------ state
  const state = {
    tab: 'home',
    user: LS.get('lgapp_user', null),
    plans: LS.get('lgapp_plans', null),
    cat: 'all',
    q: '',
  }
  const token = () => LS.raw('em_token')

  function subInfo(u) {
    const s = (u && u.subscription) || {}
    const exp = s.expiryDate ? new Date(s.expiryDate) : null
    const active = s.status === 'active' && exp && exp > new Date()
    const days = exp ? Math.max(0, Math.ceil((exp - new Date()) / 86400000)) : 0
    const lifetime = active && (s.plan === 'lifetime' || days > 3650)
    const start = s.startDate ? new Date(s.startDate) : null
    const total = start && exp ? Math.max(1, (exp - start) / 86400000) : 365
    return { active, days, lifetime, plan: s.plan || '', pct: active ? Math.min(100, Math.max(4, (days / total) * 100)) : 0 }
  }

  // ------------------------------------------------------------ navigation
  function go(path) {
    native.haptic('tap')
    if (path.charAt(0) === '#') { if (window.LG && LG.popAll) LG.popAll(); setTab(path.slice(1)); return }
    if (window.LG && LG.open && LG.open(path)) return // native screen (pages.js)
    document.body.style.transition = 'opacity .18s'
    document.body.style.opacity = '.55'
    setTimeout(() => { location.href = path }, 60)
  }
  window.addEventListener('pageshow', () => { document.body.style.opacity = '1' })

  function setTab(tab, silent) {
    if (!['home', 'explore', 'premium', 'cloud', 'profile'].includes(tab)) tab = 'home'
    state.tab = tab
    $$('.screen').forEach(s => s.classList.toggle('on', s.id === 's-' + tab))
    $$('.nb').forEach(b => b.classList.toggle('on', b.dataset.tab === tab))
    render(tab)
    try { history.replaceState(null, '', '#' + tab) } catch (e) {}
    window.scrollTo(0, 0)
    $('#sbar').classList.remove('on')
    if (!silent) native.haptic('tap')
  }

  window.LGHub = {
    onBack() {
      if ($('.sheet-bg')) { $('.sheet-bg').remove(); return true }
      if (window.LG && LG.back && LG.back()) return true
      if (!$('#onboard').classList.contains('hidden')) return false
      if (state.tab !== 'home') { setTab('home'); return true }
      return false
    },
  }

  let toastT
  function toast(msg) {
    const t = $('#toast')
    t.textContent = msg
    t.classList.add('on')
    clearTimeout(toastT)
    toastT = setTimeout(() => t.classList.remove('on'), 2200)
  }

  // ------------------------------------------------------------ habit tracking (local, private)
  const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  function trackDay() {
    const days = new Set(LS.get('lgapp_days', []))
    days.add(dayKey(new Date()))
    const arr = Array.from(days).sort().slice(-120)
    LS.set('lgapp_days', arr)
    return new Set(arr)
  }
  function streakOf(days) {
    let n = 0
    const d = new Date()
    while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1) }
    return n
  }
  const MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365]

  // ------------------------------------------------------------ data
  async function refreshUser() {
    const t = token()
    if (!t) { state.user = null; LS.del('lgapp_user'); return }
    try {
      const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + t }, cache: 'no-store' })
      if (r.status === 401 || r.status === 403) { state.user = null; LS.del('lgapp_user'); return }
      if (!r.ok) return
      const d = await r.json()
      if (d && d.user) { state.user = d.user; LS.set('lgapp_user', d.user) }
    } catch (e) { /* offline: keep cached */ }
  }
  async function refreshPlans() {
    try {
      const h = token() ? { Authorization: 'Bearer ' + token() } : {}
      const r = await fetch('/api/plans', { headers: h, cache: 'no-store' })
      if (!r.ok) return
      const d = await r.json()
      if (d && Array.isArray(d.plans)) {
        state.plans = d.plans.filter(p => p && p.enabled !== false && Number(p.price) > 0)
        LS.set('lgapp_plans', state.plans)
      }
    } catch (e) {}
  }

  // ------------------------------------------------------------ renderers
  function render(tab) {
    if (tab === 'home') renderHome()
    else if (tab === 'explore') renderExplore()
    else if (tab === 'premium') renderPremium()
    else if (tab === 'profile') renderProfile()
    else if (tab === 'cloud') renderCloud()
    hydrateIcons(document)
  }

  function firstName(u) {
    const n = (u && u.name ? String(u.name) : '').trim()
    return n ? n.split(/\s+/)[0] : ''
  }
  function initials(u) {
    const n = (u && u.name ? String(u.name) : '').trim()
    if (!n) return '👋'
    const p = n.split(/\s+/)
    return ((p[0] || '')[0] + ((p[1] || '')[0] || '')).toUpperCase()
  }
  function greeting() {
    const h = new Date().getHours()
    if (h < 12) return ['Good morning', 'ଶୁଭ ସକାଳ', '☀️']
    if (h < 17) return ['Good afternoon', 'ଶୁଭ ଅପରାହ୍ନ', '🌤️']
    return ['Good evening', 'ଶୁଭ ସନ୍ଧ୍ୟା', '🌙']
  }
  const toolById = (id) => TOOLS.find(t => t.id === id)
  const gStyle = (g) => `background:${G[g][0]};--glow:${G[g][1]}`

  function timeAgo(ts) {
    const m = Math.round((Date.now() - ts) / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return m + ' min ago'
    const h = Math.round(m / 60)
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago')
    const d = Math.round(h / 24)
    return d + (d === 1 ? ' day ago' : ' days ago')
  }

  function continueItem() {
    const nav = LS.get('lg_navState_v1', null)
    if (nav && nav.ts && Date.now() - nav.ts < 86400000 && nav.context) {
      const c = nav.context
      const cls = c.class && c.class.name, book = c.book && c.book.name, ch = c.chapter && c.chapter.name
      const lesson = c.lesson && c.lesson.title
      if (cls || book || ch) {
        return {
          small: [cls, book].filter(Boolean).join(' · ') || 'Lesson Plans',
          title: lesson || ch || book || cls,
          path: c.lesson && c.lesson.id ? '/lesson?id=' + encodeURIComponent(c.lesson.id)
            : ch && c.chapter.id ? `/lesson-list?classId=${encodeURIComponent((c.class || {}).id || '')}&bookId=${encodeURIComponent((c.book || {}).id || '')}&chapterId=${encodeURIComponent(c.chapter.id)}`
              : book && c.book.id ? `/chapters?classId=${encodeURIComponent((c.class || {}).id || '')}&bookId=${encodeURIComponent(c.book.id)}`
                : '/lessons',
          ts: nav.ts,
        }
      }
    }
    const last = LS.get('lgapp_last', null)
    if (last && last.p && Date.now() - last.ts < 7 * 86400000) {
      const p = last.p.split('?')[0]
      const tool = TOOLS.find(t => t.path === p)
      return { small: 'Last opened', title: tool ? tool.t : ((last.t || '').split(/[|—–]/)[0].trim() || 'Lesson Guru'), path: last.p, ts: last.ts }
    }
    return null
  }

  function renderHome() {
    const u = state.user
    const sub = subInfo(u)
    const days = trackDay()
    const streak = streakOf(days)
    const [gEn, gOd, gEm] = greeting()
    const now = new Date()
    const week = LS.get('lgapp_week', {})
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
    const activity = week.ws === monday.getTime() ? (week.n || 0) : 0
    const goal = 10
    const pct = Math.min(1, activity / goal)
    const C = 2 * Math.PI * 34
    const favClass = LS.get('lgapp_fav_class', null)
    const tip = TIPS[Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000) % TIPS.length]
    const cont = continueItem()
    const name = firstName(u)

    const weekDots = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i)
      const k = dayKey(d)
      return `<i class="${days.has(k) ? 'on' : ''} ${k === dayKey(now) ? 'today' : ''}">${l}</i>`
    }).join('')

    const streakMsg = streak <= 1
      ? 'Your streak starts today! Come back tomorrow to make it 2 🔥'
      : `Amazing consistency! Open tomorrow to reach ${streak + 1} days.`

    const quick = QUICK.map(id => {
      const t = toolById(id)
      return `<button class="q tap" data-go="${t.path}">${t.b ? `<em class="badge ${t.b === 'NEW' ? 'new' : ''}">${t.b}</em>` : ''}<div class="ico" style="${gStyle(t.g)}">${icon(t.i, 26)}</div><span>${t.t}</span></button>`
    }).join('') + `<button class="q tap" data-tab-go="explore"><div class="ico" style="${gStyle('slate')}">${icon('grid', 24)}</div><span>All Tools</span></button>`

    // Consumption-only app (Google Play Payments policy): show plan status, never an upsell.
    const promo = sub.active
      ? `<div class="promo active tap" data-tab-go="premium"><div class="crown">👑</div><small>${sub.lifetime ? 'Lifetime member' : 'Premium active'}</small>
          <h3>${sub.lifetime ? 'Everything unlocked, forever ✨' : `${sub.days} days of Premium left`}</h3>
          ${sub.lifetime ? '' : `<div class="meter"><i style="width:${sub.pct}%"></i></div>`}
          <p>Thank you for supporting Lesson Guru. Enjoy unlimited plans & downloads.</p></div>`
      : ''

    $('#s-home').innerHTML = `
      <header class="hero">
        <div class="hero-top">
          <button class="avatar tap" data-tab-go="profile">${esc(initials(u))}</button>
          <div class="hello"><small>${gEn} ${gEm}</small><b>${name ? esc(name) : 'Welcome, Teacher'}</b></div>
          <span class="pill"><span class="flame">🔥</span>${streak}</span>
        </div>
        <h1><span class="od">${gOd}${name ? ', ' + esc(name) : ''}!</span><br>What will you teach today?</h1>
        <button class="search tap" data-go="/instant-search">${icon('search', 20)}Search lessons, chapters, LO codes…<span class="kbd">AI</span></button>
      </header>
      <div class="wrap lift stagger">
        <div class="today tap" data-go="/daily-plan">
          <div class="cal"><div class="m">${now.toLocaleString('en-IN', { month: 'short' })}</div><div class="d">${now.getDate()}</div></div>
          <div class="today-body">
            <div class="eyebrow"><i class="live"></i>Today's plan · ${now.toLocaleString('en-IN', { weekday: 'long' })}</div>
            <h3>Your daily lesson plan is ready</h3>
            <div class="od">${OD_DAYS[now.getDay()]}, ${od(now.getDate())} ${OD_MONTHS[now.getMonth()]}</div>
          </div>
          <div class="go-btn">${icon('arrow', 22, 2.4)}</div>
        </div>

        <div class="sec"><h2>Quick Tools<small>Everything you need, one tap away</small></h2></div>
        <div class="qgrid">${quick}</div>

        <div class="sec"><h2>Your Teaching Streak</h2></div>
        <div class="streak">
          <div class="ring">
            <svg width="82" height="82"><circle cx="41" cy="41" r="34" stroke="rgba(255,255,255,.15)" stroke-width="8" fill="none"/>
            <circle cx="41" cy="41" r="34" stroke="url(#rg)" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" style="transition:stroke-dashoffset 1s"/>
            <defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#FFD60A"/><stop offset="1" stop-color="#FF2D78"/></linearGradient></defs></svg>
            <div class="val"><div><b>${activity}</b><small>of ${goal}<br>this week</small></div></div>
          </div>
          <div class="streak-body">
            <h3>🔥 ${streak} day${streak === 1 ? '' : 's'} streak</h3>
            <p>${streakMsg}</p>
            <div class="week">${weekDots}</div>
          </div>
        </div>

        ${cont ? `<div class="sec"><h2>Continue where you left off</h2></div>
        <div class="cont tap" data-go="${esc(cont.path)}">
          <div class="thumb">${icon('book', 24)}</div>
          <div class="t"><small>${esc(cont.small)}</small><b>${esc(cont.title)}</b><small>${timeAgo(cont.ts)}</small></div>
          <span class="chev">${icon('chev', 20)}</span>
        </div>` : ''}

        <div class="sec"><h2>Cloud Library<small>Every PDF you download, saved safely</small></h2><button data-tab-go="cloud">Open</button></div>
        <div id="homeCloud"></div>

        <div class="sec"><h2>Choose your class<small class="od">ଶ୍ରେଣୀ ବାଛନ୍ତୁ</small></h2><button data-go="/lessons">See all</button></div>
        <div class="hscroll">${CLASSES.map((c, i) => `<button class="cls tap ${favClass === c.n ? 'fav' : ''}" data-cls="${c.n}"><div class="n" style="${gStyle(CLASS_G[i])}">${c.n}</div><span>${c.t}</span><span class="od">${c.o}</span></button>`).join('')}</div>

        <div style="height:6px"></div>
        ${promo}

        <div class="sec"><h2>Tip of the day<small>For a happier classroom</small></h2></div>
        <div class="tip"><div class="q-mark">“</div><small>💡 Teacher tip</small><p>${esc(tip[0])}</p><p class="od">${esc(tip[1])}</p></div>

        <div class="sec"><h2>Trusted across Odisha</h2></div>
        <div class="stats"><div><b data-count="12500">0</b><span>Teachers</span></div><div><b data-count="8400">0</b><span>Lesson plans</span></div><div><b data-count="95" data-suffix="%">0</b><span>Satisfaction</span></div></div>
        <div class="made">Made with ❤️ for Odisha's teachers</div>
      </div>`
    countUp($('#s-home'))
    drawHomeCloud()
    if (token() && !cloud.loading && Date.now() - (cloud.loadedAt || 0) > 30000) loadCloud()
    maybeMilestone(streak)
  }

  function countUp(root) {
    $$('[data-count]', root).forEach(el => {
      const target = +el.dataset.count, suf = el.dataset.suffix || '+'
      const t0 = performance.now(), dur = 1200
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3)
        el.textContent = Math.round(target * e).toLocaleString('en-IN') + suf
        if (p < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
  }

  function maybeMilestone(streak) {
    const seen = LS.get('lgapp_milestones', [])
    const m = MILESTONES.filter(x => x <= streak && !seen.includes(x)).pop()
    if (!m) return
    seen.push(...MILESTONES.filter(x => x <= streak && !seen.includes(x)))
    LS.set('lgapp_milestones', seen)
    setTimeout(() => {
      confetti()
      native.haptic('success')
      const bg = document.createElement('div')
      bg.className = 'sheet-bg'
      bg.innerHTML = `<div class="sheet"><div class="em">🏆</div><h3>${m}-day streak!</h3>
        <p>You've opened Lesson Guru ${m} days in a row. Great teachers are consistent — and so are you! 🎉</p>
        <button class="btn btn-primary tap" data-close>Keep it going ${icon('arrow', 20, 2.4)}</button></div>`
      bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) bg.remove() })
      document.body.appendChild(bg)
    }, 900)
  }

  function confetti() {
    const c = document.createElement('div')
    c.className = 'confetti'
    const colors = ['#FF2D78', '#FFB800', '#8B5CF6', '#10B981', '#06B6D4', '#FF8A00']
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('i')
      p.style.left = Math.random() * 100 + '%'
      p.style.background = colors[i % colors.length]
      p.style.animationDuration = (1.6 + Math.random() * 1.6) + 's'
      p.style.animationDelay = (Math.random() * .5) + 's'
      p.style.transform = `rotate(${Math.random() * 360}deg)`
      c.appendChild(p)
    }
    document.body.appendChild(c)
    setTimeout(() => c.remove(), 4000)
  }

  function renderExplore() {
    const el = $('#s-explore')
    if (!el.dataset.built) {
      el.dataset.built = '1'
      el.innerHTML = `
        <header class="phead">
          <h1>All Tools</h1><p>Every page of Lesson Guru in one place · <span class="od">ସମସ୍ତ ସାଧନ</span></p>
          <label class="sfield">${icon('search', 20)}<input id="exq" type="search" placeholder="Search tools — e.g. paper, ପଞ୍ଚପଦୀ" autocomplete="off"></label>
        </header>
        <div class="chips" id="excats">${CATS.map(([k, l]) => `<button class="chip ${k === state.cat ? 'on' : ''}" data-cat="${k}">${l}</button>`).join('')}</div>
        <div class="tools" id="extools"></div>`
      $('#exq', el).addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); drawTools() })
    }
    drawTools()
  }
  function drawTools() {
    const q = state.q
    const list = TOOLS.filter(t => (state.cat === 'all' || t.cat === state.cat) &&
      (!q || (t.t + ' ' + t.o + ' ' + t.d).toLowerCase().includes(q)))
    const card = (t, i) => `
      <button class="tool tap" data-go="${t.path}" style="--g:${G[t.g][0]};--glow:${G[t.g][1]};animation-delay:${Math.min(i, 10) * 30}ms;text-align:left">
        ${t.b ? `<em class="badge ${t.b === 'NEW' ? 'new' : ''}">${t.b}</em>` : ''}
        <div class="ico">${icon(t.i, 22)}</div><b>${t.t}</b><span class="od">${t.o}</span><p>${t.d}</p>
      </button>`
    // "All": every page, grouped under its section (Lesson Plans first)
    const grouped = state.cat === 'all' && !q
    $('#extools').innerHTML = !list.length ? `<div class="empty"><div>🔎</div>No tools match “${esc(q)}”</div>`
      : grouped ? CATS.slice(1).map(([k, l]) => { const g = TOOLS.filter(t => t.cat === k); return g.length ? `<div class="tgroup"><h3>${l}<small class="od">${CAT_SUB[k] || ''}</small></h3></div>${g.map(card).join('')}` : '' }).join('')
        : list.map(card).join('')
    $$('#excats .chip').forEach(c => c.classList.toggle('on', c.dataset.cat === state.cat))
  }

  // "My Plan": status only. The app is consumption-only (Google Play Payments policy) — nothing is
  // sold here; whatever the teacher's account has is unlocked automatically.
  function renderPremium() {
    const u = state.user
    const sub = subInfo(u)
    const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    const exp = u && u.subscription && u.subscription.expiryDate
    const perks = [
      ['book', 'violet', 'Every lesson plan', 'Balvatika to Class 10 · all subjects'],
      ['download', 'teal', 'PDF & Word downloads', 'Saved to your phone and Cloud Library'],
      ['steps', 'sunset', 'Panchapadi & daily plans', 'Fresh plans for every teaching day'],
      ['paper', 'rose', 'Question papers & tests', 'With answer keys'],
    ]
    $('#s-premium').innerHTML = `
      <header class="prem-hero">
        <span class="sparkle" style="left:12%;top:calc(var(--sat) + 30px)">✦</span><span class="sparkle" style="right:16%;top:calc(var(--sat) + 70px);animation-delay:-.7s">✦</span>
        <div class="crown-big">${sub.active ? '👑' : '🌱'}</div>
        <h1>${!u ? 'My Plan' : sub.active ? (sub.lifetime ? 'Lifetime <span>Premium</span>' : 'You are <span>Premium</span>') : 'Free plan'}</h1>
        <p>${!u ? 'Log in to see your plan.' : sub.active ? (sub.lifetime ? 'Every feature, forever.' : `Valid until ${esc(fmt(exp))} · ${sub.days} days left`) : 'Free tools are ready to use.'}</p>
      </header>
      ${sub.active ? `<div class="perks stagger">${perks.map(([i, g, t, d]) => `<div class="perk"><div class="ico" style="${gStyle(g)}">${icon(i, 22)}</div><div><b>${t}</b><span>${d}</span></div><span class="ok">${icon('check', 22, 2.6)}</span></div>`).join('')}</div>`
        : `<div class="perks"><div class="perk"><div class="ico" style="${gStyle('slate')}">${icon('info', 22)}</div><div><b>${u ? (DIRECT ? 'Unlock every lesson plan' : 'Purchases are not available in the app') : 'Not logged in'}</b><span>${u ? (DIRECT ? 'Go Premium with UPI, card or net banking. It unlocks on this account instantly.' : 'Everything already on your account is unlocked here automatically.') : 'Log in with the same mobile number you use on the website.'}</span></div></div></div>
          ${u && DIRECT ? `<div class="cta-wrap" style="margin-top:14px"><button class="btn btn-primary tap" data-web="/plans">${icon('crown', 19)} Get Premium</button></div>` : ''}`}
      <div class="cta-wrap" style="margin-top:20px">
        ${u ? `<button class="btn btn-primary tap" data-go="/dashboard">My Dashboard ${icon('arrow', 20, 2.4)}</button>` : `<button class="btn btn-primary tap" data-go="/login">${icon('login', 19)} Login</button>`}
      </div>
      <div class="made">Questions? <a data-wa href="#" style="color:var(--violet);font-weight:600">Chat with us on WhatsApp</a></div>`
  }

  function renderProfile() {
    const u = state.user
    const sub = subInfo(u)
    const days = new Set(LS.get('lgapp_days', []))
    const streak = streakOf(days)
    const week = LS.get('lgapp_week', {})
    const mi = (ic, g, title, small, attrs, cls) => `<button class="mi tap ${cls || ''}" ${attrs}><span class="ico" style="background:${g === 'danger' ? '#FFE4E6' : '#F3EEFF'};color:${g === 'danger' ? '#E11D48' : 'var(--violet)'}">${icon(ic, 20)}</span><b>${title}${small ? `<small>${small}</small>` : ''}</b><span class="chev">${icon('chev', 18)}</span></button>`
    const mobile = u && u.mobile ? String(u.mobile).replace(/^(\d{2})\d+(\d{2})$/, '$1••••••$2') : ''
    $('#s-profile').innerHTML = `
      <header class="prof">
        <div class="big-av">${esc(initials(u))}</div>
        <h2>${u ? esc(u.name || 'Teacher') : 'Hello, Teacher!'}</h2>
        <div class="meta">${u ? esc([u.school, mobile].filter(Boolean).join(' · ') || 'Lesson Guru member') : 'Login to sync your plans & downloads'}</div>
        ${u ? `<span class="plan-tag ${sub.active ? 'gold' : ''}">${sub.active ? '👑 ' + (sub.lifetime ? 'Lifetime' : 'Premium') : '🌱 Free plan'}</span>` : ''}
      </header>
      ${u ? `<div class="minis">
          <div class="mini"><b>🔥 ${streak}</b><span>Day streak</span></div>
          <div class="mini"><b>${days.size}</b><span>Active days</span></div>
          <div class="mini"><b>${sub.active ? (sub.lifetime ? '∞' : sub.days) : '—'}</b><span>${sub.active ? 'Days left' : 'Premium'}</span></div>
        </div>` : `<div class="login-card"><h3>Welcome to Lesson Guru 👋</h3><p>Login with your mobile number to unlock your plans, favourites and downloads.</p>
          <div class="row2"><button class="btn btn-primary tap" data-go="/login">${icon('login', 19)} Login</button><button class="btn btn-soft tap" data-go="/register">Register</button></div></div>`}
      <div class="menu-h">My Account</div>
      <div class="menu">
        ${mi('dash', '', 'My Dashboard', 'Recent lessons & payments', 'data-go="/dashboard"')}
        ${mi('heart', '', 'Favourites', 'Lessons you saved', 'data-go="/favorites"')}
        ${mi('clock', '', 'History', week.n ? `${week.n} activities this week` : 'Recently opened', 'data-go="/history"')}
        ${mi('cloud', '', 'Cloud Library', cloud.usage ? `${cloud.usage.count} files · ${fmtBytes(cloud.usage.bytes)} used` : 'Your PDFs, backed up safely', 'data-tab-go="cloud"')}
        ${mi('crown', '', 'My Plan', sub.active ? (sub.lifetime ? 'Lifetime Premium' : `Premium · ${sub.days} days left`) : 'Free plan', 'data-tab-go="premium"')}
        ${mi('wallet', '', 'AI Wallet', 'Credits for AI tools', 'data-go="/ai-wallet"')}
        ${u ? mi('lock', '', 'Change Password', '', 'data-go="/account/change-password"') : ''}
      </div>
      <div class="menu-h">Spread the love</div>
      <div class="menu">
        ${mi('share', '', 'Share with teachers', 'Help a colleague plan faster', 'data-share')}
        ${mi('star', '', 'Rate us 5 stars', 'It really helps us grow', 'data-rate')}
        ${mi('chat', '', 'WhatsApp Support', 'We reply quickly', 'data-wa')}
      </div>
      <div class="menu-h">About</div>
      <div class="menu">
        ${mi('info', '', 'About Lesson Guru', '', 'data-go="/about"')}
        ${mi('shield', '', 'Privacy Policy', '', 'data-go="/privacy"')}
        ${mi('paper', '', 'Terms of Use', '', 'data-go="/terms"')}
        ${mi('refund', '', 'Refund Policy', '', 'data-go="/refund"')}
        ${mi('trash', 'danger', 'Delete account', 'Remove your account and data', 'data-go="/delete-account"', 'danger')}
        ${u ? mi('logout', 'danger', 'Logout', '', 'data-logout', 'danger') : ''}
      </div>
      <div class="ver">Lesson Guru Odisha · v${esc(info.version || '1.0.0')}<br>by Teacher Utility Tool Kit</div>`
  }

  // ------------------------------------------------------------ cloud library
  // Files live on the Lesson Guru server (MongoDB + private cloud storage); the list is cached
  // locally so the screen still shows something offline.
  const cloud = {
    files: LS.get('lgapp_cloud_cache', null), usage: LS.get('lgapp_cloud_usage', null),
    q: '', kind: 'all', loading: false, offline: false, authError: null, uploads: [],
  }
  function fmtBytes(b) {
    b = +b || 0
    if (b < 1024) return b + ' B'
    if (b < 1048576) return Math.round(b / 1024) + ' KB'
    if (b < 1073741824) return (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB'
    return (b / 1073741824).toFixed(1) + ' GB'
  }
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: new Date(d).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
  const autoBackupOn = () => LS.raw('lgapp_cloud_auto') !== '0'
  function sourceText(f) {
    const tool = f.sourcePath && TOOLS.find(t => f.sourcePath === t.path || f.sourcePath.startsWith(t.path + '/'))
    if (f.source === 'app-auto') return tool ? 'Auto-saved from ' + tool.t : 'Auto-saved'
    return f.source === 'web' ? 'From website' : 'Uploaded'
  }
  const KIND = { pdf: ['PDF', 'rose'], image: ['IMG', 'teal'], doc: ['DOC', 'blue'] }

  async function cloudApi(path, opts = {}) {
    const r = await fetch('/api/cloud' + path, { ...opts, cache: 'no-store', headers: { Authorization: 'Bearer ' + token(), ...(opts.headers || {}) } })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong'), { code: j.code, status: r.status })
    return j
  }

  async function loadCloud() {
    if (!token()) return
    cloud.loading = true
    drawCloud()
    const p = new URLSearchParams({ limit: '100' })
    if (cloud.q) p.set('q', cloud.q)
    if (cloud.kind === 'starred') p.set('starred', '1')
    else if (cloud.kind !== 'all') p.set('kind', cloud.kind)
    try {
      const j = await cloudApi('/files?' + p)
      cloud.files = j.files
      cloud.usage = j.usage
      cloud.offline = false
      cloud.authError = null
      cloud.loadedAt = Date.now()
      LS.set('lgapp_cloud_usage', j.usage)
      if (!cloud.q && cloud.kind === 'all') LS.set('lgapp_cloud_cache', j.files.slice(0, 100))
    } catch (e) {
      if (e.status === 401) cloud.authError = e.message
      else cloud.offline = true
    }
    cloud.loading = false
    drawCloud()
    drawHomeCloud()
  }

  function visibleFiles() {
    let list = cloud.files || []
    if (cloud.offline) { // filter the cached list locally
      const q = cloud.q.toLowerCase()
      list = list.filter(f => (!q || f.name.toLowerCase().includes(q)) &&
        (cloud.kind === 'all' || (cloud.kind === 'starred' ? f.starred : f.kind === cloud.kind)))
    }
    return list
  }

  function usageCard(u) {
    if (!u) return ''
    const pct = Math.min(100, (u.bytes / u.quotaBytes) * 100)
    const hot = pct > 85 ? 'hot' : pct > 60 ? 'warm' : ''
    return `<div class="cu">
      <div class="cu-top"><div class="cu-ic">${icon('cloud', 26, 2.2)}</div>
        <div class="cu-t"><b>${fmtBytes(u.bytes)}</b> of ${fmtBytes(u.quotaBytes)} used<small>${u.count} file${u.count === 1 ? '' : 's'} · ${u.plan === 'premium' ? '👑 Premium storage' : 'Free storage'}</small></div>
        <div class="cu-pct">${Math.round(pct)}%</div></div>
      <div class="cu-bar ${hot}"><i style="width:${Math.max(pct, 1.5)}%"></i></div>
      ${u.plan !== 'premium' && u.upgradeQuotaBytes ? `<button class="cu-up tap" data-tab-go="premium">${icon('crown', 15, 2.4)} Get ${fmtBytes(u.upgradeQuotaBytes)} with Premium</button>` : ''}
    </div>`
  }

  function renderCloud() {
    const el = $('#s-cloud')
    if (!token()) {
      el.dataset.built = ''
      el.innerHTML = `<header class="phead cloud-head"><h1>Cloud Library</h1><p>Your PDFs, safe on every device · <span class="od">କ୍ଲାଉଡ୍</span></p></header>
        <div class="login-card" style="margin-top:18px"><div style="font-size:54px">☁️</div><h3>Back up every PDF you make</h3>
        <p>Login and every lesson plan, paper and worksheet you download is saved to your private Cloud Library — open it on any phone, any time.</p>
        <div class="row2"><button class="btn btn-primary tap" data-go="/login">${icon('login', 19)} Login</button><button class="btn btn-soft tap" data-go="/register">Register</button></div></div>`
      return
    }
    if (!el.dataset.built) {
      el.dataset.built = '1'
      el.innerHTML = `
        <header class="phead cloud-head">
          <h1>Cloud Library</h1><p>Your PDFs, safe on every device · <span class="od">କ୍ଲାଉଡ୍</span></p>
          <div id="cloudUsage"></div>
        </header>
        <div class="wrap">
          <div class="cloud-actions">
            <button class="btn btn-primary tap" data-cloud-upload>${icon('cloudUp', 21, 2.2)} Upload file</button>
            <label class="auto tap"><span><b>Auto-backup</b><small>Downloads → cloud</small></span>
              <input type="checkbox" id="cloudAuto" ${autoBackupOn() ? 'checked' : ''}><i class="sw"></i></label>
          </div>
          <label class="sfield light">${icon('search', 20)}<input id="cloudQ" type="search" placeholder="Search your files" autocomplete="off"></label>
        </div>
        <div class="chips" id="cloudKinds">${[['all', 'All'], ['pdf', 'PDFs'], ['starred', '★ Starred'], ['doc', 'Docs'], ['image', 'Images']]
          .map(([k, l]) => `<button class="chip ${k === cloud.kind ? 'on' : ''}" data-ckind="${k}">${l}</button>`).join('')}</div>
        <div class="wrap" id="cloudList"></div>`
      let t
      $('#cloudQ', el).addEventListener('input', (e) => {
        cloud.q = e.target.value.trim()
        clearTimeout(t)
        t = setTimeout(() => (cloud.offline ? drawCloud() : loadCloud()), 300)
      })
      $('#cloudAuto', el).addEventListener('change', (e) => {
        LS.set('lgapp_cloud_auto', e.target.checked ? 1 : 0)
        native.haptic('tap')
        toast(e.target.checked ? 'Auto-backup on ☁️ — downloads will be saved to your cloud' : 'Auto-backup off — downloads stay on this phone only')
      })
    }
    drawCloud()
    loadCloud()
  }

  function drawCloud() {
    const box = $('#cloudList')
    if (!box) return
    $('#cloudUsage').innerHTML = usageCard(cloud.usage)
    $$('#cloudKinds .chip').forEach(c => c.classList.toggle('on', c.dataset.ckind === cloud.kind))
    if (cloud.authError) {
      box.innerHTML = `<div class="cempty"><div>🔒</div><b>${esc(cloud.authError)}</b><button class="btn btn-primary tap" data-go="/login" style="margin-top:14px">Login again</button></div>`
      return
    }
    const ups = cloud.uploads.map(u => `<div class="cf up"><div class="cf-ic" style="${gStyle('violet')}">${icon('cloudUp', 20)}</div>
      <div class="cf-t"><b>${esc(u.name)}</b><div class="bar"><i style="width:${u.pct}%"></i></div></div><span class="cf-pct">${u.pct}%</span></div>`).join('')
    const files = visibleFiles()
    const off = cloud.offline ? `<div class="offbar">${icon('info', 16)} You're offline — showing saved list</div>` : ''
    if (!files.length && !ups) {
      box.innerHTML = off + (cloud.loading && !cloud.files ? `<div class="cempty"><div class="spin"></div></div>` : cloud.q || cloud.kind !== 'all'
        ? `<div class="cempty"><div>🔎</div><b>No files match</b><span>Try another search or filter</span></div>`
        : `<div class="cempty"><div>📂</div><b>Your Cloud Library is empty</b><span>PDFs you download in the app are saved here automatically. You can also upload files from your phone.</span></div>`)
      return
    }
    box.innerHTML = off + ups + files.map((f, i) => {
      const [label, g] = KIND[f.kind] || KIND.doc
      return `<div class="cf tap" data-copen="${f.id}" style="animation-delay:${Math.min(i, 12) * 25}ms">
        <div class="cf-ic" style="${gStyle(g)}">${label}</div>
        <div class="cf-t"><b>${esc(f.name)}</b><small>${fmtBytes(f.bytes)} · ${fmtDate(f.createdAt)} · ${esc(sourceText(f))}</small></div>
        <button class="cf-star ${f.starred ? 'on' : ''}" data-cstar="${f.id}" aria-label="Star">${f.starred ? '★' : '☆'}</button>
        <button class="cf-more" data-cmore="${f.id}" aria-label="More">${icon('more', 20)}</button>
      </div>`
    }).join('')
  }

  function drawHomeCloud() {
    const el = $('#homeCloud')
    if (!el) return
    if (!token()) {
      el.innerHTML = `<div class="hc tap" data-tab-go="cloud"><div class="hc-ic">${icon('cloud', 26, 2.2)}</div>
        <div class="hc-t"><b>Back up your PDFs to the cloud</b><small>Login to keep every download safe on any phone</small></div><span class="chev">${icon('chev', 20)}</span></div>`
      return
    }
    const u = cloud.usage
    const recent = (cloud.files || []).slice(0, 2)
    el.innerHTML = `<div class="hc tap" data-tab-go="cloud"><div class="hc-ic">${icon('cloud', 26, 2.2)}</div>
      <div class="hc-t"><b>Cloud Library</b><small>${u ? `${u.count} file${u.count === 1 ? '' : 's'} · ${fmtBytes(u.bytes)} of ${fmtBytes(u.quotaBytes)}` : 'Your PDFs, backed up automatically'}</small>
      ${u ? `<div class="bar"><i style="width:${Math.max(1.5, Math.min(100, u.bytes / u.quotaBytes * 100))}%"></i></div>` : ''}</div>
      <span class="chev">${icon('chev', 20)}</span></div>
      ${recent.map(f => `<div class="hc-f tap" data-copen="${f.id}"><span class="cf-ic sm" style="${gStyle((KIND[f.kind] || KIND.doc)[1])}">${(KIND[f.kind] || KIND.doc)[0]}</span><b>${esc(f.name)}</b><small>${fmtDate(f.createdAt)}</small></div>`).join('')}`
  }

  const fileById = (id) => (cloud.files || []).find(f => f.id === id)

  async function fetchFileData(f) {
    const r = await fetch('/api/cloud/files/' + f.id + '/download', { headers: { Authorization: 'Bearer ' + token() } })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not download')
    const blob = await r.blob()
    return new Promise((res) => { const fr = new FileReader(); fr.onloadend = () => res({ blob, dataUrl: fr.result }); fr.readAsDataURL(blob) })
  }

  async function openCloudFile(f, keepOnly) {
    toast(keepOnly ? 'Downloading…' : 'Opening ' + f.name + '…')
    native.haptic('tap')
    try {
      const { blob, dataUrl } = await fetchFileData(f)
      if (N) { keepOnly ? N.saveFile(dataUrl, f.name, f.mime) : N.openFile(dataUrl, f.name, f.mime) }
      else window.open(URL.createObjectURL(blob), '_blank')
    } catch (e) { toast(e.message) }
  }

  async function shareCloudFile(f) {
    try {
      const j = await cloudApi('/files/' + f.id + '/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose: 'share', hours: 72 }) })
      native.share(f.name, `📄 ${f.name}\n${j.url}\n\nLink works for 3 days · shared from Lesson Guru Odisha`)
    } catch (e) { toast(e.message) }
  }

  async function patchCloudFile(f, body, msg) {
    try {
      const j = await cloudApi('/files/' + f.id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      Object.assign(f, j.file)
      drawCloud()
      if (msg) toast(msg)
    } catch (e) { toast(e.message) }
  }

  function sheet(html, onClick) {
    const bg = document.createElement('div')
    bg.className = 'sheet-bg'
    bg.innerHTML = `<div class="sheet left">${html}</div>`
    bg.addEventListener('click', (e) => {
      if (e.target === bg) return bg.remove()
      const b = e.target.closest('[data-act]')
      if (b) onClick(b.dataset.act, bg)
    })
    document.body.appendChild(bg)
    native.haptic('tap')
    return bg
  }

  function cloudMenu(f) {
    const row = (act, ic, t, cls) => `<button class="sa tap ${cls || ''}" data-act="${act}">${icon(ic, 21)}<span>${t}</span></button>`
    sheet(`<div class="sh-file"><span class="cf-ic" style="${gStyle((KIND[f.kind] || KIND.doc)[1])}">${(KIND[f.kind] || KIND.doc)[0]}</span>
        <div><b>${esc(f.name)}</b><small>${fmtBytes(f.bytes)} · ${fmtDate(f.createdAt)}</small></div></div>
      ${row('open', 'open', 'Open')}${row('share', 'chat', 'Share link (WhatsApp, etc.)')}${row('save', 'download', 'Save a copy to this phone')}
      ${row('rename', 'edit', 'Rename')}${row('star', 'star', f.starred ? 'Remove star' : 'Star')}${row('revoke', 'link', 'Stop old share links')}${row('delete', 'trash', 'Delete from cloud', 'danger')}`,
    (act, bg) => {
      bg.remove()
      if (act === 'open') openCloudFile(f)
      else if (act === 'share') shareCloudFile(f)
      else if (act === 'save') openCloudFile(f, true)
      else if (act === 'star') patchCloudFile(f, { starred: !f.starred })
      else if (act === 'revoke') patchCloudFile(f, { revokeLinks: true }, 'Old share links no longer work')
      else if (act === 'rename') renameSheet(f)
      else if (act === 'delete') deleteSheet(f)
    })
  }

  function renameSheet(f) {
    const base = f.name.replace(/\.[^.]+$/, '')
    const bg = sheet(`<h3>Rename file</h3><input class="tin" id="renameIn" value="${esc(base)}" maxlength="140">
      <div class="row2"><button class="btn btn-soft tap" data-act="cancel">Cancel</button><button class="btn btn-primary tap" data-act="ok">Save</button></div>`,
    (act, b) => {
      if (act === 'cancel') return b.remove()
      const v = $('#renameIn').value.trim()
      if (!v) return
      b.remove()
      patchCloudFile(f, { name: v }, 'Renamed')
    })
    setTimeout(() => { const i = $('#renameIn', bg); i.focus(); i.select() }, 120)
  }

  function deleteSheet(f) {
    sheet(`<div style="text-align:center"><div style="font-size:52px">🗑️</div><h3>Delete this file?</h3>
      <p>“${esc(f.name)}” will be removed from your Cloud Library on all devices. Copies already saved on phones stay.</p></div>
      <div class="row2"><button class="btn btn-soft tap" data-act="cancel">Keep</button><button class="btn btn-danger tap" data-act="ok">Delete</button></div>`,
    async (act, b) => {
      b.remove()
      if (act !== 'ok') return
      try {
        const j = await cloudApi('/files/' + f.id, { method: 'DELETE' })
        cloud.files = (cloud.files || []).filter(x => x.id !== f.id)
        cloud.usage = j.usage
        LS.set('lgapp_cloud_cache', cloud.files)
        native.haptic('heavy')
        drawCloud()
        toast('Deleted from cloud')
      } catch (e) { toast(e.message) }
    })
  }

  function uploadFiles(list) {
    Array.from(list).forEach(file => {
      const u = { name: file.name, pct: 0 }
      cloud.uploads.push(u)
      drawCloud()
      const fd = new FormData()
      fd.append('file', file, file.name)
      fd.append('source', 'app-upload')
      const x = new XMLHttpRequest()
      x.open('POST', '/api/cloud/files')
      x.setRequestHeader('Authorization', 'Bearer ' + token())
      x.upload.onprogress = (e) => { if (e.lengthComputable) { u.pct = Math.round(e.loaded / e.total * 100); drawCloud() } }
      x.onloadend = () => {
        cloud.uploads = cloud.uploads.filter(v => v !== u)
        let j = {}
        try { j = JSON.parse(x.responseText) } catch (e) {}
        if (x.status === 201) { toast('Uploaded ☁️ ' + file.name); native.haptic('success') }
        else if (x.status === 200 && j.duplicate) toast('Already in your cloud: ' + j.file.name)
        else toast(j.error || 'Upload failed — check your connection')
        loadCloud()
      }
      x.send(fd)
    })
  }

  // ------------------------------------------------------------ events
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cstar],[data-cmore],[data-copen],[data-ckind],[data-cloud-upload],[data-go],[data-navgo],[data-tab],[data-tab-go],[data-cat],[data-cls],[data-share],[data-rate],[data-wa],[data-logout]')
    if (!t) return
    // inside a native screen only links are ours; everything else belongs to that screen
    if (t.closest('#pages') && !t.matches('[data-go],[data-navgo]')) return
    if (t.dataset.cstar) { e.stopPropagation(); const f = fileById(t.dataset.cstar); if (f) patchCloudFile(f, { starred: !f.starred }); native.haptic('tap'); return }
    if (t.dataset.cmore) { const f = fileById(t.dataset.cmore); if (f) cloudMenu(f); return }
    if (t.dataset.copen) { const f = fileById(t.dataset.copen); if (f) openCloudFile(f); return }
    if (t.dataset.ckind) { cloud.kind = t.dataset.ckind; native.haptic('tap'); cloud.offline ? drawCloud() : loadCloud(); return }
    if (t.hasAttribute('data-cloud-upload')) { $('#cloudPick').click(); return }
    if (t.dataset.go) { e.preventDefault(); go(t.dataset.go); return }
    if (t.dataset.navgo) { // bottom bar: start fresh at that section
      if (window.LG && LG.popAll) LG.popAll()
      if (window.LG && LG.open) LG.open(t.dataset.navgo); else location.href = t.dataset.navgo
      return
    }
    if (t.dataset.tab) { if (window.LG && LG.popAll) LG.popAll(); setTab(t.dataset.tab); return }
    if (t.dataset.tabGo) { setTab(t.dataset.tabGo); return }
    if (t.dataset.cat) { state.cat = t.dataset.cat; native.haptic('tap'); drawTools(); return }
    if (t.dataset.cls) { LS.set('lgapp_fav_class', t.dataset.cls); go('/lessons?cls=' + encodeURIComponent(t.dataset.cls)); return }
    if (t.hasAttribute('data-share')) {
      native.share('Lesson Guru Odisha', '📚 I plan my classes with Lesson Guru Odisha — ready lesson plans, Panchapadi, question papers & more for Odisha teachers.\nhttps://lessonguruodisha.in')
      return
    }
    if (t.hasAttribute('data-rate')) { native.rate(); return }
    if (t.hasAttribute('data-wa')) {
      e.preventDefault()
      native.external('https://wa.me/' + SUPPORT_WA + '?text=' + encodeURIComponent('Hello Lesson Guru team, I need help with the app.'))
      return
    }
    if (t.hasAttribute('data-logout')) logout()
  })

  // ------------------------------------------------------------ onboarding
  function runOnboarding(done) {
    const ob = $('#onboard'), track = $('#obTrack'), dots = $$('#obDots i')
    let i = 0, x0 = null
    const n = 3
    ob.classList.remove('hidden')
    native.statusBar('dark')
    hydrateIcons(ob)
    const show = () => {
      track.style.transform = `translateX(${-i * 100}%)`
      dots.forEach((d, k) => d.classList.toggle('on', k === i))
      const last = i === n - 1
      $('#obNext').innerHTML = last ? `Login / Register ${icon('arrow', 20, 2.4)}` : `Next ${icon('arrow', 20, 2.4)}`
      $('#obExplore').classList.toggle('hidden', !last)
      $('.ob-skip').classList.toggle('hidden', last)
    }
    const finish = (path) => { LS.set('lgapp_onboarded', 1); ob.classList.add('hidden'); native.statusBar('light'); done(); if (path) go(path) }
    ob.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ob]')
      if (!b) return
      native.haptic('tap')
      if (b.dataset.ob === 'skip') { i = n - 1; show() }
      else if (b.dataset.ob === 'next') { if (i < n - 1) { i++; show() } else finish(token() ? null : '/login') }
      else if (b.dataset.ob === 'explore') finish(null)
    })
    track.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX }, { passive: true })
    track.addEventListener('touchend', (e) => {
      if (x0 == null) return
      const dx = e.changedTouches[0].clientX - x0
      if (Math.abs(dx) > 45) { i = Math.max(0, Math.min(n - 1, i + (dx < 0 ? 1 : -1))); show(); native.haptic('tap') }
      x0 = null
    })
    show()
  }

  // ------------------------------------------------------------ boot
  $('#cloudPick').addEventListener('change', (e) => { if (e.target.files.length) uploadFiles(e.target.files); e.target.value = '' })

  function logout() {
    LS.del('em_token'); LS.del('lgapp_user'); LS.del('lgapp_cloud_cache'); LS.del('lgapp_cloud_usage'); state.user = null
    cloud.files = null; cloud.usage = null
    native.haptic('heavy'); toast('Logged out'); setTab('profile', true)
  }

  // Shared with the native screens in pages.js / screens/*.js
  window.LG = Object.assign(window.LG || {}, {
    $, $$, esc, od, icon, hydrateIcons, G, gStyle, LS, native, toast, sheet, state, token, subInfo,
    refreshUser, setTab, render, logout, TOOLS, CATS, CAT_SUB, CLASSES, CLASS_G, timeAgo, firstName, initials, SUPPORT_WA,
  })
  Object.defineProperty(window.LG, 'tab', { get: () => state.tab, configurable: true }) // live value, not a copy

  function boot() {
    native.statusBar('light')
    hydrateIcons(document)
    const sbar = $('#sbar')
    window.addEventListener('scroll', () => sbar.classList.toggle('on', window.scrollY > 24), { passive: true })
    const initial = (location.hash || '#home').slice(1)
    const coldStart = !sessionStorage.getItem('lgapp_warm')
    sessionStorage.setItem('lgapp_warm', '1')
    const startApp = () => setTab(initial, true)

    const afterSplash = () => {
      if (!LS.get('lgapp_onboarded', 0) && !token()) runOnboarding(startApp)
      else startApp()
    }
    if (coldStart) {
      const sp = $('#splash')
      sp.classList.remove('hidden')
      setTimeout(() => { sp.classList.add('out'); afterSplash(); setTimeout(() => sp.remove(), 650) }, 1500)
    } else {
      $('#splash').remove()
      afterSplash()
    }
    Promise.all([refreshUser()]).then(() => {
      if (state.tab) render(state.tab)
      if (window.LG && LG.requireSecuritySetup) setTimeout(LG.requireSecuritySetup, coldStart ? 1800 : 300)
    })
  }
  boot()
})()
