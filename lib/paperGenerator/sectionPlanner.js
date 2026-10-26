// ============================================================
// LessonGuru Odisha — FA/SA Paper: Section Structure Planner
// Produces the authoritative section blueprint given assessment_type,
// grade and full_marks.  This is the SINGLE SOURCE OF TRUTH for the
// question-count / marks-per-section split — Gemini must match it EXACTLY.
// ============================================================

export const QUESTION_TYPES = {
  MCQ: 'MCQ',           // Multiple choice
  FIB: 'FIB',           // Fill in the blank
  TF:  'TF',            // True / False
  MATCH: 'MATCH',       // Match the following
  VSA: 'VSA',           // Very short answer (2 marks)
  SA:  'SA',            // Short answer  (3 marks)
  LA:  'LA',            // Long answer   (4-5 marks)
  CASE:'CASE',          // Case / source based (SA papers)
}

const SECTION_LABEL = {
  Odia:       { A: 'ଭାଗ କ', B: 'ଭାଗ ଖ', C: 'ଭାଗ ଗ', D: 'ଭାଗ ଘ', E: 'ଭାଗ ଙ' },
  English:    { A: 'Section A', B: 'Section B', C: 'Section C', D: 'Section D', E: 'Section E' },
  Hindi:      { A: 'खंड क', B: 'खंड ख', C: 'खंड ग', D: 'खंड घ', E: 'खंड ङ' },
  Sanskrit:   { A: 'खण्डः क', B: 'खण्डः ख', C: 'खण्डः ग', D: 'खण्डः घ', E: 'खण्डः ङ' },
}

const TYPE_LABEL_ODIA = {
  MCQ:'ବହୁ ବିକଳ୍ପୀୟ ପ୍ରଶ୍ନ (MCQ)', FIB:'ଶୂନ୍ୟସ୍ଥାନ ପୂରଣ କର',
  TF:'ସତ୍ୟ/ମିଥ୍ୟା', MATCH:'ମେଳ କର',
  VSA:'ଅତି ସଂକ୍ଷିପ୍ତ ଉତ୍ତର', SA:'ସଂକ୍ଷିପ୍ତ ଉତ୍ତର',
  LA:'ଦୀର୍ଘ ଉତ୍ତରମୂଳକ ପ୍ରଶ୍ନ', CASE:'କେସ୍ ଆଧାରିତ ପ୍ରଶ୍ନ',
}
const TYPE_LABEL_EN = {
  MCQ:'Multiple Choice (MCQ)', FIB:'Fill in the Blanks',
  TF:'True / False', MATCH:'Match the Following',
  VSA:'Very Short Answer', SA:'Short Answer',
  LA:'Long Answer', CASE:'Case / Source based',
}
const TYPE_LABEL_HI = {
  MCQ:'बहुविकल्पीय प्रश्न (MCQ)', FIB:'रिक्त स्थान भरें',
  TF:'सत्य / असत्य', MATCH:'मिलान कीजिए',
  VSA:'अति लघु उत्तरीय', SA:'लघु उत्तरीय',
  LA:'दीर्घ उत्तरीय', CASE:'केस/स्रोत आधारित',
}
const TYPE_LABEL_SA = {
  MCQ:'बहुविकल्पीयप्रश्नाः', FIB:'रिक्तस्थानपूर्तिः',
  TF:'सत्य/असत्य', MATCH:'मेलनम्',
  VSA:'अति लघु उत्तरः', SA:'लघु उत्तरः',
  LA:'दीर्घ उत्तरः', CASE:'प्रकरणाधारितः प्रश्नः',
}

export function typeLabel(type, language) {
  const m = { Odia: TYPE_LABEL_ODIA, English: TYPE_LABEL_EN, Hindi: TYPE_LABEL_HI, Sanskrit: TYPE_LABEL_SA }
  return (m[language] || TYPE_LABEL_ODIA)[type] || type
}

export function sectionLabel(id, language) {
  return (SECTION_LABEL[language] || SECTION_LABEL.Odia)[id] || id
}

// The section header text (short).
export function sectionInstruction(type, language) {
  const m = {
    Odia: {
      MCQ: 'ପ୍ରତ୍ୟେକ ପ୍ରଶ୍ନର ଉତ୍ତର ଚୟନ କର।',
      FIB: 'ଶୂନ୍ୟସ୍ଥାନ ପୂରଣ କର।',
      TF: 'ସତ୍ୟ କିମ୍ବା ମିଥ୍ୟା ଲେଖ।',
      MATCH: 'ମେଳ କର।',
      VSA: 'ସଂକ୍ଷେପରେ ଉତ୍ତର ଦିଅ।',
      SA: 'ସଂକ୍ଷେପରେ ଉତ୍ତର ଦିଅ।',
      LA: 'ଦୀର୍ଘ ଉତ୍ତର ଲେଖ।',
      CASE: 'ପ୍ରଦତ୍ତ ଅନୁଚ୍ଛେଦ ଆଧାରରେ ପ୍ରଶ୍ନର ଉତ୍ତର ଦିଅ।',
    },
    English: {
      MCQ: 'Choose the correct option.',
      FIB: 'Fill in the blanks.',
      TF: 'Write True or False.',
      MATCH: 'Match the following.',
      VSA: 'Answer briefly.',
      SA: 'Answer in short.',
      LA: 'Answer in detail.',
      CASE: 'Read the passage and answer the questions.',
    },
    Hindi: {
      MCQ: 'सही विकल्प चुनिए।',
      FIB: 'रिक्त स्थान भरिए।',
      TF: 'सत्य/असत्य लिखिए।',
      MATCH: 'मिलान कीजिए।',
      VSA: 'संक्षेप में उत्तर दीजिए।',
      SA: 'संक्षेप में उत्तर दीजिए।',
      LA: 'विस्तार से उत्तर दीजिए।',
      CASE: 'निम्नलिखित अनुच्छेद पढ़कर प्रश्नों के उत्तर दीजिए।',
    },
    Sanskrit: {
      MCQ: 'शुद्धं विकल्पं चिनुत।', FIB: 'रिक्तस्थानं पूरयत।',
      TF: 'सत्यं वा असत्यं लिखत।', MATCH: 'मेलनं कुरुत।',
      VSA: 'सङ्क्षेपेण उत्तरं लिखत।', SA: 'सङ्क्षेपेण उत्तरं लिखत।',
      LA: 'विस्तरेण उत्तरं लिखत।', CASE: 'अनुच्छेदम् आधारीकृत्य उत्तरं लिखत।',
    },
  }
  return (m[language] || m.Odia)[type] || ''
}

// ------------------------------------------------------------
// Default section plans by assessment + total marks.
// These match the SCERT Odisha framework AND the observed teacher
// preferences (see production sample FA-1 25-mark paper).
// The user can override in the UI, but the plan is what Gemini must
// match exactly.
// ------------------------------------------------------------
export function planSections({ assessmentType = 'FA1', totalMarks = 25 } = {}) {
  const t = String(assessmentType || '').toUpperCase()
  if (t.startsWith('FA') || totalMarks <= 30) {
    // FA / 25-mark written paper.
    // A: 8 MCQ × 1 = 8;  B: 6 FIB × 1 = 6;  C: 3 VSA × 2 = 6;  D: 1 LA × 5 = 5;  Total 25.
    return [
      { id: 'A', type: 'MCQ', count: 8, marksEach: 1 },
      { id: 'B', type: 'FIB', count: 6, marksEach: 1 },
      { id: 'C', type: 'VSA', count: 3, marksEach: 2 },
      { id: 'D', type: 'LA',  count: 1, marksEach: 5 },
    ]
  }
  if (t.startsWith('SA') || totalMarks >= 40) {
    // SA / 50-mark paper.
    // A: 10 MCQ × 1 = 10 · B: 10 FIB × 1 = 10 · C: 5 VSA × 2 = 10 · D: 4 SA × 3 = 12 · E: 2 LA × 4 = 8 · Total 50.
    return [
      { id: 'A', type: 'MCQ', count: 10, marksEach: 1 },
      { id: 'B', type: 'FIB', count: 10, marksEach: 1 },
      { id: 'C', type: 'VSA', count: 5,  marksEach: 2 },
      { id: 'D', type: 'SA',  count: 4,  marksEach: 3 },
      { id: 'E', type: 'LA',  count: 2,  marksEach: 4 },
    ]
  }
  // Fallback (unknown assessment).
  return [
    { id: 'A', type: 'MCQ', count: 8, marksEach: 1 },
    { id: 'B', type: 'FIB', count: 6, marksEach: 1 },
    { id: 'C', type: 'VSA', count: 3, marksEach: 2 },
    { id: 'D', type: 'LA',  count: 1, marksEach: 5 },
  ]
}

// ------------------------------------------------------------
// planFromDistribution — for the LEGACY "Build New" tab which lets
// the teacher pick which question types to include.  Accepts the
// output of lib/prompts/marks-distribution.js (distributeMarks()).
//
// Old-key → v2-type map:
//   mcq → MCQ, fill → FIB, truefalse → TF, match → MATCH,
//   oneword → FIB (one-word FIB), vsa → VSA, sa → SA, la → LA.
// ------------------------------------------------------------
const OLD_KEY_TO_TYPE = {
  mcq: 'MCQ', fill: 'FIB', truefalse: 'TF', match: 'MATCH',
  oneword: 'FIB', vsa: 'VSA', sa: 'SA', la: 'LA',
}
export function planFromDistribution(distribution = []) {
  // Each item: { key, marksPerQ, count, sectionLetter } or v2-shape passthrough.
  return (distribution || []).map((s, i) => ({
    id: s.sectionLetter || String.fromCharCode(65 + i),
    type: s.type || OLD_KEY_TO_TYPE[s.key] || 'VSA',
    count: Number(s.count) || 1,
    marksEach: Number(s.marksPerQ || s.marksEach) || 1,
  }))
}

export function planTotalQuestions(plan) {
  return plan.reduce((n, s) => n + s.count, 0)
}
export function planTotalMarks(plan) {
  return plan.reduce((n, s) => n + (s.count * s.marksEach), 0)
}

// Grade → Roman / int helpers.
export function gradeToInt(grade) {
  const g = String(grade || '').toUpperCase().trim()
  const roman = { I:1, II:2, III:3, IV:4, V:5, VI:6, VII:7, VIII:8, IX:9, X:10 }
  if (roman[g] != null) return roman[g]
  const n = parseInt(g, 10)
  return Number.isFinite(n) ? n : null
}
