// ============================================================
// LessonGuru Odisha — String Packs (Part E v2, §E5).
// The MODEL generates the content; the APP supplies the labels.
// Neither may ever default to English for a non-English paper.
// These localized scaffolding words are injected into the prompt
// so the model reuses them verbatim instead of writing "Hint:" etc.
// ============================================================

// Odia-script Sanskrit is the SCERT Odisha default; Devanagari is a
// per-user override handled by picking the 'Sanskrit-Devanagari' pack.
export const STRING_PACKS = {
  Odia: {
    worksheet: 'ଅଭ୍ୟାସ ପତ୍ର', instructions: 'ନିର୍ଦ୍ଦେଶାବଳୀ', answer_key: 'ଉତ୍ତର ପତ୍ର',
    hint: 'ସୂଚନା', example: 'ଉଦାହରଣ', marks: 'ପୂର୍ଣ୍ଣାଙ୍କ', time: 'ସମୟ', section: 'ବିଭାଗ',
    or_choice: 'ଅଥବା', materials: 'ଆବଶ୍ୟକ ସାମଗ୍ରୀ', rubric: 'ମୂଲ୍ୟାଙ୍କନ ସୂଚୀ', recap: 'ମନେ ରଖ',
    reflection: 'ଭାବି ଦେଖ', well_done: 'ବହୁତ ଭଲ!', try_again: 'ପୁଣି ଚେଷ୍ଟା କର',
    learning_outcome: 'ଶିକ୍ଷଣ ଫଳ', total_marks: 'ମୋଟ ପୂର୍ଣ୍ଣାଙ୍କ',
  },
  English: {
    worksheet: 'Worksheet', instructions: 'Instructions', answer_key: 'Answer Key',
    hint: 'Hint', example: 'Example', marks: 'Marks', time: 'Time', section: 'Section',
    or_choice: 'Or', materials: 'Materials Needed', rubric: 'Rubric', recap: 'Key Recap',
    reflection: 'Think About It', well_done: 'Well done!', try_again: 'Try again',
    learning_outcome: 'Learning Outcome', total_marks: 'Total Marks',
  },
  Hindi: {
    worksheet: 'अभ्यास पत्र', instructions: 'निर्देश', answer_key: 'उत्तर कुंजी',
    hint: 'संकेत', example: 'उदाहरण', marks: 'पूर्णांक', time: 'समय', section: 'खंड',
    or_choice: 'अथवा', materials: 'आवश्यक सामग्री', rubric: 'मूल्यांकन सूची', recap: 'याद रखें',
    reflection: 'सोचिए', well_done: 'बहुत अच्छा!', try_again: 'फिर से प्रयास करें',
    learning_outcome: 'अधिगम प्रतिफल', total_marks: 'कुल पूर्णांक',
  },
  // Odia-script Sanskrit (default)
  'Sanskrit-Odia': {
    worksheet: 'ଅଭ୍ୟାସପତ୍ରମ୍', instructions: 'ନିର୍ଦ୍ଦେଶାଃ', answer_key: 'ଉତ୍ତରସୂଚୀ',
    hint: 'ସଙ୍କେତଃ', example: 'ଉଦାହରଣମ୍', marks: 'ପୂର୍ଣ୍ଣାଙ୍କମ୍', time: 'ସମୟଃ', section: 'ବିଭାଗଃ',
    or_choice: 'ଅଥବା', materials: 'ଆବଶ୍ୟକସାମଗ୍ରୀ', rubric: 'ମୂଲ୍ୟାଙ୍କନସୂଚୀ', recap: 'ସ୍ମରଣୀୟମ୍',
    reflection: 'ଚିନ୍ତନମ୍', well_done: 'ସାଧୁ!', try_again: 'ପୁନଃ ପ୍ରଯତସ୍ୱ',
    learning_outcome: 'ଶିକ୍ଷଣଫଳମ୍', total_marks: 'କୁଲପୂର୍ଣ୍ଣାଙ୍କମ୍',
  },
  // Devanagari-script Sanskrit (per-user override)
  'Sanskrit-Devanagari': {
    worksheet: 'अभ्यासपत्रम्', instructions: 'निर्देशाः', answer_key: 'उत्तरसूची',
    hint: 'सङ्केतः', example: 'उदाहरणम्', marks: 'पूर्णाङ्कम्', time: 'समयः', section: 'विभागः',
    or_choice: 'अथवा', materials: 'आवश्यकसामग्री', rubric: 'मूल्याङ्कनसूची', recap: 'स्मरणीयम्',
    reflection: 'चिन्तनम्', well_done: 'साधु!', try_again: 'पुनः प्रयतस्व',
    learning_outcome: 'शिक्षणफलम्', total_marks: 'कुलपूर्णाङ्कम्',
  },
}

// Worksheet-type display names for the header, per language.
export const TYPE_NAMES = {
  Odia: {
    practice: 'ଅଭ୍ୟାସ', assessment: 'ମୂଲ୍ୟାଙ୍କନ', hots: 'ଉଚ୍ଚସ୍ତରୀୟ ଚିନ୍ତନ', activity: 'କାର୍ଯ୍ୟକଳାପ',
    competency: 'ଦକ୍ଷତା ଆଧାରିତ', skill: 'କୌଶଳ', revision: 'ପୁନରାବୃତ୍ତି', homework: 'ଗୃହକାର୍ଯ୍ୟ',
    project: 'ପ୍ରକଳ୍ପ କାର୍ଯ୍ୟ', remedial: 'ପ୍ରତିକାରମୂଳକ ଶିକ୍ଷଣ', exam: 'ପରୀକ୍ଷା',
  },
  English: {
    practice: 'Practice', assessment: 'Assessment', hots: 'HOTS', activity: 'Activity',
    competency: 'Competency', skill: 'Skill', revision: 'Revision', homework: 'Homework',
    project: 'Project', remedial: 'Remedial', exam: 'Exam',
  },
  Hindi: {
    practice: 'अभ्यास', assessment: 'मूल्यांकन', hots: 'उच्च स्तरीय चिंतन', activity: 'गतिविधि',
    competency: 'दक्षता आधारित', skill: 'कौशल', revision: 'पुनरावृत्ति', homework: 'गृहकार्य',
    project: 'परियोजना कार्य', remedial: 'उपचारात्मक शिक्षण', exam: 'परीक्षा',
  },
  'Sanskrit-Odia': {
    practice: 'ଅଭ୍ୟାସଃ', assessment: 'ମୂଲ୍ୟାଙ୍କନମ୍', hots: 'ଉଚ୍ଚସ୍ତରୀୟଚିନ୍ତନମ୍', activity: 'କ୍ରିୟାକଳାପଃ',
    competency: 'ଦକ୍ଷତାଧାରିତମ୍', skill: 'କୌଶଲମ୍', revision: 'ପୁନରାବୃତ୍ତିଃ', homework: 'ଗୃହକାର୍ଯ୍ୟମ୍',
    project: 'ପ୍ରକଳ୍ପକାର୍ଯ୍ୟମ୍', remedial: 'ପ୍ରତିକାରାତ୍ମକମ୍', exam: 'ପରୀକ୍ଷାପତ୍ରମ୍',
  },
  'Sanskrit-Devanagari': {
    practice: 'अभ्यासः', assessment: 'मूल्याङ्कनम्', hots: 'उच्चस्तरीयचिन्तनम्', activity: 'क्रियाकलापः',
    competency: 'दक्षताधारितम्', skill: 'कौशलम्', revision: 'पुनरावृत्तिः', homework: 'गृहकार्यम्',
    project: 'प्रकल्पकार्यम्', remedial: 'प्रतिकारात्मकम्', exam: 'परीक्षापत्रम्',
  },
}

// Standard instruction lines used by Assessment / Exam / Homework.
export const INSTRUCTION_LINES = {
  Odia: 'ସମସ୍ତ ପ୍ରଶ୍ନର ଉତ୍ତର ଦିଅ । ପ୍ରତ୍ୟେକ ପ୍ରଶ୍ନର ପୂର୍ଣ୍ଣାଙ୍କ ଡାହାଣ ପାର୍ଶ୍ୱରେ ଦିଆଯାଇଛି ।',
  Hindi: 'सभी प्रश्नों के उत्तर दीजिए। प्रत्येक प्रश्न के अंक दाईं ओर दिए गए हैं।',
  'Sanskrit-Odia': 'ସର୍ବେଷାଂ ପ୍ରଶ୍ନାନାମ୍ ଉତ୍ତରାଣି ଲିଖତ । ପ୍ରତ୍ୟେକପ୍ରଶ୍ନସ୍ୟ ଅଙ୍କାଃ ଦକ୍ଷିଣପାର୍ଶ୍ୱେ ପ୍ରଦତ୍ତାଃ ।',
  'Sanskrit-Devanagari': 'सर्वेषां प्रश्नानाम् उत्तराणि लिखत । प्रत्येकप्रश्नस्य अङ्काः दक्षिणपार्श्वे प्रदत्ताः ।',
  English: 'Answer all questions. Marks for each question are shown on the right.',
}

// Return the correct pack key for a resolved {language, script}.
export function packKey(language, script) {
  if (language === 'Sanskrit') return script === 'Devanagari' ? 'Sanskrit-Devanagari' : 'Sanskrit-Odia'
  return language
}

export function getStringPack(language, script) {
  return STRING_PACKS[packKey(language, script)] || STRING_PACKS.Odia
}
export function getTypeNames(language, script) {
  return TYPE_NAMES[packKey(language, script)] || TYPE_NAMES.Odia
}
export function getInstructionLine(language, script) {
  return INSTRUCTION_LINES[packKey(language, script)] || INSTRUCTION_LINES.Odia
}
