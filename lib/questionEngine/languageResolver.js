// ============================================================
// LessonGuru Odisha — Language Resolver (Part G of the spec).
// ------------------------------------------------------------
// Given a subject + medium (+ user Sanskrit-script preference)
// deterministically decides:
//   • language   → 'Odia' | 'English' | 'Hindi' | 'Sanskrit'
//   • script     → 'Odia' | 'Latin' | 'Devanagari'
//   • numerals   → 'odia' | 'devanagari' | 'latin'
// PLUS returns a small chrome-label dictionary in the target
// language so headings (Name / Class / Date / Marks / Instructions /
// Learning Outcome / Answer Key / Time) never leak English into
// an Odia paper.
// ============================================================

// House-terminology reminders (do NOT change these strings):
//   Odia "Learning Outcome" = ଶିକ୍ଷଣ ଫଳ  (never ଶିଖନ ଫଳ)
//   Odia "Panchapadi"       = ପଞ୍ଚପଦୀ ସୋପାନ (never ପଞ୍ଚପାଦୀ)
import { SUBJECT_REGISTRY, logUnresolvedSubject } from './subjectRegistry.js'

// Indic script probes for the script-sniffing branch.
const ODIA_RANGE = /[\u0B00-\u0B7F]/
const DEVA_RANGE = /[\u0900-\u097F]/

export const LABELS = {
  Odia: {
    name: 'ନାମ', class: 'ଶ୍ରେଣୀ', date: 'ତାରିଖ', marks: 'ପୂର୍ଣ୍ଣାଙ୍କ',
    time: 'ସମୟ', answer_key: 'ଉତ୍ତର ପତ୍ର',
    instructions: 'ନିର୍ଦ୍ଦେଶାବଳୀ', learning_outcome: 'ଶିକ୍ଷଣ ଫଳ',
    section: 'ଭାଗ', question: 'ପ୍ରଶ୍ନ', answer: 'ଉତ୍ତର',
    total_marks: 'ମୋଟ ପୂର୍ଣ୍ଣାଙ୍କ', option_labels: ['କ','ଖ','ଗ','ଘ'],
  },
  English: {
    name: 'Name', class: 'Class', date: 'Date', marks: 'Marks',
    time: 'Time', answer_key: 'Answer Key',
    instructions: 'Instructions', learning_outcome: 'Learning Outcome',
    section: 'Section', question: 'Question', answer: 'Answer',
    total_marks: 'Total Marks', option_labels: ['A','B','C','D'],
  },
  Hindi: {
    name: 'नाम', class: 'कक्षा', date: 'दिनांक', marks: 'पूर्णांक',
    time: 'समय', answer_key: 'उत्तर कुंजी',
    instructions: 'निर्देश', learning_outcome: 'अधिगम प्रतिफल',
    section: 'खंड', question: 'प्रश्न', answer: 'उत्तर',
    total_marks: 'कुल पूर्णांक', option_labels: ['क','ख','ग','घ'],
  },
  // Odia-script Sanskrit (SCERT Odisha default)
  'Sanskrit-Odia': {
    name: 'ନାମ', class: 'କକ୍ଷା', date: 'ଦିନାଙ୍କ', marks: 'ପୂର୍ଣ୍ଣାଙ୍କମ୍',
    time: 'ସମୟଃ', answer_key: 'ଉତ୍ତରସୂଚୀ',
    instructions: 'ନିର୍ଦ୍ଦେଶାଃ', learning_outcome: 'ଶିକ୍ଷଣଫଳମ୍',
    section: 'ଅଂଶଃ', question: 'ପ୍ରଶ୍ନଃ', answer: 'ଉତ୍ତରମ୍',
    total_marks: 'କୁଲପୂର୍ଣ୍ଣାଙ୍କମ୍', option_labels: ['କ','ଖ','ଗ','ଘ'],
  },
  // Devanagari-script Sanskrit (per-user preference override)
  'Sanskrit-Devanagari': {
    name: 'नाम', class: 'कक्षा', date: 'दिनाङ्कः', marks: 'पूर्णाङ्कम्',
    time: 'समयः', answer_key: 'उत्तरसूची',
    instructions: 'निर्देशाः', learning_outcome: 'शिक्षणफलम्',
    section: 'अंशः', question: 'प्रश्नः', answer: 'उत्तरम्',
    total_marks: 'कुलपूर्णाङ्कम्', option_labels: ['क','ख','ग','घ'],
  },
}

/**
 * Resolve output language deterministically (Part E v2).
 * Backward-compatible signature: (subject, medium, opts).
 * @param {string} subject
 * @param {string} medium
 * @param {object} [opts]
 * @param {'Odia'|'Devanagari'} [opts.sanskritScript='Odia']
 * @param {string} [opts.book]         Book / chapter title (used for script sniffing)
 * @param {string} [opts.schoolMedium] School-wide medium of instruction
 * @param {string|number} [opts.classLevel]
 * @returns {{language,script,numerals,labels,resolvedBy}}
 */
export function resolveLanguage(subject, medium, opts = {}) {
  const raw = String(subject || '').trim()
  const s = raw.toLowerCase()
  const sanskritScript = opts.sanskritScript === 'Devanagari' ? 'Devanagari' : 'Odia'
  const book = opts.book || ''
  const schoolMedium = String(opts.schoolMedium || '').trim()

  const pack = (r, source) => {
    let labels
    if (r.language === 'Sanskrit') labels = LABELS[r.script === 'Devanagari' ? 'Sanskrit-Devanagari' : 'Sanskrit-Odia']
    else labels = LABELS[r.language] || LABELS.Odia
    return { ...r, labels, resolvedBy: source }
  }

  // 1) LANGUAGE subjects — absolute, never overridden by medium or school.
  if (/odia|oriya|ଓଡ଼ିଆ|ଓଡିଆ/.test(s))
    return pack({ language: 'Odia', script: 'Odia', numerals: 'odia' }, 'language-subject')
  if (/\benglish\b|ଇଂରାଜୀ|अंग्रे[जज]ी/.test(s))
    return pack({ language: 'English', script: 'Latin', numerals: 'latin' }, 'language-subject')
  if (/hindi|हिन्दी|ହିନ୍ଦୀ/.test(s))
    return pack({ language: 'Hindi', script: 'Devanagari', numerals: 'devanagari' }, 'language-subject')
  if (/sanskrit|संस्कृत|ସଂସ୍କୃତ/.test(s))
    return pack({ language: 'Sanskrit', script: sanskritScript, numerals: sanskritScript === 'Devanagari' ? 'devanagari' : 'odia' }, 'language-subject')

  // 2) REGISTRY lookup — the Social Science fix lives here. Content subjects
  //    are Odia by default; a school-wide English medium may override CONTENT
  //    subjects only (language subjects already returned above).
  const reg = SUBJECT_REGISTRY[s]
  if (reg) {
    if (/english/i.test(schoolMedium))
      return pack({ language: 'English', script: 'Latin', numerals: 'latin' }, 'school-medium-override')
    return pack(reg, 'registry')
  }

  // 3) SCRIPT sniffing — if the subject or book title is written in an Indic
  //    script, the book is in that language. Strong signal.
  const probe = `${raw} ${book}`
  if (ODIA_RANGE.test(probe))
    return pack({ language: 'Odia', script: 'Odia', numerals: 'odia' }, 'script-sniff')
  if (DEVA_RANGE.test(probe))
    return pack({ language: 'Hindi', script: 'Devanagari', numerals: 'devanagari' }, 'script-sniff')

  // 4) EXPLICIT medium, only if actually present and non-empty.
  const m = String(medium || schoolMedium || '').trim()
  if (/odia|oriya/i.test(m))
    return pack({ language: 'Odia', script: 'Odia', numerals: 'odia' }, 'medium')
  if (/hindi/i.test(m))
    return pack({ language: 'Hindi', script: 'Devanagari', numerals: 'devanagari' }, 'medium')
  if (/english/i.test(m))
    return pack({ language: 'English', script: 'Latin', numerals: 'latin' }, 'medium')

  // 5) UNRESOLVED — do NOT default to English. This app is Odisha-first.
  logUnresolvedSubject({ subject: raw, book, medium, classLevel: opts.classLevel })
  return pack({ language: 'Odia', script: 'Odia', numerals: 'odia' }, 'app-default')
}

// Convert an integer to the target numeral set.  Used by the layout
// fitter for question numbers and mark totals.
const NUMERAL_MAP = {
  odia:       ['୦','୧','୨','୩','୪','୫','୬','୭','୮','୯'],
  devanagari: ['०','१','२','३','४','५','६','७','८','९'],
  latin:      ['0','1','2','3','4','5','6','7','8','9'],
}
export function toNumerals(n, numeralSet) {
  const set = NUMERAL_MAP[numeralSet] || NUMERAL_MAP.latin
  return String(n).replace(/[0-9]/g, ch => set[Number(ch)])
}
