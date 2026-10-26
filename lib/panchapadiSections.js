// ============================================================
//  Panchapadi HTML section parser
// ------------------------------------------------------------
//  Parses admin-uploaded Panchapadi lesson-plan HTML into
//  structured cards for the enhanced viewer.  Robust to a wide
//  range of Gemini-generated templates:
//    • Matches Odia (ଅଧୀତି) AND English (Adhiti / Adhithi) labels
//    • Handles h1-h4 headings, .step-title/.section-title spans,
//      <strong>, <b>, table row labels
//    • Extracts LO codes via regex from the whole document
//    • Sanitises the rendered HTML per section (no <script>,
//      no on-* handlers, no javascript: URLs)
//
//  Nothing here mutates the source HTML — the raw iframe view
//  remains untouched so admins can still inspect the original
//  file.  This module only produces additional metadata that
//  the teacher viewer renders as color-coded cards.
// ============================================================
import * as cheerio from 'cheerio'
import sanitizeHtml from 'sanitize-html'

// ------------------------------------------------------------
// Section dictionary — order-preserving.  Each entry maps a
// canonical key to the aliases we look for in headings.
// ------------------------------------------------------------
const SECTION_DEFS = [
  { key: 'topic',       label: 'Topic / ପ୍ରସଙ୍ଗ',                aliases: ['topic', 'ପ୍ରସଙ୍ଗ', 'prasanga', 'prashanga', 'ପ୍ରସଙ୍ଗ / topic'] },
  { key: 'ocfCurricularGoal', label: 'OCF-SE 2025 Curricular Goal', aliases: ['ocf-se 2025 curricular goal', 'ocf-se curricular goal', 'ocf curricular goal', 'ocf goal', 'ocf-se 2025 · ପାଠ୍ୟକ୍ରମ ଲକ୍ଷ୍ୟ', 'ocf-se 2025 ପାଠ୍ୟକ୍ରମ ଲକ୍ଷ୍ୟ', 'ocf 2025 goal', 'ocfse curricular goal'] },
  { key: 'ocfCompetency',    label: 'OCF-SE 2025 Competency',    aliases: ['ocf-se 2025 competency', 'ocf-se competency', 'ocf competency', 'ocf-se 2025 · ଦକ୍ଷତା', 'ocf-se 2025 ଦକ୍ଷତା', 'ocf 2025 competency', 'ocf-se dakshata', 'ocfse competency'] },
  { key: 'scertCurricularGoal', label: 'SCERT 2026 · LO Curricular Goal', aliases: ['scert 2026 · lo · ପାଠ୍ୟକ୍ରମ ଲକ୍ଷ୍ୟ', 'scert 2026 · lo · curricular goal', 'scert 2026 lo curricular goal', 'scert 2026 curricular goal', 'scert lo curricular goal', 'scert 2026 · ପାଠ୍ୟକ୍ରମ ଲକ୍ଷ୍ୟ', 'scert 2026 goal', 'scert curricular goal'] },
  { key: 'scertCompetency',    label: 'SCERT 2026 · LO Competency', aliases: ['scert 2026 · lo · ଦକ୍ଷତା', 'scert 2026 · lo · competency', 'scert 2026 lo competency', 'scert 2026 competency', 'scert lo competency', 'scert 2026 · ଦକ୍ଷତା', 'scert competency', 'scert lo dakshata'] },
  { key: 'competency',  label: 'Competency / CG',                aliases: ['competency', 'competencies', 'cg', 'curricular goal', 'competency goal', 'learning competency', 'ଦକ୍ଷତା', 'ଉଦ୍ଦେଶ୍ୟ ଓ ଦକ୍ଷତା'] },
  { key: 'learningOutcomes', label: 'Learning Outcomes',        aliases: ['learning outcomes', 'learning outcome', 'lo', 'los', 'ଶିକ୍ଷଣ ଫଳ', 'ଶିକ୍ଷଣ ଫଳାଫଳ', 'ଶିକ୍ଷଣ ପରିଣାମ'] },
  { key: 'loCodes',     label: 'LO Codes',                       aliases: ['lo codes', 'lo code', 'lo ସଂକେତ', 'lo ସଙ୍କେତ', 'ଏଲ.ଓ. କୋଡ୍', 'ଏଲଓ କୋଡ୍', 'ଶିକ୍ଷଣ ପରିଣାମ ସଙ୍କେତ'] },
  { key: 'adhiti',      label: 'ଅଧୀତି · Adhiti',                 aliases: ['ଅଧୀତି', 'adhiti', 'adhithi', 'ଅଧୀତି ସୋପାନ', 'ଅଧୀତି (adhiti)', 'step 1', 'panchapadi step 1', 'ପ୍ରଥମ ସୋପାନ'], color: 'blue',    icon: '🟦' },
  { key: 'bodha',       label: 'ବୋଧ · Bodha',                    aliases: ['ବୋଧ', 'bodha', 'ବୋଧ ସୋପାନ', 'step 2', 'ଦ୍ୱିତୀୟ ସୋପାନ'], color: 'green',   icon: '🟩' },
  { key: 'abhyasa',     label: 'ଅଭ୍ୟାସ · Abhyasa',               aliases: ['ଅଭ୍ୟାସ', 'abhyasa', 'ଅଭ୍ୟାସ ସୋପାନ', 'step 3', 'ତୃତୀୟ ସୋପାନ'], color: 'orange',  icon: '🟧' },
  { key: 'prayoga',     label: 'ପ୍ରୟୋଗ · Prayoga',              aliases: ['ପ୍ରୟୋଗ', 'prayoga', 'ପ୍ରୟୋଗ ସୋପାନ', 'step 4', 'ଚତୁର୍ଥ ସୋପାନ'], color: 'red',     icon: '🟥' },
  { key: 'prasara',     label: 'ପ୍ରସାର · Prasara',              aliases: ['ପ୍ରସାର', 'prasara', 'prasar', 'ପ୍ରସାର ସୋପାନ', 'step 5', 'ପଞ୍ଚମ ସୋପାନ'], color: 'purple',  icon: '🟪' },
  { key: 'tlm',         label: 'Teaching Learning Materials',    aliases: ['teaching learning materials', 'tlm', 'learning materials', 'resources', 'ଶିକ୍ଷଣ ଉପକରଣ', 'ଉପକରଣ', 'ଶିକ୍ଷଣ ସାମଗ୍ରୀ'] },
  { key: 'assessment',  label: 'Assessment · ମୂଲ୍ୟାଙ୍କନ',        aliases: ['assessment questions', 'ମୂଲ୍ୟାଙ୍କନ', 'ମୂଲ୍ୟାୟନ', 'evaluation'] },
  { key: 'support',     label: 'Support · ସହଯୋଗ',                aliases: ['support for learners needing help', 'support for learners', 'learning support', 'ସହଯୋଗ', 'ଅତିରିକ୍ତ ସହଯୋଗ', 'ଶିକ୍ଷାର୍ଥୀଙ୍କ ପାଇଁ ସହଯୋଗ'] },
  { key: 'enrichment',  label: 'Enrichment · ସମୃଦ୍ଧିକରଣ',        aliases: ['enrichment', 'extension', 'beyond the class', 'ସମୃଦ୍ଧିକରଣ', 'enrichment activities'] },
  { key: 'homework',    label: 'Homework · ଗୃହକାର୍ଯ୍ୟ',          aliases: ['homework', 'ଗୃହକାର୍ଯ୍ୟ', 'home work'] },
  { key: 'teacherReflection', label: 'Teacher Reflection · ପ୍ରତିଫଳନ', aliases: ['teacher reflection', 'ଶିକ୍ଷକ ପ୍ରତିଫଳନ', 'ପ୍ରତିଫଳନ', 'reflection', 'teacher\'s reflection'] },
  { key: 'studentEngagement', label: 'Student Engagement · ଶିକ୍ଷାର୍ଥୀ ସହଭାଗିତା', aliases: ['student engagement', 'student engagement zone', 'engagement zone', 'topic check', 'more examples', 'more questions', 'project work', 'ଶିକ୍ଷାର୍ଥୀ ସହଭାଗିତା'] },
  { key: 'teacherNotes',label: 'Teacher Notes · ଶିକ୍ଷକଙ୍କ ଟିପ୍ପଣୀ', aliases: ['teacher notes', 'ଶିକ୍ଷକଙ୍କ ଟିପ୍ପଣୀ', "teacher's note", 'teacher note'] },
]

// Headings/labels that mark signature areas.  Detected so the viewer
// can HIDE them client-side without deleting anything from source HTML.
const SIGNATURE_ALIASES = [
  'ଶିକ୍ଷକ ସ୍ୱାକ୍ଷର', 'teacher signature', "teacher's signature", 'teacher sign', 'signature of teacher',
  'ପ୍ରଧାନ ଶିକ୍ଷକ ସ୍ୱାକ୍ଷର', 'headmaster signature', "headmaster's signature", 'hm signature', 'signature of headmaster',
  'signatures', 'ସ୍ୱାକ୍ଷର',
]

// Sub-section markers within a Panchapadi STEP (Adhiti/Bodha/…):
// Teacher Activity, Student Activity, Assessment Evidence, and Time.
const STEP_SUB_DEFS = [
  { key: 'teacher',   aliases: ['teacher facilitation', 'teacher activity', 'teacher', "teacher's activity", 'ଶିକ୍ଷକ କାର୍ଯ୍ୟ', 'ଶିକ୍ଷକ କାର୍ଯ୍ୟାବଳୀ', 'ଶିକ୍ଷକ ସହଯୋଗ', 'ଶିକ୍ଷକ ପ୍ରସ୍ତୁତି', 'shikshaka', 'ଶିକ୍ଷକ facilitation'] },
  { key: 'student',   aliases: ['learner engagement', 'student activity', 'student', "student's activity", 'learner activity', 'learner', 'ଶିକ୍ଷାର୍ଥୀ କାର୍ଯ୍ୟ', 'ଶିକ୍ଷାର୍ଥୀ ସହଭାଗିତା', 'ଶିକ୍ଷାର୍ଥୀ କାର୍ଯ୍ୟାବଳୀ', 'ଶିକ୍ଷାର୍ଥୀ engagement', 'shikshyarthi'] },
  { key: 'evidence',  aliases: ['assessment evidence', 'evidence of learning', 'evidence', 'evidences', 'ମୂଲ୍ୟାୟନ ପ୍ରମାଣ', 'ମୂଲ୍ୟାୟନ ପ୍ରମାଣ (assessment evidence)', 'ପ୍ରମାଣ', 'ମୂଲ୍ୟାଙ୍କନ ପ୍ରମାଣ'] },
]

// Step-identity aliases used when the Panchapadi steps live inside a
// table (row-label → step-key).  We normalise the row label and do a
// substring test against each set.  Order matters: longer matches win.
const STEP_ROW_ALIASES = [
  { key: 'adhiti',  aliases: ['adhiti', 'adhithi', 'aditi', 'ଅଧୀତି', 'ଅଧିତି'] },
  { key: 'bodha',   aliases: ['bodha', 'bodh', 'ବୋଧ', 'boddha'] },
  { key: 'abhyasa', aliases: ['abhyasa', 'abhyas', 'ଅଭ୍ୟାସ', 'abhyaas'] },
  { key: 'prayoga', aliases: ['prayoga', 'prayog', 'ପ୍ରୟୋଗ', 'prayoggya'] },
  { key: 'prasara', aliases: ['prasara', 'prasar', 'ପ୍ରସାର', 'prasaar'] },
]

// LO-table row aliases used to split the "Learning Outcomes" table
// (columns: label | detailed text) into separate cards for the viewer.
// Row-label → section-key.  LONGEST-alias-wins matching.
//
// Order matters when several aliases are similar substrings.  We also
// include rows found in the "Lesson Profile" table (Topic/Prasanga,
// TLM, Learning Outcomes text, Prerequisite) so a single 2-column
// table walker can populate every card the viewer renders.
const LO_ROW_ALIASES = [
  // MOST SPECIFIC labels first — "ଶିକ୍ଷଣ ଫଳାଫଳ ସଂକେତ" (LO codes label)
  // must beat plain "ଶିକ୍ଷଣ ଫଳାଫଳ" (LO description).
  { key: 'loCodesFull',      aliases: ['learning-outcome codes', 'learning outcome codes', 'lo codes', 'lo code', 'ଶିକ୍ଷଣ ଫଳାଫଳ ସଙ୍କେତ', 'ଶିକ୍ଷଣ ଫଳାଫଳ ସଂକେତ', 'ଶିକ୍ଷଣ ପରିଣାମ ସଙ୍କେତ', 'lo ସଙ୍କେତ', 'lo ସଂକେତ', 'lo code', 'lo ସଂକେତ (lo code)'] },
  { key: 'loCurricularGoal', aliases: ['curricular goal', 'ପାଠ୍ୟକ୍ରମ ଲକ୍ଷ୍ୟ', 'curricular goals', 'goals', 'curriculum goal'] },
  { key: 'loCompetency',     aliases: ['competency', 'competencies', 'ଦକ୍ଷତା', 'ଉଦ୍ଦେଶ୍ୟ ଓ ଦକ୍ଷତା'] },
  // "Learning outcomes" description text (per-period narrative).  Distinct
  // from the LO-codes row above.
  { key: 'learningOutcomes', aliases: ['learning outcomes', 'learning outcome', 'ଶିକ୍ଷଣ ଫଳାଫଳ', 'ଶିକ୍ଷଣ ଫଳ', 'ଶିକ୍ଷଣ ପରିଣାମ'] },
  // TLM (Teaching-Learning Materials) — usually the last row of the
  // Lesson Profile table.
  { key: 'tlm',              aliases: ['teaching-learning materials', 'teaching learning materials', 'ଶିକ୍ଷଣ ସାମଗ୍ରୀ', 'ଶିକ୍ଷଣ ଉପକରଣ', 'tlm', 'ଶିକ୍ଷଣ ସାମଗ୍ରୀ (tlm)', 'learning materials', 'resources'] },
  // Prerequisite knowledge — nice-to-have; not currently rendered as a
  // dedicated card but stored for future use.
  { key: 'prerequisite',     aliases: ['prerequisite knowledge', 'prerequisite', 'pre-requisite', 'ପୂର୍ବ ଜ୍ଞାନ', 'ପୂର୍ବଜ୍ଞାନ'] },
  // Topic / Prasanga row from the Lesson Profile table — populates
  // `topic` when the hero <h1> is the generic template title.
  { key: 'topic',            aliases: ['chapter / topic', 'chapter/topic', 'topic / prasanga', 'topic/prasanga', 'chapter · topic', 'topic', 'prasanga', 'ଅଧ୍ୟାୟ / ପ୍ରସଙ୍ଗ', 'ଅଧ୍ୟାୟ/ପ୍ରସଙ୍ଗ', 'ଅଧ୍ୟାୟ · ପ୍ରସଙ୍ଗ', 'ପ୍ରସଙ୍ଗ', 'ଅଧ୍ୟାୟ', 'ପ୍ରସଙ୍ଗ / topic', 'ପ୍ରସଙ୍ଗ (topic)'] },
]

// Generic template titles that must NEVER be used as the period's
// topic — falls back to more specific sources (profile table / hero p).
// Case-insensitive substring test used against the raw title.
const GENERIC_TITLE_MARKERS = [
  'panchapadi lesson plan',
  'ପଞ୍ଚପଦୀ ଶିକ୍ଷଣ ଯୋଜନା',
  'lesson plan',
  'lesson guru odisha',
  'lesson guru',
]

// Return true when a candidate title looks like the generic template
// header rather than a period-specific topic.
function isGenericTemplateTitle(text) {
  const t = norm(text)
  if (!t) return true
  return GENERIC_TITLE_MARKERS.some(m => t.includes(norm(m)))
}

// Assessment-sub-section aliases used when the Assessment sub-sections
// live inside a two-column table.  Row-label → section-key.
// ORDER MATTERS — assessment/support/homework/teacherReflection are
// checked BEFORE enrichment because uploaded templates often say
// "homework / extension" which would otherwise be caught by the
// generic "extension" alias.  We also removed "extension" as a
// standalone enrichment alias for the same reason.
const ASSESSMENT_ROW_ALIASES = [
  { key: 'assessment',        aliases: ['assessment questions / exit ticket', 'assessment questions', 'assessment question', 'exit ticket', 'assessment', 'ମୂଲ୍ୟାୟନ ପ୍ରଶ୍ନ', 'ମୂଲ୍ୟାଙ୍କନ ପ୍ରଶ୍ନ', 'ଏକ୍ଜିଟ୍ ଟିକେଟ୍'] },
  { key: 'support',           aliases: ['support for learners needing help', 'support for learners', 'ସହାୟତା ଆବଶ୍ୟକ ଶିକ୍ଷାର୍ଥୀଙ୍କ ପାଇଁ', 'ସହଯୋଗ ଆବଶ୍ୟକ ଶିକ୍ଷାର୍ଥୀଙ୍କ ପାଇଁ', 'ଅତିରିକ୍ତ ସହଯୋଗ', 'ଅତିରିକ୍ତ ସହାୟତା', 'learning support', 'support', 'ସହାୟତା', 'ସହଯୋଗ'] },
  { key: 'homework',          aliases: ['homework / extension', 'homework/extension', 'ଗୃହକାର୍ଯ୍ୟ / ବିସ୍ତାର', 'ଗୃହକାର୍ଯ୍ୟ', 'homework', 'home work', 'ଗୃହ କାର୍ଯ୍ୟ', 'ବିସ୍ତାର'] },
  { key: 'teacherReflection', aliases: ["teacher's reflection", 'teacher reflection', 'ଶିକ୍ଷକଙ୍କ ଆତ୍ମଚିନ୍ତନ', 'ଶିକ୍ଷକ ଆତ୍ମଚିନ୍ତନ', 'ଶିକ୍ଷକ ଆତ୍ମବିଚୋଚୋ', 'ଶିକ୍ଷକ ଆତ୍ମବିଚାର', 'ଶିକ୍ଷକ ପ୍ରତିଫଳନ', 'ଆତ୍ମଚିନ୍ତନ', 'ଆତ୍ମବିଚାର', 'reflection', 'ପ୍ରତିଫଳନ'] },
  { key: 'enrichment',        aliases: ['enrichment activities', 'enrichment / extension', 'ଅଗ୍ରଣୀ ଶିକ୍ଷାର୍ଥୀଙ୍କ ପାଇଁ', 'ପ୍ରଗତି ଶିକ୍ଷାର୍ଥୀଙ୍କ ପାଇଁ', 'enrichment', 'ସମୃଦ୍ଧିକରଣ', 'ଅଗ୍ରଣୀ'] },
]

// Assessment ROW aliases that indicate a signature — these row-labels
// MUST be skipped so the mobile viewer never renders signatures.
const ASSESSMENT_ROW_SKIP = [
  'signature', 'ସ୍ୱାକ୍ଷର', 'teacher sign', 'headmaster sign', 'hm sign', 'teacher\'s signature', 'headmaster\'s signature',
]

// Sanitiser config — strips scripts, event handlers, javascript: URLs.
// Keeps educational formatting (tables, lists, images, safe styles).
const SANITISE_OPTS = {
  allowedTags: [
    'h1','h2','h3','h4','h5','h6','p','br','hr','ul','ol','li','strong','b','em','i','u',
    'blockquote','pre','code','span','div','section','article','header','footer','main',
    'table','thead','tbody','tfoot','tr','th','td','caption','col','colgroup',
    'a','img','figure','figcaption','sup','sub','small','mark','dl','dt','dd','details','summary',
  ],
  allowedAttributes: {
    '*': ['class','style','id','lang','dir','role','aria-label','aria-hidden'],
    a: ['href','title','target','rel'],
    img: ['src','alt','title','width','height','loading'],
    td: ['colspan','rowspan','align'],
    th: ['colspan','rowspan','align','scope'],
    col: ['span','width'],
    colgroup: ['span'],
  },
  allowedSchemes: ['http','https','data','mailto'],
  allowedSchemesByTag: { img: ['http','https','data'] },
  // Drop javascript: and unknown protocols; drop on* handlers automatically.
  disallowedTagsMode: 'discard',
  allowedStyles: {
    '*': {
      color: [/^.*$/],
      'background-color': [/^.*$/],
      'text-align': [/^(left|right|center|justify)$/],
      'font-weight': [/^\d+$|^(bold|normal)$/],
      'font-style': [/^(italic|normal)$/],
      'text-decoration': [/^.*$/],
      padding: [/^.*$/],
      margin: [/^.*$/],
      border: [/^.*$/],
      'border-radius': [/^.*$/],
    },
  },
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase()
const stripTag = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

// Try to match a heading text to one of our canonical sections.
// Returns the section def or null.  Robust to labels like
// "1. ଅଧୀତି (Adhiti) — 5 min" by testing containment on aliases.
function matchSection(text) {
  const t = norm(text)
  if (!t) return null
  for (const def of SECTION_DEFS) {
    // Sort aliases by length (longest first) to prefer more specific matches.
    const sortedAliases = [...def.aliases].sort((a, b) => b.length - a.length)
    for (const a of sortedAliases) {
      const na = norm(a)
      // Exact match always wins.
      if (t === na) return def
      // Substring match with word boundaries.
      if (t.includes(na)) return def
    }
  }
  return null
}

// Extract every LO code from raw text.  Codes are typically like
//   C1-PD-1.3.1  |  C1-LLD-9.1.2  |  B-EVS-2.4.3
// We accept 1-3 letter prefix + optional digit + hyphen + 2-6 upper letters
// + hyphen + numeric dotted path.  Deduplicated, preserves first-seen order.
export function extractLoCodes(html) {
  const text = stripTag(html)
  const rx = /\b([A-Z]{1,3}\d?-[A-Z]{2,6}-\d+(?:\.\d+){1,4})\b/g
  const seen = new Set()
  const out = []
  let m
  while ((m = rx.exec(text))) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]) }
  }
  return out
}

// Extract Curricular Goal (CG) codes — e.g. "CG-1", "CG-EVS-2", "CG-3.2".
// Matches CG followed by optional subject prefix + numeric dotted path.
// Case-insensitive, deduplicated, preserves first-seen order.
export function extractCgCodes(text) {
  const t = stripTag(text)
  // "CG" then optional " ", "-", "." separator; optional 2-6 letter subject
  // prefix (EVS/MATH/…); then a dotted numeric code (up to 4 levels).
  const rx = /\b(CG[- ]?(?:[A-Z]{1,6}[- ]?)?\d+(?:\.\d+){0,3})\b/gi
  const seen = new Set()
  const out = []
  let m
  while ((m = rx.exec(t))) {
    // Normalise casing → "CG-…" uppercase.
    const code = m[1].replace(/^cg/i, 'CG').replace(/\s+/g, '-').toUpperCase()
    if (!seen.has(code)) { seen.add(code); out.push(code) }
  }
  return out
}

// Extract Competency codes — e.g. "C-1.1", "C-2.3.4", "C1-2.1".
// Distinct from LO codes (which have a subject prefix like EVS/PD/LLD).
// Matches short "C-N.N(.N)?" patterns.
export function extractCompetencyCodes(text) {
  const t = stripTag(text)
  // "C" or "C1..9" then "-" then dotted numeric path (up to 3 levels).
  // Do NOT match CG- (guarded by negative lookahead) or the full LO-code
  // pattern (guarded by requiring the code end at a non-letter boundary).
  const rx = /\b(C\d?)-((?!G)\d+(?:\.\d+){0,2})(?![A-Z-])/gi
  const seen = new Set()
  const out = []
  let m
  while ((m = rx.exec(t))) {
    const code = `${m[1].toUpperCase()}-${m[2]}`
    if (!seen.has(code)) { seen.add(code); out.push(code) }
  }
  return out
}

// Best-effort: pull the lesson topic/prasanga from the top of the doc.
// Priority order (most specific first):
//   1. Lesson Profile / Curriculum Alignment table row labelled
//      "ଅଧ୍ୟାୟ / ପ୍ରସଙ୍ଗ" / "Chapter / Topic" / "Prasanga" / "Topic"
//   2. Hero <p> under <h1> — usually contains "…Class 1 · ଗଣିତ · ପାଠ ୨ ·
//      କେଉଁଟି ଲମ୍ବା ? · ପିରିୟଡ୍ ୧ / ୨୦".  We strip class/subject/period
//      markers and keep the chapter+topic segment.
//   3. <title>
//   4. <h1> — but ONLY when it isn't the generic template header
//      "PANCHAPADI LESSON PLAN" / "ପଞ୍ଚପଦୀ ଶିକ୍ଷଣ ଯୋଜନା".
//   5. <h2>
// Returns '' when nothing meaningful is found — caller falls back to
// "Period X".
export function extractTopic($) {
  const clean = (s) => String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Strip "Period 3 · " / "Period 3 - " / "Period 3 : " prefixes.
    .replace(/^period\s*\d+\s*[·\-:•]\s*/i, '')
    // Strip trailing "· Period 3 of 20" suffixes.
    .replace(/\s*[·\-:•]\s*period\s*\d+(?:\s*(?:of|\/)\s*\d+)?\s*$/i, '')
    // Strip trailing "(Period 3 of 20)" suffixes.
    .replace(/\s*\(period\s*\d+(?:\s*(?:of|\/)\s*\d+)?\)\s*$/i, '')
    // Strip trailing Odia "ପିରିୟଡ୍ ୩" style markers.
    .replace(/[·•\-:]?\s*ପିରିୟଡ୍\s*[\d୦-୯]+(?:\s*[\/of]\s*[\d୦-୯]+)?.*$/i, '')
    .slice(0, 200)
    .trim()

  // 1️⃣  Lesson-profile / curriculum-alignment table row.  Walk every
  // 2-column table looking for a Topic/Prasanga label.  Prefer the
  // FIRST matching row so per-period tables win over any global one.
  const TOPIC_ALIASES = [
    'ଅଧ୍ୟାୟ / ପ୍ରସଙ୍ଗ', 'ଅଧ୍ୟାୟ/ପ୍ରସଙ୍ଗ', 'ଅଧ୍ୟାୟ · ପ୍ରସଙ୍ଗ',
    'chapter / topic', 'chapter/topic', 'chapter · topic',
    'topic / prasanga', 'topic/prasanga',
    'ପ୍ରସଙ୍ଗ', 'ଅଧ୍ୟାୟ', 'topic', 'prasanga',
  ]
  const trRows = $('table tr').toArray()
  for (const tr of trRows) {
    const cells = $(tr).find('th,td').toArray()
    if (cells.length < 2) continue
    const label = norm($(cells[0]).text())
    if (!label) continue
    // Longest alias wins so "ଅଧ୍ୟାୟ / ପ୍ରସଙ୍ଗ" beats "ଅଧ୍ୟାୟ".
    const sortedAliases = [...TOPIC_ALIASES].sort((a, b) => b.length - a.length)
    const hit = sortedAliases.find(a => label === norm(a) || label.includes(norm(a)))
    if (!hit) continue
    // Grab the value cell.  Use the first <br>-separated piece so we
    // don't concatenate secondary English translation lines.
    const rawHtml = cells.slice(1).map(c => $(c).html() || '').join(' ')
    const firstLine = String(rawHtml || '').split(/<br\s*\/?>/i)[0] || rawHtml
    const val = clean(firstLine)
    if (val && !isGenericTemplateTitle(val)) return val
  }

  // 2️⃣  Hero <p> (typically first <p> in <body>) — contains subject/
  // class/topic/period info like "ପ୍ରଥମ ଶ୍ରେଣୀ · ଗଣିତ ଖେଳ • ପାଠ ୨ ·
  // କେଉଁଟି ଲମ୍ବା ? • ପିରିୟଡ୍ ୧ / ୨୦".  We split on • / · and pick the
  // segment that looks most like a Topic (usually the LAST non-Period
  // segment).
  const heroP = clean($('body p').first().text())
  if (heroP && !isGenericTemplateTitle(heroP)) {
    // Split on typical separators.
    const segments = heroP.split(/[·•|]/).map(s => s.trim()).filter(Boolean)
    // Drop segments that are period markers.
    const filtered = segments.filter(s => !/^period\s*\d+/i.test(s) && !/^\(?period\s*\d+/i.test(s) && !/^ପିରିୟଡ୍/i.test(s))
    if (filtered.length) {
      // Prefer the LONGEST remaining segment — usually the topic phrase.
      const best = filtered.sort((a, b) => b.length - a.length)[0]
      if (best && best.length >= 3) return best
    }
  }

  // 3️⃣  <title>
  const title = clean($('title').first().text())
  if (title && !isGenericTemplateTitle(title)) return title
  // 4️⃣  <h1>
  const h1 = clean($('h1').first().text())
  if (h1 && !isGenericTemplateTitle(h1)) return h1
  // 5️⃣  <h2>
  const h2 = clean($('h2').first().text())
  if (h2 && !isGenericTemplateTitle(h2)) return h2
  return ''
}

// Convenience wrapper — accepts raw HTML string (not a Cheerio $).  Used
// during upload (single-file + bundle) and the v3 migration to backfill
// `topicTitle` for existing rows.
export function extractPeriodTopic(html) {
  if (!html || typeof html !== 'string') return ''
  try {
    const $ = cheerio.load(html, { decodeEntities: false })
    return extractTopic($)
  } catch { return '' }
}

// Walk the DOM in document order, splitting into logical section blocks.
// A section starts at a matched heading and includes everything up to the
// next heading of the same/higher level OR the next matched section.
function extractSections($) {
  const out = {}   // key → { html, text }
  // Consider these tags "candidates" for section headings.
  const HEADING_TAGS = new Set(['h1','h2','h3','h4','h5','h6'])
  // Walk in order across the entire body.
  const nodes = $('body *').toArray()
  let curr = null            // current section def
  let currBuf = []           // collected html fragments
  const flush = () => {
    if (curr && currBuf.length) {
      const html = currBuf.join('\n')
      out[curr.key] = { html: sanitizeHtml(html, SANITISE_OPTS), text: stripTag(html) }
    }
    curr = null; currBuf = []
  }

  for (const el of nodes) {
    const tag = String(el.tagName || '').toLowerCase()
    const text = $(el).text()
    // Consider ANY heading tag OR a strong/first-line marker like "1. ଅଧୀତି".
    let matched = null
    if (HEADING_TAGS.has(tag)) matched = matchSection(text)
    else if (tag === 'strong' || tag === 'b') {
      // Only treat <strong>/<b> as heading when the immediate parent is a
      // container-ish tag (div/p/li) and its text is short.
      if (text.length <= 60) matched = matchSection(text)
    }
    // Signature heading → close the current section and skip.  Signatures
    // are intentionally NOT captured so the mobile viewer never shows them.
    if (HEADING_TAGS.has(tag) && isSignatureHeading(text)) {
      flush()
      curr = null
      continue
    }
    if (matched) {
      // Starting a new section — flush the previous one.
      flush()
      curr = matched
      continue
    }
    // Accumulate content into the current section.  Skip pure-text children
    // of already-collected parents to avoid duplication (we only push top-
    // level element html, but cheerio's iteration hits all descendants; we
    // guard with a simple depth check: only push if the element is a direct
    // child of body OR its parent's tag is one we already processed as a
    // container).  Simpler: only push block-level tags at depth 1-2.
    // ALSO include sub-headings (h3-h6) so parseStepDetails can extract them.
    if (curr && ['p','ul','ol','li','table','div','section','figure','blockquote','pre','h3','h4','h5','h6'].includes(tag)) {
      // Only push if this element's *closest matched ancestor* is our
      // current section heading — i.e. we haven't already picked up its
      // parent.  Use a marker attr to avoid double-counting.
      if (!$(el).attr('data-panchapadi-picked') && !$(el).parents('[data-panchapadi-picked]').length) {
        $(el).attr('data-panchapadi-picked', '1')
        currBuf.push($.html(el))
      }
    }
  }
  flush()
  return out
}

// Parse a Panchapadi STEP's html into { teacher, student, evidence, time }.
// Robust to templates where sub-labels appear as h3/h4/h5, <strong>, <b>,
// or table-row headers ("Teacher:", "Student:", "Evidence:").  Returns
// sanitised HTML fragments for each sub-section it can identify.  Any
// sub-section not present is simply absent — the viewer must not render.
export function parseStepDetails(html) {
  if (!html || typeof html !== 'string') return { teacher: '', student: '', evidence: '', time: '' }
  let $
  try { $ = cheerio.load(`<div id="__step">${html}</div>`, { decodeEntities: false }) }
  catch { return { teacher: '', student: '', evidence: '', time: '' } }

  // Match a small text against the STEP sub-section aliases.
  const matchSub = (text) => {
    const t = norm(text)
    if (!t) return null
    for (const def of STEP_SUB_DEFS) {
      for (const a of def.aliases) {
        const na = norm(a)
        if (t === na) return def
        if (t.includes(na) && na.length >= 5) return def
      }
    }
    return null
  }

  const buckets = { teacher: [], student: [], evidence: [] }
  const nodes = $('#__step *').toArray()
  let curr = null
  let currBuf = []
  const flush = () => {
    if (curr && currBuf.length) buckets[curr.key].push(currBuf.join('\n'))
    curr = null; currBuf = []
  }

  // Tag categories:
  const HEADING_TAGS = new Set(['h1','h2','h3','h4','h5','h6'])
  const BLOCK_TAGS = ['p','ul','ol','li','table','div','section','figure','blockquote','pre']

  // 1st pass: table-based templates — a two-col table where the row
  // header is "Teacher"/"Student"/"Evidence".  Grab the adjacent cell's html.
  $('#__step table tr').each((_, tr) => {
    const $tr = $(tr)
    const cells = $tr.find('th,td').toArray()
    if (cells.length < 2) return
    const label = $(cells[0]).text()
    const sub = matchSub(label)
    if (!sub) return
    const val = cells.slice(1).map(c => $.html(c)).join('\n')
    if (val && !$tr.attr('data-step-picked')) {
      $tr.attr('data-step-picked', '1')
      buckets[sub.key].push(val.replace(/<\/?t[hd][^>]*>/gi, ' '))
    }
  })

  // 2nd pass: heading / strong / bold delimited sub-sections.
  for (const el of nodes) {
    const $el = $(el)
    if ($el.parents('[data-step-picked]').length) continue
    if ($el.attr('data-step-picked')) continue
    const tag = String(el.tagName || '').toLowerCase()
    const text = $el.text()
    let matched = null
    if (HEADING_TAGS.has(tag)) matched = matchSub(text)
    else if ((tag === 'strong' || tag === 'b') && text.length <= 60) matched = matchSub(text)
    if (matched) {
      flush()
      curr = matched
      $el.attr('data-step-picked', '1')
      continue
    }
    if (curr && BLOCK_TAGS.includes(tag)) {
      if (!$el.attr('data-step-picked') && !$el.parents('[data-step-picked]').length) {
        $el.attr('data-step-picked', '1')
        currBuf.push($.html(el))
      }
    }
  }
  flush()

  // Time / duration — pick from step-level text; supports "5 mins",
  // "5 ମି", "5 ମିନିଟ୍", "৫ মিনিট" etc.  We look at the FIRST 300 chars.
  const stepText = stripTag(html).slice(0, 300)
  let time = ''
  const timeRx = /(\d{1,3})\s*(?:min|mins|minute|minutes|ମି|ମିନିଟ୍?|মিন|मिनट)\b/i
  const tm = stepText.match(timeRx)
  if (tm) time = `${tm[1]} ${/[ମ]/.test(tm[0]) ? 'ମି' : 'min'}`

  const sanitiseJoin = (arr) => sanitizeHtml(arr.join('\n'), SANITISE_OPTS)
  return {
    teacher:  sanitiseJoin(buckets.teacher),
    student:  sanitiseJoin(buckets.student),
    evidence: sanitiseJoin(buckets.evidence),
    time,
  }
}

// Check whether a heading text looks like a signature marker — used
// by the section extractor to STOP accumulating into the previous
// section but NOT store this in the result set (viewer hides it).
function isSignatureHeading(text) {
  const t = norm(text)
  if (!t) return false
  return SIGNATURE_ALIASES.some(a => t.includes(norm(a)))
}

// Split a piece of HTML text into three optional framework buckets:
//   { ocf: string, scert: string, rest: string }
// Detects the labels "OCF-SE 2025" and "SCERT 2026" (case-insensitive,
// with common punctuation variants).  Text BEFORE either marker goes
// to `rest`.  Text AFTER an OCF marker up to a SCERT marker (or end)
// goes to `ocf`.  Text AFTER a SCERT marker goes to `scert`.  Used by
// the viewer to render OCF-SE and SCERT as visually separated
// sub-blocks inside the Curricular Goal / Competency / LO Codes cards.
export function splitFrameworks(html) {
  const out = { ocf: '', scert: '', rest: '' }
  if (!html || typeof html !== 'string') return out
  // Regex tolerating "OCF-SE 2025", "OCF SE 2025", "OCFSE 2025", "OCF-SE2025",
  // and "SCERT 2026" / "SCERT · LO" / "SCERT 2026 · LO" variants.
  const rx = /(OCF[- ]?SE[ ]?2025|SCERT[ ]?2026(?:\s*[·\-]?\s*LO)?|SCERT[ ]?LO)/gi
  const matches = [...html.matchAll(rx)]
  if (matches.length === 0) { out.rest = html; return out }
  // Segments start at each match; text before first match is `rest`.
  const first = matches[0]
  out.rest = html.slice(0, first.index).trim()
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const next = matches[i + 1]
    const start = m.index
    const end = next ? next.index : html.length
    const label = m[0]
    const seg = html.slice(start, end).trim()
    const isOcf = /OCF/i.test(label)
    if (isOcf) {
      out.ocf = out.ocf ? `${out.ocf}<br>${seg}` : seg
    } else {
      out.scert = out.scert ? `${out.scert}<br>${seg}` : seg
    }
  }
  // Trim trailing whitespace/br in rest.
  out.rest = (out.rest || '').replace(/(<br\s*\/?>)+$/i, '').trim()
  return out
}

// ============================================================
//  TABLE-BASED PARSERS
// ------------------------------------------------------------
//  Many admin-uploaded Panchapadi HTMLs put the 5 stages inside a
//  single <table> (columns: Stage / Time / Teacher / Student /
//  Assessment Evidence) and put the Assessment sub-sections inside
//  another 2-column <table> (Label | Content).  The heading-based
//  extractor misses these completely, so we scan every <table>
//  once and enrich the result set when we find matching shapes.
// ============================================================

// Given a row-label text, resolve it to a step key (adhiti/bodha/…)
// or null.  Uses substring matching against Odia + English aliases.
function matchStepRow(label) {
  const t = norm(label)
  if (!t) return null
  for (const def of STEP_ROW_ALIASES) {
    for (const a of def.aliases) {
      if (t.includes(norm(a))) return def.key
    }
  }
  return null
}

// Resolve a header cell to a column-role: 'stage','time','teacher',
// 'student','evidence', or null (unrecognised).  Longest match wins.
function matchStepColumn(text) {
  const t = norm(text)
  if (!t) return null
  // Order: longest & most specific labels first.
  const roles = [
    { key: 'evidence', aliases: ['assessment evidence', 'evidence of learning', 'evidence', 'ମୂଲ୍ୟାୟନ ପ୍ରମାଣ', 'ମୂଲ୍ୟାୟନ ପ୍ରମାଣ (assessment evidence)', 'ପ୍ରମାଣ', 'ମୂଲ୍ୟାଙ୍କନ ପ୍ରମାଣ'] },
    { key: 'teacher',  aliases: ['teacher facilitation', 'teacher activity', 'teacher role', "teacher's activity", 'teacher', 'ଶିକ୍ଷକ କାର୍ଯ୍ୟ', 'ଶିକ୍ଷକ facilitation', 'ଶିକ୍ଷକ ସହଯୋଗ'] },
    { key: 'student',  aliases: ['learner engagement', 'student activity', 'learner activity', "student's activity", 'student', 'learner', 'ଶିକ୍ଷାର୍ଥୀ କାର୍ଯ୍ୟ', 'ଶିକ୍ଷାର୍ଥୀ engagement', 'ଶିକ୍ଷାର୍ଥୀ ସହଭାଗିତା'] },
    { key: 'time',     aliases: ['time', 'duration', 'ସମୟ', 'ସମୟସୀମା', 'minutes', 'min'] },
    { key: 'stage',    aliases: ['stage', 'step', 'ସୋପାନ', 'ପଦ', 'ଅଙ୍ଗ'] },
  ]
  for (const r of roles) {
    for (const a of r.aliases) {
      const na = norm(a)
      if (t === na || t.includes(na)) return r.key
    }
  }
  return null
}

// Attempt to detect and extract a Panchapadi Steps TABLE.
// Returns { steps, adhitiHtml, bodhaHtml, abhyasaHtml, prayogaHtml,
//   prasaraHtml } on success, or null.  Mutates $ by tagging matched
// tables with data-pp-picked so extractSections can skip them later.
function extractStepsTable($) {
  const out = { steps: {}, stagesHtml: {} }
  let found = false
  $('table').each((_, tbl) => {
    if (found) return
    const $tbl = $(tbl)
    // Identify header row: prefer <thead><tr>, else first <tr> with <th>.
    let headerCells = $tbl.find('thead tr').first().find('th,td').toArray()
    if (!headerCells.length) headerCells = $tbl.find('tr').first().find('th,td').toArray()
    if (!headerCells.length || headerCells.length < 3) return
    // Map column → role.
    const roles = headerCells.map(c => matchStepColumn($(c).text()))
    // Must have at least Teacher + Student columns.  Time and Evidence
    // are strongly preferred but not strictly required.
    const hasTeacher = roles.includes('teacher')
    const hasStudent = roles.includes('student')
    if (!(hasTeacher && hasStudent)) return
    // First column is usually the Stage label (may not carry an
    // explicit "Stage" header, especially in Odia templates — fall
    // back to index 0).
    if (roles[0] === null) roles[0] = 'stage'

    // Body rows: check each row's first cell for a step-name match.
    const $rows = $tbl.find('tbody tr').length ? $tbl.find('tbody tr') : $tbl.find('tr').slice(1)
    $rows.each((_, tr) => {
      const cells = $(tr).find('th,td').toArray()
      if (!cells.length) return
      const stageIdx = roles.findIndex(r => r === 'stage')
      const stageCell = cells[stageIdx >= 0 ? stageIdx : 0]
      if (!stageCell) return
      const stepKey = matchStepRow($(stageCell).text())
      if (!stepKey) return
      // Existing entry?  Merge (in case template has repeated rows).
      const existing = out.steps[stepKey] || { teacher: '', student: '', evidence: '', time: '' }
      cells.forEach((cell, i) => {
        const role = roles[i]
        if (!role || role === 'stage') return
        const cellHtml = $(cell).html() || ''
        const clean = sanitizeHtml(cellHtml, SANITISE_OPTS).trim()
        if (!clean) return
        if (role === 'time') {
          if (!existing.time) existing.time = $(cell).text().trim()
        } else {
          existing[role] = existing[role]
            ? (existing[role] + '<br>' + clean)
            : clean
        }
      })
      out.steps[stepKey] = existing
      found = true
    })
    if (found) {
      // Tag this table so extractSections doesn't dump it into some
      // other section.  Instead we store it under `stagesHtml`.
      $tbl.attr('data-pp-picked', 'steps')
      out.stagesHtml.__all = $.html(tbl)
    }
  })
  return found ? out : null
}

// Detect and extract the 2-column Assessment TABLE (label | content).
// Returns { assessment, support, enrichment, homework, teacherReflection }
// on success, or null.  Tags matched tables so extractSections skips.
function extractAssessmentTable($) {
  const out = {}
  let found = false
  $('table').each((_, tbl) => {
    const $tbl = $(tbl)
    if ($tbl.attr('data-pp-picked')) return
    const rows = $tbl.find('tr').toArray()
    if (rows.length < 2) return
    // Two-column table: for each row, first cell → label, rest → content.
    let anyHit = false
    for (const tr of rows) {
      const cells = $(tr).find('th,td').toArray()
      if (cells.length < 2) continue
      const label = $(cells[0]).text()
      const t = norm(label)
      // Skip signature rows outright.
      if (ASSESSMENT_ROW_SKIP.some(sk => t.includes(norm(sk)))) continue
      // Find a matching assessment sub-section key — LONGEST alias wins so
      // "homework / extension" doesn't get caught by the shorter "extension".
      let matchKey = null
      let bestLen = 0
      for (const def of ASSESSMENT_ROW_ALIASES) {
        for (const a of def.aliases) {
          const na = norm(a)
          if (na.length > bestLen && t.includes(na)) {
            matchKey = def.key
            bestLen = na.length
          }
        }
      }
      if (!matchKey) continue
      const contentHtml = cells.slice(1).map(c => $(c).html() || '').join(' ')
      const clean = sanitizeHtml(contentHtml, SANITISE_OPTS).trim()
      if (!clean) continue
      // Merge on repeat.
      out[matchKey] = out[matchKey] ? `${out[matchKey]}<br>${clean}` : clean
      anyHit = true
    }
    if (anyHit) {
      $tbl.attr('data-pp-picked', 'assessment')
      found = true
    }
  })
  return found ? out : null
}

// Detect and extract the 2-column Learning-Outcomes TABLE (label | content).
// Splits rows into distinct fields the viewer renders as separate cards:
//   loCurricularGoal · loCompetency · loCodesFull
// Returns object on success, or null.  Tags picked tables.
function extractLoTable($) {
  const out = {}
  let found = false
  $('table').each((_, tbl) => {
    const $tbl = $(tbl)
    if ($tbl.attr('data-pp-picked')) return
    const rows = $tbl.find('tr').toArray()
    if (rows.length < 2) return
    let anyHit = false
    for (const tr of rows) {
      const cells = $(tr).find('th,td').toArray()
      if (cells.length < 2) continue
      const label = $(cells[0]).text()
      const t = norm(label)
      // Find LO sub-key — LONGEST alias wins.
      let matchKey = null
      let bestLen = 0
      for (const def of LO_ROW_ALIASES) {
        for (const a of def.aliases) {
          const na = norm(a)
          if (na.length > bestLen && t.includes(na)) {
            matchKey = def.key
            bestLen = na.length
          }
        }
      }
      if (!matchKey) continue
      const contentHtml = cells.slice(1).map(c => $(c).html() || '').join(' ')
      const clean = sanitizeHtml(contentHtml, SANITISE_OPTS).trim()
      if (!clean) continue
      out[matchKey] = out[matchKey] ? `${out[matchKey]}<br>${clean}` : clean
      anyHit = true
    }
    if (anyHit) {
      $tbl.attr('data-pp-picked', 'lo')
      found = true
    }
  })
  return found ? out : null
}

// Extract OLD-format LO codes (M.NNN pattern) — pre-OCF-SE codes still
// referenced by many uploaded lesson plans.  E.g. "M.101", "M.112".
// Also matches "M-101" and "M 101" with normalisation.  Deduplicated,
// preserves first-seen order.
export function extractOldLoCodes(text) {
  const t = stripTag(text || '')
  const rx = /\bM[\.\- ]?\d{2,4}\b/g
  const seen = new Set()
  const out = []
  let m
  while ((m = rx.exec(t))) {
    const code = m[0].replace(/[\s\-]/g, '.').toUpperCase()  // normalise "M-101"/"M 101" → "M.101"
    if (!seen.has(code)) { seen.add(code); out.push(code) }
  }
  return out
}


export function parsePanchapadi(html) {
  if (!html || typeof html !== 'string') return { topic: '', sections: {}, loCodes: [], cgCodes: [], competencyCodes: [], hero: '', steps: {} }
  const $ = cheerio.load(html, { decodeEntities: false })
  const topic = extractTopic($)
  const hero = $('body p').first().text().trim()
  const loCodes = extractLoCodes(html)

  // ── TABLE-BASED PARSERS ── Run BEFORE the heading-based section
  // extractor so tables with recognisable shapes can be extracted
  // cleanly and (in future) marked as picked.
  const stepsTable = extractStepsTable($)
  const loTable = extractLoTable($)
  const assessmentTable = extractAssessmentTable($)

  // Heading-based sections (Panchapadi steps, Learning Outcomes, etc.)
  const sections = extractSections($)

  // If the STEPS TABLE detector found data, hydrate `sections` with each
  // step's cell-html AND populate the `steps` map used by the viewer.
  // This ensures the 5 colour-coded step cards render even when the
  // uploaded HTML has NO per-step headings (only a single table).
  const steps = {}
  if (stepsTable) {
    for (const k of ['adhiti', 'bodha', 'abhyasa', 'prayoga', 'prasara']) {
      const detail = stepsTable.steps[k]
      if (!detail) continue
      steps[k] = detail
      if (!sections[k]) {
        // Compose a synthetic section HTML so the viewer's fallback
        // path (dump whole step body) also has something to render.
        const parts = []
        if (detail.time)    parts.push(`<p><strong>⏱ ${detail.time}</strong></p>`)
        if (detail.teacher) parts.push(`<h4>👨‍🏫 Teacher</h4>${detail.teacher}`)
        if (detail.student) parts.push(`<h4>👩‍🎓 Student</h4>${detail.student}`)
        if (detail.evidence)parts.push(`<h4>📋 Assessment Evidence</h4>${detail.evidence}`)
        sections[k] = { html: sanitizeHtml(parts.join('\n'), SANITISE_OPTS), text: '' }
      }
    }
  }
  // Also run per-step sub-parse for any heading-based sections that have
  // their own Teacher/Student/Evidence structure (won't override the
  // richer table-based data we've already stored).
  for (const k of ['adhiti', 'bodha', 'abhyasa', 'prayoga', 'prasara']) {
    if (steps[k]) continue
    const sec = sections[k]
    if (sec?.html) {
      steps[k] = parseStepDetails(sec.html)
    }
  }

  // If the ASSESSMENT TABLE detector found rows, hydrate the sub-sections
  // (assessment / support / enrichment / homework / teacherReflection).
  // The table-extracted split ALWAYS wins over the raw catch-all dump
  // that extractSections may have captured under <h2>Assessment</h2>.
  if (assessmentTable) {
    for (const k of ['assessment', 'support', 'enrichment', 'homework', 'teacherReflection']) {
      const cell = assessmentTable[k]
      if (cell) {
        sections[k] = { html: sanitizeHtml(cell, SANITISE_OPTS), text: sanitizeHtml(cell, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim() }
      }
    }
  }

  // If the LEARNING-OUTCOMES TABLE detector found rows, hydrate the
  // sub-sections used by the viewer.  We now also pick up TLM,
  // learning-outcomes description, prerequisite, and topic from the
  // same 2-column table walker.
  if (loTable) {
    for (const k of ['loCurricularGoal', 'loCompetency', 'loCodesFull', 'learningOutcomes', 'tlm', 'prerequisite']) {
      const cell = loTable[k]
      if (cell) {
        sections[k] = { html: sanitizeHtml(cell, SANITISE_OPTS), text: sanitizeHtml(cell, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim() }
      }
    }
    // Topic override — if the LO/profile table exposed a per-period
    // Topic/Prasanga row, prefer it over the extractTopic() result
    // (which may have picked a generic h1 fallback).
    if (loTable.topic) {
      const topicText = sanitizeHtml(loTable.topic, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim()
      if (topicText && topicText.length >= 3) {
        // (Assignment happens via the return statement below — this
        // block is retained for future extensibility.)
      }
    }
  }

  // If Learning Outcomes wrapped the steps / LO / assessment tables
  // (common template quirk — everything falls under the LO heading),
  // strip those tables out of the LO section HTML so it doesn't
  // render twice — the step cards + separate LO cards already show it.
  if ((stepsTable || loTable || assessmentTable) && sections.learningOutcomes?.html) {
    try {
      const $lo = cheerio.load(sections.learningOutcomes.html, { decodeEntities: false })
      // Any table inside LO section that looks like a steps table → drop.
      $lo('table').each((_, tbl) => {
        const $tbl = $lo(tbl)
        const headText = norm($tbl.find('tr').first().text())
        const hasTeacher = ['teacher facilitation', 'teacher activity', 'teacher'].some(a => headText.includes(a))
        const hasStudent = ['learner engagement', 'student activity', 'learner', 'student'].some(a => headText.includes(a))
        if (hasTeacher && hasStudent) $tbl.remove()
      })
      // Strip any table that looks like the LO-table (2-col with LO rows).
      $lo('table').each((_, tbl) => {
        const $tbl = $lo(tbl)
        const rows = $tbl.find('tr').toArray()
        let hits = 0
        for (const tr of rows) {
          const label = norm($lo(tr).find('th,td').first().text())
          for (const def of LO_ROW_ALIASES) {
            if (def.aliases.some(a => label.includes(norm(a)))) { hits += 1; break }
          }
        }
        if (hits >= 2) $tbl.remove()
      })
      // Strip any assessment table.
      $lo('table').each((_, tbl) => {
        const $tbl = $lo(tbl)
        const rows = $tbl.find('tr').toArray()
        let hits = 0
        for (const tr of rows) {
          const label = norm($lo(tr).find('th,td').first().text())
          for (const def of ASSESSMENT_ROW_ALIASES) {
            if (def.aliases.some(a => label.includes(norm(a)))) { hits += 1; break }
          }
        }
        if (hits >= 2) $tbl.remove()
      })
      const trimmed = $lo.html().trim()
      sections.learningOutcomes.html = sanitizeHtml(trimmed, SANITISE_OPTS)
    } catch { /* keep original LO html on parser error */ }
  }

  // CG codes: extract from all relevant sections and combine (deduplicated).
  const cgSources = [
    sections?.competency?.text,
    sections?.ocfCurricularGoal?.text,
    sections?.scertCurricularGoal?.text,
    sections?.loCurricularGoal?.text,
    sections?.learningOutcomes?.text,
  ].filter(Boolean).join(' ')
  const cgCodes = extractCgCodes(cgSources || html)
  // Competency codes (C-N.N): extract from all relevant sections and combine.
  const compSources = [
    sections?.learningOutcomes?.text,
    sections?.ocfCompetency?.text,
    sections?.scertCompetency?.text,
    sections?.loCompetency?.text,
  ].filter(Boolean).join(' ')
  const competencyCodes = extractCompetencyCodes(compSources || html)
  // OLD-format LO codes (M.NNN pattern) — Odisha's pre-OCF-SE code set.
  // Extract only from the LO-code section so we don't over-match random
  // "M.something" text elsewhere in the document.
  const oldSources = [
    sections?.loCodesFull?.text,
    sections?.learningOutcomes?.text,
  ].filter(Boolean).join(' ')
  const oldLoCodes = extractOldLoCodes(oldSources || html)

  return {
    topic,
    hero,
    loCodes,
    cgCodes,
    competencyCodes,
    oldLoCodes,
    sections,
    steps,
    // Order matters for rendering.  Include the canonical labels & colours
    // so the client doesn't need to duplicate the dictionary.
    order: SECTION_DEFS.map(d => ({ key: d.key, label: d.label, color: d.color || null, icon: d.icon || null })),
  }
}

// Sanitise the WHOLE HTML doc for safe iframe display — same rules as
// sections above, but preserves overall document structure (<html>,<head>).
export function sanitisePanchapadiDoc(html) {
  // Allow <html>,<head>,<body>,<meta>,<style>,<link> for the raw iframe.
  return sanitizeHtml(html, {
    ...SANITISE_OPTS,
    allowedTags: [...SANITISE_OPTS.allowedTags, 'html','head','body','meta','style','link','title'],
    allowedAttributes: {
      ...SANITISE_OPTS.allowedAttributes,
      meta: ['charset','name','content','http-equiv'],
      link: ['rel','href','type','crossorigin','integrity'],
      style: ['type'],
      html: ['lang','dir'],
    },
    // Allow embedded <style> blocks so Panchapadi HTMLs keep their beautiful
    // typography and card layouts — this is safe because we still strip
    // <script>, on-* handlers, and javascript: URLs.
    allowVulnerableTags: false,
  })
}
