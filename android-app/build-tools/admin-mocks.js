// SAMPLE data for adminshots.js. Every value is invented for screenshots; nothing comes from the live DB.
const now = Date.now()
const day = 864e5
const iso = (d) => new Date(now - d * day).toISOString()
const NAMES = ['Sunita Mohanty', 'Prakash Behera', 'Rashmi Sahoo', 'Bikash Nayak', 'Manaswini Das', 'Ajit Pradhan', 'Smita Panda', 'Rajesh Swain', 'Pooja Mishra', 'Debasis Rout', 'Itishree Jena', 'Sanjay Patra']
const SCHOOLS = ['Govt. UP School, Cuttack', 'Nodal High School, Puri', 'PS Balianta, Khordha', 'UGME School, Balasore', 'Govt. HS, Sambalpur', 'PS Jajpur Road']
const CLASSES = [{ id: 'c0', name: 'Balvatika', order: 0 }].concat(Array.from({ length: 10 }, (_, i) => ({ id: 'c' + (i + 1), name: 'Class ' + (i + 1), order: i + 1 })))
const BOOKS = [
  { id: 'b1', name: 'Gamata (Mathematics)', classId: 'c5', chapterCount: 12 },
  { id: 'b2', name: 'Sahitya Sindhu (Odia)', classId: 'c5', chapterCount: 18 },
  { id: 'b3', name: 'Paribesha Adhyayana (EVS)', classId: 'c5', chapterCount: 14 },
  { id: 'b4', name: 'English Reader', classId: 'c5', chapterCount: 10 },
]
const CHAPTERS = ['ଭଗ୍ନାଂଶ (Fractions)', 'ଦଶମିକ ସଂଖ୍ୟା', 'ମାପ ଓ ଓଜନ', 'ଜ୍ୟାମିତି', 'ସମୟ ଓ ଘଣ୍ଟା'].map((n, i) => ({ id: 'ch' + i, name: n, order: i + 1, bookId: 'b1', classId: 'c5', lessonCount: 4 + i }))
const users = NAMES.map((name, i) => ({
  id: 'u' + i, name, mobile: '98' + String(53000000 + i * 7919).slice(0, 8), school: SCHOOLS[i % SCHOOLS.length],
  district: ['Cuttack', 'Puri', 'Khordha', 'Balasore', 'Sambalpur', 'Jajpur'][i % 6], role: 'teacher',
  createdAt: iso(i * 9 + 2), lastLoginAt: iso(i % 4),
  subscription: i % 3 === 2 ? { plan: 'free', status: 'inactive' } : { plan: ['yearly', 'monthly', 'lifetime'][i % 3], status: 'active', startDate: iso(40 + i), expiryDate: new Date(now + (300 - i * 11) * day).toISOString() },
}))
const daily = Array.from({ length: 30 }, (_, i) => ({ date: new Date(now - (29 - i) * day).toISOString().slice(0, 10), amount: Math.round(1800 + 1400 * Math.sin(i / 3) + i * 90), count: 8 + (i % 7) }))
const monthly = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((m, i) => ({ month: m, amount: 31000 + i * 9200, count: 160 + i * 41 }))

module.exports.routes = [
  [/^\/admin\/analytics$/, { totalUsers: 12684, activeSubs: 3127, totalLessons: 8412, totalChapters: 513, totalBooks: 85, dau: 2214, revenue: '4,86,300', payments: 3790,
    popularLessons: ['ଭଗ୍ନାଂଶ - Period 1', 'Our Environment - Period 2', 'ସରଳ ସୁଧ - Period 3', 'Light & Shadow - Period 1', 'ଜଳ ଚକ୍ର - Period 2'].map((title, i) => ({ title, views: 980 - i * 130 })),
    popularBooks: BOOKS.map((b, i) => ({ name: b.name, views: 4200 - i * 700 })) }],
  [/^\/admin\/users\/registration-stats/, { today: 46, week: 389, month: 1532 }],
  [/^\/admin\/users$/, { users, total: users.length }],
  [/^\/admin\/(plans)$|^\/plans$/, { plans: [
    { id: 'monthly', name: 'Monthly', price: 99, originalPrice: 149, days: 30, emoji: '🌱', enabled: true, features: ['All lesson plans', 'PDF downloads'] },
    { id: 'yearly', name: 'Yearly Premium', price: 199, originalPrice: 1188, days: 365, emoji: '🚀', popular: true, enabled: true, badge: 'BEST VALUE', features: ['Everything in Monthly', 'Panchapadi & papers', 'WhatsApp support'] },
    { id: 'lifetime', name: 'Lifetime', price: 2499, originalPrice: 4999, days: 36500, emoji: '👑', enabled: true, features: ['Pay once, use forever'] }] }],
  [/^\/admin\/revenue/, { daily, monthly,
    planBreakdown: [{ plan: 'yearly', amount: 312400, count: 1570 }, { plan: 'monthly', amount: 98700, count: 997 }, { plan: 'lifetime', amount: 74900, count: 31 }],
    totals: { lifetimeAmount: 486300, lifetimeCount: 2598, todayAmount: 3290, thisMonthAmount: 78400, rangeAmount: daily.reduce((a, d) => a + d.amount, 0), rangeCount: daily.reduce((a, d) => a + d.count, 0), manualGrantsAll: 112, manualGrantsInRange: 9 } }],
  [/^\/tob\/admin\/revenue/, { cards: { today: 420, month: 9650, total: 41200, orders: 318 } }],
  [/^\/admin\/reviews$/, { avg: 4.7, count: 214, visibleCount: 188, reviews: NAMES.slice(0, 6).map((userName, i) => ({ id: 'r' + i, userName, rating: 5 - (i % 3 === 2 ? 1 : 0), comment: ['Saves me hours every week!', 'Panchapadi plans are excellent.', 'Very useful for multigrade class.', 'ପ୍ରଶ୍ନପତ୍ର ବହୁତ ସହଜ', 'Daily plan feature is great', 'Good app for Odisha teachers'][i], visible: i !== 4, createdAt: iso(i * 3), updatedAt: iso(i * 3) })) }],
  [/^\/admin\/referrals$/, { totalReferrals: 1843, totalSubscribed: 612, ambassadors: 27, leaderboard: NAMES.slice(0, 8).map((name, i) => ({ userId: 'u' + i, name, mobile: users[i].mobile, code: 'LG' + (4100 + i * 37), total: 64 - i * 7, subscribed: 23 - i * 2, recent: [] })) }],
  [/^\/admin\/ai-credits\/overview/, { totalAIUsers: 2140, activeAIUsers: 866, lowBalanceUsers: 74, zeroBalanceUsers: 151, revenueINR: 58400, netRevenueINR: 55900, grossProfitINR: 41300, marginPct: 70.7,
    refunds: { count: 6, amountINR: 2500 }, bonusIssued: { count: 410, credits: 20500 }, wallet: { balance: 312400, purchased: 498000, spent: 185600 },
    gemini: { ok: 18432, tokensIn: 41200000, tokensOut: 9600000, tokensThinking: 2100000, costINR: 14600 }, total: 18432,
    plans: [{ code: 'starter', name: 'Starter Pack', count: 210, revenueINR: 10290 }, { code: 'teacher', name: 'Teacher Pack', count: 164, revenueINR: 16236 }, { code: 'smart', name: 'Smart Choice', count: 119, revenueINR: 23681 }, { code: 'power', name: 'Power Pack', count: 21, revenueINR: 8379 }] }],
  [/^\/admin\/official-papers\/analytics/, { overview: { totalEvents: 9120, previews: 6400, prints: 2720, uniquePapers: 212, uniqueUsers: 1430, totalPapers: 248, published: 231, hidden: 17, totalPages: 3120, totalBytes: 812000000, totalPreviews: 6400, totalPrints: 2720, uniqueBooks: 41, uniqueClasses: 10, uniqueYears: 6 }, byClass: [], bySubject: [], byExamType: [], byYear: [], topPapers: [], recentUploads: [], uploadsByMonth: [], activity: { overview: { totalEvents: 9120, prints: 2720, previews: 6400, uniqueUsers: 1430, uniquePapers: 212 }, topUsers: [], recentActivity: [], activityByDay: [] } }],
  [/^\/admin\/official-papers$/, { papers: [], total: 0, overview: { totalPapers: 248, published: 231, hidden: 17, totalPages: 3120, totalBytes: 812000000, totalPreviews: 6400, totalPrints: 2720, uniqueBooks: 41, uniqueClasses: 10, uniqueYears: 6 } }],
  [/^\/lomaster\/matrix/, { classes: [5, 6, 7, 8], items: [{ class: 5, subject_id: 'math' }, { class: 5, subject_id: 'evs' }, { class: 6, subject_id: 'science' }] }],
  [/^\/lomaster\/summary/, { stage: 'Preparatory', subject: 'Mathematics', counts: { cg: 6, competency: 18, lo: 54 }, los: [] }],
  [/^\/lomaster\/admin\/versions/, { versions: [{ id: 'v1', label: 'OCF-SE 2026-27', active: true, createdAt: iso(20) }] }],
  [/^\/classes$/, { classes: CLASSES }],
  [/^\/books/, { books: BOOKS }],
  [/^\/chapters/, { chapters: CHAPTERS }],
  [/^\/admin\/import-logs/, { logs: [{ id: 'l1', type: 'bulk-import', createdAt: iso(1), summary: '42 lessons created, 3 updated' }, { id: 'l2', type: 'bulk-chapters', createdAt: iso(3), summary: '12 chapters created' }] }],
  [/^\/admin\/logs/, { logs: [], kpis: { activatedToday: 37, mismatchesToday: 0 } }],
  [/^\/admin\/curriculum\/stats/, { classes: CLASSES.map((c, i) => ({ ...c, books: i === 5 ? BOOKS.length : 4, chapters: 48, lessons: 790 })), totals: { classes: 11, books: 85, chapters: 513, lessons: 8412 } }],
  [/^\/admin\/qr-payments/, { summary: { PENDING: 2, VERIFIED: 41, REJECTED: 3, verifiedAmount: 9871 }, payments: users.slice(0, 5).map((u, i) => ({ id: 'q' + i, userName: u.name, mobile: u.mobile, expectedAmount: [199, 99, 199, 2499, 199][i], planName: ['Yearly Premium', 'Monthly', 'Yearly Premium', 'Lifetime', 'Yearly Premium'][i], utrNumber: String(488127365010 + i * 13), referenceId: 'LGQR' + (7310 + i), status: i < 2 ? 'PENDING' : 'VERIFIED', submittedAt: iso(i * 0.3), whatsappSent: i >= 2 })) }],
  [/^\/admin\/alerts$/, { qr: { newCount: 1, pending: 2, lastUser: 'Sunita Mohanty' } }],
  [/^\/admin\/contact-messages/, { messages: [{ id: 'm1', name: 'Prakash Behera', mobile: users[1].mobile, message: 'How do I download the Class 7 question paper?', status: 'new', createdAt: iso(0.2) }] }],
  [/^\/admin\/otp-health$/, (m, u, req) => req.method() === 'POST'
    ? { ok: true, providerStatus: 200, messageStatus: 'Success', providerRef: 'wamid.HBgM-sample', reply: '{"message_status":"Success","message_id":"wamid.HBgM-sample"}', hint: 'Accepted by BulkyMarketing. If it does not arrive within a minute, the template, the sending number or the wallet is the problem on the provider side.' }
    : { config: { provider: 'BulkyMarketing', credentialsSet: true, baseUrl: 'live.bulkymarketing.com/api', templateId: 'otptemplate', language: 'en_US' },
        template: { found: true, status: 'APPROVED', category: 'AUTHENTICATION' }, wallet: { balance: 0, stale: false },
        last24h: { total: 61, counts: { sent: 12, 'failed:send': 41, 'blocked:rate-15m': 8 } },
        problems: ['BulkyMarketing wallet estimate is ₹0 — recharge the wallet.', '41 OTP sends failed in the last 24 hours — see the provider replies below.'],
        recentProblems: [
          { at: iso(0.01), purpose: 'login', last4: '4417', result: 'failed', reason: 'send', providerStatus: 200, messageStatus: 'Success', detail: '{"message_status":"Success","message":"Insufficient wallet balance. Please recharge."}' },
          { at: iso(0.03), purpose: 'login', last4: '9023', result: 'failed', reason: 'send', providerStatus: 200, messageStatus: 'Success', detail: '{"message_status":"Success","message":"Insufficient wallet balance. Please recharge."}' },
          { at: iso(0.05), purpose: 'login', last4: '1185', result: 'blocked', reason: 'rate-15m' }],
        recentSent: [] }],
  [/^\/admin\/account-deletions/, { slaDays: 30, counts: { pending: 2, processed: 5, cancelled: 1 }, requests: [
    { id: 'd1', name: 'Rajesh Swain', mobile: '9853055433', reason: 'Retired from service this year', status: 'pending', requestedAt: iso(3), dueAt: new Date(now + 27 * day).toISOString(), overdue: false },
    { id: 'd2', name: 'Pooja Mishra', mobile: '9853062352', reason: '', status: 'pending', requestedAt: iso(31), dueAt: new Date(now - 1 * day).toISOString(), overdue: true }] }],
]
