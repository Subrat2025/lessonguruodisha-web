// ============================================================
//  Curated LO Code PDF Books  (Shishuvatika → Class 8)
// ------------------------------------------------------------
//  These are the officially uploaded Lesson-Guru Odisha
//  Learning-Outcomes reference booklets, covering Shishuvatika,
//  primary (Class 1-5) and upper-primary (Class 6-8).
//  They live on Cloudinary (folder: `lg-lo-code-books/`,
//  resource_type=image, format=pdf) — the source of truth for
//  all supplementary PDF assets in this app.
//
//  They are surfaced INSIDE the existing "LO Code PDF Book"
//  Resource-Library tile as a "Featured" clickbait strip that
//  sits ABOVE any admin-uploaded resources — the existing
//  entries in the collection stay untouched.
//
//  ▸ View  → opens the Cloudinary URL inline (fast preview)
//  ▸ Download → hits our auth-gated proxy so only logged-in
//               teachers can actually save the file to disk,
//               with a friendly filename and download-count
//               tracking.
//
//  Field notes:
//    classNumber  → default numeric badge in the card
//    classLabel   → optional override text ("SV3", "1+2") — used
//                   for Shishuvatika / combined-class booklets
//    tierLabel    → uppercase tag above the number ("CLASS" /
//                   "PRE-PRIMARY" / "COMBINED")
// ============================================================

export const LO_CODE_BOOKS = [
  // ---------- Pre-primary ----------
  {
    key: 'shishuvatika-3',
    classNumber: 3,
    classLabel: 'SV3',
    tierLabel: 'PRE-PRIMARY',
    className: 'Shishuvatika-3',
    title: 'Shishuvatika-3 · Learning Outcomes Book',
    subtitle: 'Complete LO Code Reference for Pre-Primary Teachers',
    tagline: '🌱 Foundational Stage · Panchapadi Ready',
    url: 'https://res.cloudinary.com/no3dae8j/image/upload/v1787235509/lg-lo-code-books/lesson-guru-odisha-shishuvatika-3-learning-outcomes.pdf',
    cloudinaryPublicId: 'lg-lo-code-books/lesson-guru-odisha-shishuvatika-3-learning-outcomes',
    filename: 'Lesson-Guru-Odisha-Shishuvatika-3-Learning-Outcomes.pdf',
    pages: 20,
    bytes: 2101437,
    gradient: 'from-teal-400 via-cyan-500 to-sky-600',
    ringGradient: 'from-teal-300/60 via-cyan-300/60 to-sky-300/60',
    emoji: '🌱',
    subjects: ['SED', 'CD', 'LLD', 'PD', 'ACD'],
    badge: 'FOUNDATIONAL 🌱',
    accent: '#06b6d4',
  },

  // ---------- Primary Class 1-5 ----------
  {
    key: 'class-1',
    classNumber: 1,
    tierLabel: 'CLASS',
    className: 'Class 1',
    title: 'Class 1 · Learning Outcomes Book',
    subtitle: 'Complete LO Code Reference for Class 1 Teachers',
    tagline: '🔥 100% Free · Official LO Codes',
    url: 'https://res.cloudinary.com/no3dae8j/image/upload/v1787233173/lg-lo-code-books/lesson-guru-odisha-class-1-learning-outcomes.pdf',
    cloudinaryPublicId: 'lg-lo-code-books/lesson-guru-odisha-class-1-learning-outcomes',
    filename: 'Lesson-Guru-Odisha-Class-1-Learning-Outcomes.pdf',
    pages: 8,
    bytes: 908918,
    gradient: 'from-rose-500 via-pink-500 to-fuchsia-600',
    ringGradient: 'from-rose-400/60 via-pink-400/60 to-fuchsia-400/60',
    emoji: '🎯',
    subjects: ['English', 'Odia', 'Math', 'EVS'],
    badge: 'MOST DOWNLOADED',
    accent: '#f43f5e',
  },
  {
    key: 'class-2',
    classNumber: 2,
    tierLabel: 'CLASS',
    className: 'Class 2',
    title: 'Class 2 · Learning Outcomes Book',
    subtitle: 'Complete LO Code Reference for Class 2 Teachers',
    tagline: '✨ Aligned with NCF-SE 2023',
    url: 'https://res.cloudinary.com/no3dae8j/image/upload/v1787233174/lg-lo-code-books/lesson-guru-odisha-class-2-learning-outcomes.pdf',
    cloudinaryPublicId: 'lg-lo-code-books/lesson-guru-odisha-class-2-learning-outcomes',
    filename: 'Lesson-Guru-Odisha-Class-2-Learning-Outcomes.pdf',
    pages: 8,
    bytes: 928965,
    gradient: 'from-orange-500 via-amber-500 to-yellow-500',
    ringGradient: 'from-orange-400/60 via-amber-400/60 to-yellow-400/60',
    emoji: '🚀',
    subjects: ['English', 'Odia', 'Math', 'EVS'],
    badge: 'TEACHERS FAVOURITE',
    accent: '#f59e0b',
  },
  {
    key: 'class-1-2',
    classNumber: 12,
    classLabel: '1+2',
    tierLabel: 'COMBINED',
    className: 'Class 1 & 2',
    title: 'Class 1 & 2 · Learning Outcomes Book',
    subtitle: 'Two-class Combined LO Reference for Primary Teachers',
    tagline: '📖 Multigrade-Ready · Cross-Grade Mapping',
    url: 'https://res.cloudinary.com/no3dae8j/image/upload/v1787235511/lg-lo-code-books/lesson-guru-odisha-class-1-2-learning-outcomes.pdf',
    cloudinaryPublicId: 'lg-lo-code-books/lesson-guru-odisha-class-1-2-learning-outcomes',
    filename: 'Lesson-Guru-Odisha-Class-1-and-2-Learning-Outcomes.pdf',
    pages: 41,
    bytes: 4115721,
    gradient: 'from-red-500 via-orange-500 to-amber-500',
    ringGradient: 'from-red-400/60 via-orange-400/60 to-amber-400/60',
    emoji: '📖',
    subjects: ['English', 'Odia', 'Math', 'EVS'],
    badge: '2-IN-1 · SAVE 50%',
    accent: '#f97316',
  },
  {
    key: 'class-3',
    classNumber: 3,
    tierLabel: 'CLASS',
    className: 'Class 3',
    title: 'Class 3 · Learning Outcomes Book',
    subtitle: 'Complete LO Code Reference for Class 3 Teachers',
    tagline: '📚 Chapter-wise LO Grid',
    url: 'https://res.cloudinary.com/no3dae8j/image/upload/v1787233175/lg-lo-code-books/lesson-guru-odisha-class-3-learning-outcomes.pdf',
    cloudinaryPublicId: 'lg-lo-code-books/lesson-guru-odisha-class-3-learning-outcomes',
    filename: 'Lesson-Guru-Odisha-Class-3-Learning-Outcomes.pdf',
    pages: 11,
    bytes: 1258437,
    gradient: 'from-emerald-500 via-teal-500 to-cyan-600',
    ringGradient: 'from-emerald-400/60 via-teal-400/60 to-cyan-400/60',
    emoji: '📘',
    subjects: ['English', 'Odia', 'Math', 'EVS'],
    badge: 'NEW · JUST ADDED',
    accent: '#10b981',
  },
  {
    key: 'class-4',
    classNumber: 4,
    tierLabel: 'CLASS',
    className: 'Class 4',
    title: 'Class 4 · Learning Outcomes Book',
    subtitle: 'Complete LO Code Reference for Class 4 Teachers',
    tagline: '🎓 SCERT Odisha Aligned',
    url: 'https://res.cloudinary.com/no3dae8j/image/upload/v1787233176/lg-lo-code-books/lesson-guru-odisha-class-4-learning-outcomes.pdf',
    cloudinaryPublicId: 'lg-lo-code-books/lesson-guru-odisha-class-4-learning-outcomes',
    filename: 'Lesson-Guru-Odisha-Class-4-Learning-Outcomes.pdf',
    pages: 12,
    bytes: 1342211,
    gradient: 'from-blue-500 via-indigo-500 to-purple-600',
    ringGradient: 'from-blue-400/60 via-indigo-400/60 to-purple-400/60',
    emoji: '📗',
    subjects: ['English', 'Odia', 'Math', 'EVS'],
    badge: 'HOT PICK 🔥',
    accent: '#6366f1',
  },
  {
    key: 'class-5',
    classNumber: 5,
    tierLabel: 'CLASS',
    className: 'Class 5',
    title: 'Class 5 · Learning Outcomes Book',
    subtitle: 'Complete LO Code Reference for Class 5 Teachers',
    tagline: '⚡ FA · SA Ready Reference',
    url: 'https://res.cloudinary.com/no3dae8j/image/upload/v1787233177/lg-lo-code-books/lesson-guru-odisha-class-5-learning-outcomes.pdf',
    cloudinaryPublicId: 'lg-lo-code-books/lesson-guru-odisha-class-5-learning-outcomes',
    filename: 'Lesson-Guru-Odisha-Class-5-Learning-Outcomes.pdf',
    pages: 12,
    bytes: 1350906,
    gradient: 'from-fuchsia-500 via-purple-500 to-violet-700',
    ringGradient: 'from-fuchsia-400/60 via-purple-400/60 to-violet-400/60',
    emoji: '📕',
    subjects: ['English', 'Odia', 'Math', 'EVS'],
    badge: 'MUST HAVE ⭐',
    accent: '#a855f7',
  },

  // ---------- Upper Primary Class 6-8 ----------
  {
    key: 'class-6',
    classNumber: 6,
    tierLabel: 'CLASS',
    className: 'Class 6',
    title: 'Class 6 · Learning Outcomes Book',
    subtitle: 'Complete LO Code Reference for Class 6 Teachers',
    tagline: '🧭 Upper-Primary Ready · Chapter Mapped',
    url: 'https://res.cloudinary.com/no3dae8j/image/upload/v1787235512/lg-lo-code-books/lesson-guru-odisha-class-6-learning-outcomes.pdf',
    cloudinaryPublicId: 'lg-lo-code-books/lesson-guru-odisha-class-6-learning-outcomes',
    filename: 'Lesson-Guru-Odisha-Class-6-Learning-Outcomes.pdf',
    pages: 14,
    bytes: 1523750,
    gradient: 'from-sky-500 via-blue-600 to-indigo-700',
    ringGradient: 'from-sky-400/60 via-blue-400/60 to-indigo-400/60',
    emoji: '🧭',
    subjects: ['English', 'Odia', 'Math', 'Science', 'SS', 'Hindi', 'Sanskrit'],
    badge: 'JUST LAUNCHED 🆕',
    accent: '#0ea5e9',
  },
  {
    key: 'class-7',
    classNumber: 7,
    tierLabel: 'CLASS',
    className: 'Class 7',
    title: 'Class 7 · Learning Outcomes Book',
    subtitle: 'Complete LO Code Reference for Class 7 Teachers',
    tagline: '🚀 Upper-Primary · Multi-Subject Grid',
    url: 'https://res.cloudinary.com/no3dae8j/image/upload/v1787235513/lg-lo-code-books/lesson-guru-odisha-class-7-learning-outcomes.pdf',
    cloudinaryPublicId: 'lg-lo-code-books/lesson-guru-odisha-class-7-learning-outcomes',
    filename: 'Lesson-Guru-Odisha-Class-7-Learning-Outcomes.pdf',
    pages: 15,
    bytes: 1583183,
    gradient: 'from-indigo-500 via-violet-600 to-purple-800',
    ringGradient: 'from-indigo-400/60 via-violet-400/60 to-purple-400/60',
    emoji: '🛰️',
    subjects: ['English', 'Odia', 'Math', 'Science', 'SS', 'Hindi', 'Sanskrit'],
    badge: 'JUST LAUNCHED 🆕',
    accent: '#8b5cf6',
  },
  {
    key: 'class-8',
    classNumber: 8,
    tierLabel: 'CLASS',
    className: 'Class 8',
    title: 'Class 8 · Learning Outcomes Book',
    subtitle: 'Complete LO Code Reference for Class 8 Teachers',
    tagline: '🎯 Board-Ready · Full LO Coverage',
    url: 'https://res.cloudinary.com/no3dae8j/image/upload/v1787235514/lg-lo-code-books/lesson-guru-odisha-class-8-learning-outcomes.pdf',
    cloudinaryPublicId: 'lg-lo-code-books/lesson-guru-odisha-class-8-learning-outcomes',
    filename: 'Lesson-Guru-Odisha-Class-8-Learning-Outcomes.pdf',
    pages: 15,
    bytes: 1656073,
    gradient: 'from-slate-600 via-slate-800 to-zinc-900',
    ringGradient: 'from-slate-500/60 via-slate-600/60 to-zinc-700/60',
    emoji: '🎓',
    subjects: ['English', 'Odia', 'Math', 'Science', 'SS', 'Hindi', 'Sanskrit'],
    badge: 'FINAL YEAR 🎓',
    accent: '#0f172a',
  },
]

// ── R2 repoint (item 5) ──────────────────────────────────────────────
// The 10 LO-code PDFs have been copied (verified) to the PUBLIC R2 bucket at
// key `${cloudinaryPublicId}.pdf`. We keep the SAME access level (public view
// URL + auth-gated download proxy). The view `url` switches to R2 ONLY when
// R2_PUBLIC_BASE_URL is configured in this environment — so on LIVE it stays on
// Cloudinary until R2 public is enabled in production (the approved LIVE switch).
// `cloudinaryPublicId` is preserved so the existing download proxy is unchanged.
const _R2_PUB = String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')
for (const b of LO_CODE_BOOKS) {
  b.cloudinaryUrl = b.url
  b.r2Key = `${b.cloudinaryPublicId}.pdf`
  if (_R2_PUB) {
    b.url = `${_R2_PUB}/${b.r2Key.split('/').map(encodeURIComponent).join('/')}`
    b.backend = 'r2'
  }
}

export const LO_CODE_BOOKS_MAP = Object.fromEntries(LO_CODE_BOOKS.map(b => [b.key, b]))

// Small helper for the frontend so we don't ship the URL to the client for
// downloads (view is public, so URL is fine for view).
export function publicBookInfo(b) {
  return {
    key: b.key,
    classNumber: b.classNumber,
    classLabel: b.classLabel || String(b.classNumber),
    tierLabel: b.tierLabel || 'CLASS',
    className: b.className,
    title: b.title,
    subtitle: b.subtitle,
    tagline: b.tagline,
    viewUrl: b.url, // public Cloudinary preview URL — safe to expose
    filename: b.filename,
    pages: b.pages || 0,
    bytes: b.bytes || 0,
    gradient: b.gradient,
    ringGradient: b.ringGradient,
    emoji: b.emoji,
    subjects: b.subjects,
    badge: b.badge,
    accent: b.accent,
  }
}
