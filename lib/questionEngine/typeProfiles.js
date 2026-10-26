// ============================================================
// LessonGuru Odisha — Worksheet Type Profiles (Part E v2).
// Each profile has:
//   brief        — pedagogy (internal English instruction to the model)
//   languageNote — a type-specific reminder of where English leaks in THIS type
// The language lock (promptBuilder.buildLanguageLock) is machine-prepended to
// every brief before it reaches Gemini, so the model never treats the English
// brief as a language sample.
// ============================================================

export const TYPE_PROFILES = {
  practice: {
    label: '📝 Practice',
    brief: 'Drill and consolidate. Straightforward items over the taught content, ordered easy → harder. Bloom: mostly Remember, Understand and Apply. Start with a single short worked example before item 1 so the child sees the expected style.',
    languageNote: "The worked example's label, its working-out and its commentary must ALL be in the target language.",
  },
  assessment: {
    label: '📊 Assessment',
    brief: 'Formal graded test. Use board-paper phrasing. Print marks per item. Mix formats. Spread coverage evenly across the whole chapter. Include an instruction line at the top and a total-marks figure.',
    languageNote: 'The instruction line, "Total Marks", "Time Allowed" and every section heading must be in the target language and numerals.',
  },
  hots: {
    label: '🧠 HOTS',
    brief: 'Higher-Order Thinking only. EVERY item must be Analyse, Evaluate or Create — ZERO recall items. Present a NEW situation NOT in the textbook that can only be solved using chapter concepts. Ask for justification, comparison, prediction, or a defended opinion.',
    languageNote: "The invented scenario must be set in the target language's cultural world — an Odia HOTS item uses Odia place names, crops, festivals and rupee amounts, not \"John buys 5 apples\".",
  },
  activity: {
    label: '🎨 Activity',
    brief: 'Do-then-answer. Each item pairs a small hands-on task (observe, draw, measure, collect from home, ask a family member, role-play) with a question about what the child found and WHY. Materials must be cheap and locally available in Odisha.',
    languageNote: 'Headings like "Materials needed", "What you will do", "What you saw" in the target language; material names must be the local word (ଦାନ୍ତକାଠି, ଛେନା, ମାଟି ହାଣ୍ଡି — not "twig", "bowl").',
  },
  competency: {
    label: '🎯 Competency',
    brief: 'NCF / PARAKH competency-based. Every item is a real-life scenario stem SET IN ODISHA (village market, school garden, bus fare, festival, farm, rainy day) that the child must resolve using chapter learning. Prefer case-based clusters of 3–4 questions on one short passage.',
    languageNote: 'Scenario passage, character names and place names all in the target language — names like Sanjay/Pallavi/Jhili, places like Bargarh/Puri/Kendrapara.',
  },
  skill: {
    label: '💪 Skill',
    brief: 'Process and procedure. Test the ability to DO: sequence steps, complete a table, read a diagram / map / graph, correct an error, follow instructions, classify items into groups. Keep prose minimal — most items should include a table, sequence or diagram description.',
    languageNote: 'Table column headers, diagram labels, map legends and step numbers all in the target language and numerals. This is the type that leaks English most — be strict.',
  },
  revision: {
    label: '🔄 Revision',
    brief: 'Whole-chapter sweep before an exam. Every major sub-topic gets at least ONE item. Rapid-fire mix of one-mark formats plus 2 consolidating questions. Begin with a 5-point key-recap box at the top of the paper.',
    languageNote: 'The recap box is generated prose — write all 5 points in the target language.',
  },
  homework: {
    label: '🏠 Homework',
    brief: 'Solvable ALONE at home in 20–25 minutes with NO adult help and NO internet. Clear self-contained instructions. Add one gentle reflection question at the end. Include the hint field on EVERY item.',
    languageNote: 'The parent may not read English. Instructions, hints and the reflection question MUST be in the target language — this is the type where a wrong language makes the sheet completely unusable at home.',
  },
  project: {
    label: '🚀 Project',
    brief: 'ONE extended task broken into 4–6 guided sub-questions, PLUS a 4-criterion assessment rubric (understanding, effort, presentation, originality) with descriptors. Timeline of 3–7 days. Must be locally doable with cheap materials.',
    languageNote: 'Every rubric criterion AND every performance descriptor in the target language; the day-by-day timeline uses target-language numerals and day names.',
  },
  remedial: {
    label: '🩹 Remedial',
    brief: 'For a child who did NOT follow the lesson. Break every idea into small steps, ONE idea per item. Heavy scaffolding: give a worked model answer for the first item. Target the 3 most common misconceptions in this topic explicitly. Warm, encouraging tone.',
    languageNote: 'Encouragement lines must sound natural to a child in that language — translate the warmth, do not translate word-for-word from English.',
  },
  exam: {
    label: '📜 Exam',
    brief: 'Full board-style question paper. Include header, instruction block, time, total marks, Section A (1-mark objective), Section B (2-mark), Section C (3-mark), Section D (5-mark), internal choice in the long-answer section, and a SEPARATE answer key with a marking scheme.',
    languageNote: 'Section labels, "or" for internal choice (ଅଥବା / अथवा / ବା), and the ENTIRE marking scheme in the target language.',
  },
}

// Extra brief appended when mode === 'engagement' (Student Engagement Zone).
export const ENGAGEMENT_BRIEF_TAIL = `\n\nENGAGEMENT MODE ADDITIONS:\nConversational and playful. Short, punchy items (each stem under 90 characters so it fits a phone screen). Add a one-line encouraging feedback string for BOTH correct and incorrect responses (put it in the explanation field) — both written FRESH in the target language, never translated stiffly from English. Include a hint on every item. Sequence from easiest to hardest so the child builds confidence. The LANGUAGE LOCK applies here exactly as for printed worksheets.`

export function getTypeProfile(type, mode = 'worksheet') {
  const key = String(type || 'practice').toLowerCase()
  const p = TYPE_PROFILES[key] || TYPE_PROFILES.practice
  // brief = pedagogy + the type-specific language leak reminder.
  let brief = `${p.brief}\n\nLANGUAGE NOTE FOR THIS TYPE: ${p.languageNote}`
  if (mode === 'engagement') brief += ENGAGEMENT_BRIEF_TAIL
  return { key, label: p.label, brief, languageNote: p.languageNote }
}
