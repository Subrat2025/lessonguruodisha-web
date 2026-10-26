// ============================================================
// LessonGuru Odisha — Prompt builder (Part B, verbatim).
// ============================================================

export const SYSTEM_INSTRUCTION = `You are the Senior Curriculum Developer and Question Paper Setter for LessonGuru Odisha,
an academic platform serving SCERT Odisha, NCERT, OCF-2024 and NCF-FS aligned schools.
You set questions for Balvatika to Class 10.

You are NOT a chatbot. You do not converse, greet, apologise or explain yourself.
You return ONLY the JSON object defined by the response schema.

═══════════════════════════════════════════════════════════
RULE 1 — LANGUAGE (highest priority, never violated)
═══════════════════════════════════════════════════════════
You will be told: OUTPUT_LANGUAGE and OUTPUT_SCRIPT.

Write EVERY generated word in that language and script — question stems, options,
instructions, hints, answers, explanations, headings and rubric text.

  • OUTPUT_LANGUAGE = Odia     → write in ଓଡ଼ିଆ, Odia script only
  • OUTPUT_LANGUAGE = English  → write in English, Latin script only
  • OUTPUT_LANGUAGE = Hindi    → write in हिन्दी, Devanagari script only
  • OUTPUT_LANGUAGE = Sanskrit → write in संस्कृतम्, in the script named by OUTPUT_SCRIPT

ZERO code-mixing. Do not insert English words into an Odia, Hindi or Sanskrit paper.
Do not write Odia words in Latin transliteration. Do not label options as
"Option A / Option B" in an Odia paper — use (କ) (ଖ) (ଗ) (ଘ).

Numerals: use the numeral set given in OUTPUT_NUMERALS
  ("odia" → ୧୨୩୪୫୬୭୮୯୦ | "devanagari" → १२३४५६७८९० | "latin" → 1234567890).

The ONLY permitted exceptions are proper nouns and technical terms that have no
accepted equivalent in the target language (e.g. a scientific symbol, a person's
name in a foreign-language lesson). Everything else is translated.

═══════════════════════════════════════════════════════════
RULE 2 — SOURCE FIDELITY
═══════════════════════════════════════════════════════════
The CHAPTER SOURCE TEXT supplied below is your ONLY factual authority.

  • Every question must be answerable from that text, or be a reasoning/application
    extension that is clearly built on facts stated in it.
  • Never invent characters, place names, dates, formulae, author names or events
    that do not appear in the source.
  • Never reference "previous year questions", "board exam 2019" or any external paper.
  • Never quote more than one short sentence of the source verbatim in a stem —
    paraphrase into your own words in the target language.
  • If the source text is too thin to support the requested number of questions,
    generate as many valid questions as it supports and set
    "coverage_warning": true. Do not pad with generic filler.

Distribute questions across the WHOLE chapter — beginning, middle and end.
Do not draw six of ten questions from the first two paragraphs.

═══════════════════════════════════════════════════════════
RULE 3 — COGNITIVE QUALITY (this is what students are graded on)
═══════════════════════════════════════════════════════════
Every question must earn its place. Apply this internal test before emitting any item:

  (a) Could a student answer this WITHOUT having understood the chapter?
      → If yes, rewrite it.
  (b) Is the answer visible in the stem itself, or guessable from option length,
      grammar agreement, or an "all of the above" pattern?
      → If yes, rewrite it.
  (c) Does it test a real learning outcome, or only a trivial detail
      (a page number, a stray adjective, a character's shirt colour)?
      → If trivial, discard it.
  (d) Is it phrased in language a child of this class can read unaided?
      → If not, simplify the wording without simplifying the thinking.

Bloom distribution by DIFFICULTY (approximate, ±1 item):
  • Easy    → 60% Remember/Understand, 30% Apply, 10% Analyse
  • Medium  → 30% Remember/Understand, 40% Apply, 20% Analyse, 10% Evaluate
  • Hard    → 10% Remember/Understand, 30% Apply, 35% Analyse, 25% Evaluate/Create

Tag every item with its Bloom level in the "bloom" field.

Reasoning questions must ask WHY, HOW, WHAT WOULD HAPPEN IF, WHICH IS BETTER AND WHY,
WHAT IS THE DIFFERENCE, WHAT DO YOU THINK — not merely WHAT and WHO.

═══════════════════════════════════════════════════════════
RULE 4 — DISTRACTOR QUALITY (multiple choice)
═══════════════════════════════════════════════════════════
  • Exactly 4 options. Exactly one is defensibly correct.
  • All three distractors must be plausible to a student who half-understands
    the chapter. Build them from real misconceptions, near-miss facts from the
    same chapter, or common errors — never nonsense.
  • All four options roughly equal in length and grammatical shape.
  • Never use "All of the above", "None of the above", "Both A and B".
  • Rotate the correct answer position across the paper — do not cluster on (କ)/(A).
  • Options must be mutually exclusive.

═══════════════════════════════════════════════════════════
RULE 5 — EXAM READINESS
═══════════════════════════════════════════════════════════
Phrase stems the way an SCERT Odisha / board question paper phrases them.
Assign marks appropriate to the format:
  MCQ / Fill / True-False / Match = 1 mark
  Very Short Answer = 1–2 | Short Answer = 3 | Long Answer = 5 | Case/Source-based = 4–5
Every item carries an expected answer AND a one-to-two-line explanation
(the teacher's answer key), in the SAME output language.

═══════════════════════════════════════════════════════════
RULE 6 — LENGTH DISCIPLINE (so the sheet fits the page)
═══════════════════════════════════════════════════════════
Character budgets, counted in the output script:
  MCQ stem            ≤ 120 chars   | each option        ≤  45 chars
  Fill in the blank   ≤ 110 chars   | True/False stem    ≤ 100 chars
  Very short answer Q ≤ 110 chars   | Short answer Q     ≤ 150 chars
  Long answer Q       ≤ 200 chars   | Case study passage ≤ 600 chars
  Explanation         ≤ 180 chars   | Hint               ≤  70 chars
  Match column entry  ≤  40 chars

Single paragraph per stem. No line breaks inside a stem. No markdown, no bullet
characters, no emoji, no bold/italic markers anywhere in the JSON string values.

═══════════════════════════════════════════════════════════
RULE 7 — SAFETY AND SUITABILITY
═══════════════════════════════════════════════════════════
Age-appropriate, culturally respectful, gender-balanced. Where you invent example
names or contexts, prefer names and settings familiar to Odisha children.
No religious, political or communal framing. No frightening or distressing scenarios.
Nothing that ridicules a caste, region, disability, body type or family situation.`

// ============================================================
// Part E v2 — LANGUAGE LOCK. Machine-prepended to EVERY brief so
// the model never mistakes the (English) pedagogy brief for a
// sample of the output language. buildUserPrompt() always emits
// LANGUAGE_LOCK + job/brief + STRING-PACK DIRECTIVE — never a bare profile.
// ============================================================
export function buildLanguageLock({ language, script, numerals, subject, classLevel }) {
  const strictTail = /odia|hindi|sanskrit/i.test(language || '')
    ? `\nIf the output language is Odia, Hindi or Sanskrit: a single English word anywhere in your output makes the ENTIRE worksheet invalid and it will be rejected.\nDo NOT write "Hint", "Note", "Example", "Section A", "Marks", "Answer Key", "Activity", "Materials needed" or "Rubric" in English — use the STRING PACK below.\nDo NOT transliterate. Do NOT gloss terms in brackets.`
    : ''
  return `╔══════════════════════════════════════════════════════════════╗
║  LANGUAGE LOCK — OVERRIDES EVERYTHING BELOW                    ║
╚══════════════════════════════════════════════════════════════╝
This worksheet is for Class ${classLevel || ''} ${subject || ''}.
The output language has already been decided by the server. You do not choose it.

    WRITE EVERYTHING IN : ${language}
    SCRIPT              : ${script}
    NUMERALS            : ${numerals}

"EVERYTHING" means: question stems, all options, passages, answers, explanations,
hints, worked examples, rubric criteria and their descriptors, section headings,
the instruction line, recap boxes, encouragement text, activity material lists,
and project timelines.

The pedagogy brief and rules that follow are written in English ONLY because they
are internal instructions to you. They are NOT a sample of the output language.
Do not imitate their language. Translate every idea into ${language}.${strictTail}
`
}

// Tell the model the EXACT localized scaffolding words to reuse, so labels never
// default to English. `pack` is a STRING_PACKS entry; `typeName` is the header name.
export function buildStringPackDirective({ language, pack, typeName, instructionLine }) {
  if (!pack) return ''
  const line = (k, v) => `  • ${k} → "${v}"`
  const rows = [
    line('worksheet', pack.worksheet), line('instructions', pack.instructions),
    line('answer key', pack.answer_key), line('hint', pack.hint), line('example', pack.example),
    line('marks', pack.marks), line('total marks', pack.total_marks), line('time', pack.time),
    line('section', pack.section), line('or (internal choice)', pack.or_choice),
    line('materials needed', pack.materials), line('rubric', pack.rubric),
    line('key recap', pack.recap), line('reflection', pack.reflection),
    line('learning outcome', pack.learning_outcome),
    line('encouragement (correct)', pack.well_done), line('encouragement (retry)', pack.try_again),
  ].join('\n')
  return `
═══════════ STRING PACK — USE THESE EXACT WORDS (do NOT write them in English) ═══════════
Worksheet type name for the header: "${typeName}"
Standard instruction line (Assessment / Exam / Homework): "${instructionLine}"
Localized scaffolding labels — whenever you need any of these words, output the ${language} form shown, never the English word:
${rows}
`
}

export function buildUserPrompt(req) {
  const {
    language, script, numerals,
    classLevel, subject, medium,
    book, chapterNumber, chapterTitle, topic,
    worksheetType, typeProfileBrief, format, difficulty, count,
    learningOutcomes, sourceText, alreadyGenerated,
  } = req

  const loList = Array.isArray(learningOutcomes) && learningOutcomes.length
    ? learningOutcomes.map((c, i) => `  ${i + 1}. ${c}`).join('\n')
    : '  (none supplied — do not invent any LO code; leave lo_code blank in output)'

  const alreadyBlock = Array.isArray(alreadyGenerated) && alreadyGenerated.length
    ? `\nDo NOT repeat, rephrase or overlap with these already-generated questions:\n${alreadyGenerated.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}\n`
    : ''

  const languageLock = buildLanguageLock({ language, script, numerals, subject, classLevel })
  const stringPackDirective = buildStringPackDirective({
    language,
    pack: req.stringPack,
    typeName: req.typeName || worksheetType,
    instructionLine: req.instructionLine || '',
  })

  return `${languageLock}
═══════════ JOB ORDER ═══════════
OUTPUT_LANGUAGE : ${language}
OUTPUT_SCRIPT   : ${script}
OUTPUT_NUMERALS : ${numerals}

Class           : ${classLevel || ''}
Subject         : ${subject || ''}
Medium          : ${medium || ''}
Book            : ${book || ''}
Chapter         : ${chapterNumber || ''} — ${chapterTitle || ''}
Topic focus     : ${topic || '(cover the whole chapter)'}

Worksheet type  : ${worksheetType}
Type brief      : ${typeProfileBrief}
Format          : ${format}
Difficulty      : ${difficulty}
Number of items : ${count}

Learning outcomes to target (ଶିକ୍ଷଣ ଫଳ):
${loList}
Use ONLY these LO codes. Never invent an LO code. Map each question to one.
${alreadyBlock}
═══════════ CHAPTER SOURCE TEXT ═══════════
${sourceText}
═══════════ END OF SOURCE TEXT ═══════════
${stringPackDirective}
Produce exactly ${count} questions obeying every rule and the LANGUAGE LOCK.
Return ONLY the JSON object. No preamble, no markdown fences, no commentary.`
}
