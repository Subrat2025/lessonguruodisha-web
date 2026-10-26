// ============================================================================
// Question Type Registry — LessonGuru Odisha Professional Assessment Builder
// ============================================================================
// Defines every question type the builder can produce, split into:
//
//   WRITTEN_TYPES           — appear as sections inside the printed paper
//   TEACHER_CONDUCTED_TYPES — appear as separate blocks (Oral, Practical,
//                             Observation, Rubrics) at the end of the packet
//
// Each entry supplies:
//   label      → English label used in UI
//   labelOdia  → Odia label rendered in the printed section title
//   sectionKey → alphabetic section prefix used to build "ବିଭାଗ - କ" etc.
//                (auto-assigned by builder; declared here as a hint)
//   defaultMarks → marks assigned to each question of this type by default
//   minCount   → minimum question count enforced by the distribution engine
//   allowInPaper → whether it belongs inside the written paper
//   bloomLevel → default Bloom's taxonomy level (used for Blueprint auto-gen)
//   difficulty → default difficulty band (E=Easy, M=Medium, H=Hard)
// ============================================================================

export const WRITTEN_TYPES = {
  mcq: {
    key: 'mcq', label: 'Multiple Choice (MCQ)',
    labelOdia: 'ବହୁ ବିକଳ୍ପୀୟ ପ୍ରଶ୍ନ (MCQ)',
    defaultMarks: 1, minCount: 3, allowInPaper: true,
    bloomLevel: 'Remember', difficulty: 'E',
  },
  fill: {
    key: 'fill', label: 'Fill in the Blanks',
    labelOdia: 'ଶୂନ୍ୟସ୍ଥାନ ପୂରଣ କର',
    defaultMarks: 1, minCount: 3, allowInPaper: true,
    bloomLevel: 'Remember', difficulty: 'E',
  },
  match: {
    key: 'match', label: 'Match the Following',
    labelOdia: 'ମେଳ କର',
    defaultMarks: 1, minCount: 4, allowInPaper: true,
    bloomLevel: 'Understand', difficulty: 'E',
  },
  truefalse: {
    key: 'truefalse', label: 'True / False',
    labelOdia: 'ସତ୍ୟ ଓ ମିଥ୍ୟା',
    defaultMarks: 1, minCount: 3, allowInPaper: true,
    bloomLevel: 'Understand', difficulty: 'E',
  },
  oneword: {
    key: 'oneword', label: 'One-word Answer',
    labelOdia: 'ଏକ ଶବ୍ଦରେ ଉତ୍ତର ଦିଅ',
    defaultMarks: 1, minCount: 3, allowInPaper: true,
    bloomLevel: 'Remember', difficulty: 'E',
  },
  vsa: {
    key: 'vsa', label: 'Very Short Answer',
    labelOdia: 'ଅତି ସଂକ୍ଷିପ୍ତ ଉତ୍ତର',
    defaultMarks: 2, minCount: 2, allowInPaper: true,
    bloomLevel: 'Understand', difficulty: 'M',
  },
  sa: {
    key: 'sa', label: 'Short Answer',
    labelOdia: 'ସଂକ୍ଷିପ୍ତ ଉତ୍ତର',
    defaultMarks: 3, minCount: 2, allowInPaper: true,
    bloomLevel: 'Apply', difficulty: 'M',
  },
  la: {
    key: 'la', label: 'Long Answer',
    labelOdia: 'ଦୀର୍ଘ ଉତ୍ତରମୂଳକ ପ୍ରଶ୍ନ',
    defaultMarks: 5, minCount: 1, allowInPaper: true,
    bloomLevel: 'Analyze', difficulty: 'H',
  },
  competency: {
    key: 'competency', label: 'Competency Based',
    labelOdia: 'ଦକ୍ଷତା ଆଧାରିତ ପ୍ରଶ୍ନ',
    defaultMarks: 4, minCount: 1, allowInPaper: true,
    bloomLevel: 'Apply', difficulty: 'M',
  },
  hots: {
    key: 'hots', label: 'Higher Order Thinking (HOTS)',
    labelOdia: 'ଉଚ୍ଚତର ଚିନ୍ତନ ପ୍ରଶ୍ନ (HOTS)',
    defaultMarks: 5, minCount: 1, allowInPaper: true,
    bloomLevel: 'Evaluate', difficulty: 'H',
  },
  casestudy: {
    key: 'casestudy', label: 'Case Study',
    labelOdia: 'ପ୍ରସଙ୍ଗ ଅଧ୍ୟୟନ',
    defaultMarks: 5, minCount: 1, allowInPaper: true,
    bloomLevel: 'Analyze', difficulty: 'H',
  },
  picture: {
    key: 'picture', label: 'Picture Based',
    labelOdia: 'ଚିତ୍ର ଆଧାରିତ ପ୍ରଶ୍ନ',
    defaultMarks: 3, minCount: 1, allowInPaper: true,
    bloomLevel: 'Understand', difficulty: 'M',
  },
  diagram: {
    key: 'diagram', label: 'Diagram Based',
    labelOdia: 'ଚିତ୍ର ଅଙ୍କନ ପ୍ରଶ୍ନ',
    defaultMarks: 3, minCount: 1, allowInPaper: true,
    bloomLevel: 'Apply', difficulty: 'M',
  },
  activity: {
    key: 'activity', label: 'Activity Based',
    labelOdia: 'କାର୍ଯ୍ୟକଳାପ ଆଧାରିତ',
    defaultMarks: 5, minCount: 1, allowInPaper: true,
    bloomLevel: 'Apply', difficulty: 'M',
  },
  project: {
    key: 'project', label: 'Project Based',
    labelOdia: 'ପ୍ରକଳ୍ପ ଭିତ୍ତିକ ପ୍ରଶ୍ନ',
    defaultMarks: 5, minCount: 1, allowInPaper: true,
    bloomLevel: 'Create', difficulty: 'H',
  },
}

export const TEACHER_CONDUCTED_TYPES = {
  oral: {
    key: 'oral', label: 'Oral Assessment',
    labelOdia: 'ମୌଖିକ ମୂଲ୍ୟାୟନ',
    block: 'oral', defaultItemCount: 5,
  },
  practical: {
    key: 'practical', label: 'Practical Assessment',
    labelOdia: 'ପ୍ରାୟୋଗିକ ମୂଲ୍ୟାୟନ',
    block: 'practical', defaultItemCount: 3,
  },
  observation: {
    key: 'observation', label: 'Observation Checklist',
    labelOdia: 'ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ ତାଲିକା',
    block: 'observation', defaultItemCount: 7,
  },
  rubrics: {
    key: 'rubrics', label: 'Rubrics',
    labelOdia: 'ମୂଲ୍ୟାୟନ ମାନଦଣ୍ଡ',
    block: 'rubrics', defaultItemCount: 4,
  },
}

export const ALL_TYPES = { ...WRITTEN_TYPES, ...TEACHER_CONDUCTED_TYPES }

export const ASSESSMENT_TYPE_LABELS = {
  fa1: 'FA1 · Formative Assessment 1',
  fa2: 'FA2 · Formative Assessment 2',
  fa3: 'FA3 · Formative Assessment 3',
  fa4: 'FA4 · Formative Assessment 4',
  sa1: 'SA1 · Summative Assessment 1',
  sa2: 'SA2 · Summative Assessment 2',
  practice: 'Practice Test',
  unit: 'Unit Test',
  revision: 'Revision Test',
}

export const MARKS_PRESETS = [25, 50, 80, 100]

// Convert an integer to Odia numerals used across the printed paper.
export const ODIA_DIGITS = ['୦', '୧', '୨', '୩', '୪', '୫', '୬', '୭', '୮', '୯']
export function toOdiaNum(n) {
  return String(n).split('').map(ch => (ch >= '0' && ch <= '9') ? ODIA_DIGITS[Number(ch)] : ch).join('')
}
// Odia alphabetic labels for section prefixes (ବିଭାଗ - କ / ଖ / ...).
export const ODIA_SECTION_LETTERS = ['କ', 'ଖ', 'ଗ', 'ଘ', 'ଙ', 'ଚ', 'ଛ', 'ଜ', 'ଝ', 'ଞ', 'ଟ', 'ଠ']
