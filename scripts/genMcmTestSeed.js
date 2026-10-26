// One-off generator: builds /app/lib/mcm/mcmTestSeed.json from the extracted
// question bank (/tmp/qbank.json). Uses the 25 "HARD" (Real Exam) questions
// per month. Re-runnable.
const fs = require('fs');
const { HARD } = JSON.parse(fs.readFileSync('/tmp/qbank.json', 'utf8'));

const MONTHS = [
  { key: 'july-2026', src: 'july', monthLabel: 'ଜୁଲାଇ ୨୦୨୬', monthEn: 'July 2026', monthShort: 'JUL', order: 202607 },
  { key: 'aug-2026', src: 'aug', monthLabel: 'ଅଗଷ୍ଟ ୨୦୨୬', monthEn: 'August 2026', monthShort: 'AUG', order: 202608 },
  { key: 'sep-2026', src: 'sep', monthLabel: 'ସେପ୍ଟେମ୍ବର ୨୦୨୬', monthEn: 'September 2026', monthShort: 'SEP', order: 202609 },
];

const INSTRUCTIONS =
  'ଏହି ପରୀକ୍ଷାରେ ମାସିକ କ୍ଲଷ୍ଟର ସ୍ତରୀୟ ବୈଠକ (MCM) ଉପରେ ଆଧାରିତ ପ୍ରଶ୍ନ ରହିଛି। ପ୍ରତ୍ୟେକ ପ୍ରଶ୍ନର ୪ଟି ବିକଳ୍ପ ମଧ୍ୟରୁ ଗୋଟିଏ ସଠିକ୍ ଉତ୍ତର ବାଛନ୍ତୁ। ସମୟ ସୀମା ମଧ୍ୟରେ ସମସ୍ତ ପ୍ରଶ୍ନର ଉତ୍ତର ଦିଅନ୍ତୁ ଏବଂ ଶେଷରେ Submit କରନ୍ତୁ।';

const tests = MONTHS.map(m => {
  const bank = HARD[m.src] || [];
  const questions = bank.map((it, i) => ({
    id: 'q' + (i + 1),
    q: it.q,
    options: it.o,
    correctIndex: it.a,
    marks: 1,
    explanation: it.e || '',
  }));
  return {
    key: m.key,
    monthLabel: m.monthLabel,
    monthEn: m.monthEn,
    monthShort: m.monthShort,
    order: m.order,
    title: 'MCM ଜ୍ଞାନ ପରୀକ୍ଷା — ' + m.monthLabel,
    instructions: INSTRUCTIONS,
    durationMinutes: 25,
    passingPercentage: 60,
    marksPerQuestion: 1,
    certificateTitle: 'MCM Knowledge Test',
    questions,
    // aug is the initially-active test
    published: m.src === 'aug',
  };
});

fs.mkdirSync('/app/lib/mcm', { recursive: true });
fs.writeFileSync('/app/lib/mcm/mcmTestSeed.json', JSON.stringify({ tests }, null, 0));
console.log('WROTE /app/lib/mcm/mcmTestSeed.json — tests:', tests.map(t => `${t.key}(${t.questions.length}Q, published=${t.published})`).join(', '));
