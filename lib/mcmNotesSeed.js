// ============================================================
//  Featured MCM (Monthly Cluster-level Meeting) Notes seed
// ------------------------------------------------------------
//  These are official, self-contained styled HTML note pages
//  (full <html> documents with their own <style>).  The HTML
//  is stored in mcm/mcmNotesContent.json and imported here so
//  Webpack inlines it into the server bundle — this avoids the
//  Next.js `output: 'standalone'` runtime path issues we hit
//  with fs.readFileSync.  Served via /api/mcm-notes endpoints
//  and rendered in a sandboxed <iframe> in the MCM Guide.
// ============================================================
import content from './mcm/mcmNotesContent.json'

// Ordered NEWEST → OLDEST so the latest month shows on top.
export const MCM_NOTES = [
  {
    key: 'october-2026',
    monthLabel: 'ଅକ୍ଟୋବର ୨୦୨୬',
    monthEn: 'October 2026',
    monthShort: 'OCT',
    year: '2026',
    order: 202610,
    title: 'ଚତୁର୍ଥ ମାସିକ କ୍ଲଷ୍ଟର ସ୍ତରୀୟ ବୈଠକ (MCM)',
    subtitle: 'TE & SCERT ପତ୍ର ନଂ ୬୦୭୮ (ତା ୨୨.୦୯.୨୦୨୬) · ବିଭାଗୱାରୀ ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ ନୋଟ୍ସ',
    tagline: 'Decoding · Panchapadi · Gallery Walk · Talk for Learning · Involving All',
    emoji: '📙',
    gradient: 'from-emerald-500 via-teal-600 to-green-700',
    accent: '#0f766e',
    badge: '4th MCM',
  },
  {
    key: 'aug-2026',
    monthLabel: 'ଅଗଷ୍ଟ ୨୦୨୬',
    monthEn: 'August 2026',
    monthShort: 'AUG',
    year: '2026',
    order: 202608,
    title: 'ଦ୍ୱିତୀୟ ମାସିକ କ୍ଲଷ୍ଟରସ୍ତରୀୟ ବୈଠକ (MCM)',
    subtitle: 'OSEPA ଚିଠି ନଂ ୮୧୭୮/Ped/26 · ବିଭାଗୱାରୀ ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ ନୋଟ୍ସ',
    tagline: 'Foundational Literacy · Numeracy · School Visit · Best Practices',
    emoji: '📘',
    gradient: 'from-cyan-500 via-blue-600 to-indigo-700',
    accent: '#1c56b8',
    badge: 'LATEST',
  },
  {
    key: 'july-2026',
    monthLabel: 'ଜୁଲାଇ ୨୦୨୬',
    monthEn: 'July 2026',
    monthShort: 'JUL',
    year: '2026',
    order: 202607,
    title: 'ପ୍ରଥମ ମାସିକ କ୍ଲଷ୍ଟର ସ୍ତରୀୟ ବୈଠକ (MCM)',
    subtitle: 'OSEPA ଚିଠି ନଂ ୭୨୩୩/Ped/26 · TE & SCERT ବୈଠକ ବିଷୟବସ୍ତୁ ନୋଟ୍ସ',
    tagline: 'Agenda · Guidelines · Roles · Resources · Master Revision',
    emoji: '📗',
    gradient: 'from-violet-600 via-fuchsia-600 to-pink-600',
    accent: '#7c3aed',
    badge: 'MCM',
  },
]

// Public metadata (no HTML) for the list endpoint.
export const mcmNotesMeta = () =>
  MCM_NOTES.map(({ key, monthLabel, monthEn, monthShort, year, order, title, subtitle, tagline, emoji, gradient, accent, badge }) =>
    ({ key, monthLabel, monthEn, monthShort, year, order, title, subtitle, tagline, emoji, gradient, accent, badge }))

// Full HTML document for a given key (or null).
export const mcmNoteHtml = (key) => (content && Object.prototype.hasOwnProperty.call(content, key)) ? content[key] : null

// Metadata for a single key (or null).
export const mcmNoteMetaByKey = (key) => MCM_NOTES.find(n => n.key === key) || null
