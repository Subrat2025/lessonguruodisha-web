import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'

// =================== CLASSES (with Odia name) ===================
export const CLASSES = [
  { name: 'Balvatika', nameOdia: 'ବାଳବାଟିକା', slug: 'balvatika', order: 0, emoji: '🧸', color: 'from-pink-400 to-rose-500' },
  { name: 'Class 1', nameOdia: 'ପ୍ରଥମ ଶ୍ରେଣୀ', slug: 'class-1', order: 1, emoji: '🎈', color: 'from-orange-400 to-red-500' },
  { name: 'Class 2', nameOdia: 'ଦ୍ୱିତୀୟ ଶ୍ରେଣୀ', slug: 'class-2', order: 2, emoji: '🎨', color: 'from-yellow-400 to-orange-500' },
  { name: 'Class 3', nameOdia: 'ତୃତୀୟ ଶ୍ରେଣୀ', slug: 'class-3', order: 3, emoji: '✏️', color: 'from-lime-400 to-green-500' },
  { name: 'Class 4', nameOdia: 'ଚତୁର୍ଥ ଶ୍ରେଣୀ', slug: 'class-4', order: 4, emoji: '📐', color: 'from-emerald-400 to-teal-500' },
  { name: 'Class 5', nameOdia: 'ପଞ୍ଚମ ଶ୍ରେଣୀ', slug: 'class-5', order: 5, emoji: '📚', color: 'from-cyan-400 to-blue-500' },
  { name: 'Class 6', nameOdia: 'ଷଷ୍ଠ ଶ୍ରେଣୀ', slug: 'class-6', order: 6, emoji: '🔬', color: 'from-blue-400 to-indigo-500' },
  { name: 'Class 7', nameOdia: 'ସପ୍ତମ ଶ୍ରେଣୀ', slug: 'class-7', order: 7, emoji: '🌍', color: 'from-indigo-400 to-purple-500' },
  { name: 'Class 8', nameOdia: 'ଅଷ୍ଟମ ଶ୍ରେଣୀ', slug: 'class-8', order: 8, emoji: '🧪', color: 'from-purple-400 to-fuchsia-500' },
  { name: 'Class 9', nameOdia: 'ନବମ ଶ୍ରେଣୀ', slug: 'class-9', order: 9, emoji: '📊', color: 'from-fuchsia-400 to-pink-500' },
  { name: 'Class 10', nameOdia: 'ଦଶମ ଶ୍ରେଣୀ', slug: 'class-10', order: 10, emoji: '🎓', color: 'from-rose-400 to-red-600' },
]

// =================== BOOKS PER CLASS (Odisha curriculum) ===================
// Color palette cycles per index
const BOOK_COLORS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-pink-500 to-rose-600',
  'from-purple-500 to-fuchsia-600',
  'from-cyan-500 to-blue-600',
  'from-red-500 to-pink-600',
  'from-green-500 to-emerald-600',
  'from-violet-500 to-purple-600',
  'from-teal-500 to-cyan-600',
  'from-orange-500 to-red-600',
  'from-indigo-500 to-violet-600',
  'from-fuchsia-500 to-pink-600',
  'from-sky-500 to-blue-600',
  'from-lime-500 to-green-600',
]
const BOOK_EMOJIS = ['📘', '📗', '📕', '📙', '📒', '📓', '📔', '📚']

export const BOOKS_BY_CLASS = {
  'balvatika': [
    'ଝୁଲଣା',
  ],
  'class-1': [
    'ଝୁଲଣା ଶ୍ରେଣୀ ୧',
    'Ganita Khela',
  ],
  'class-2': [
    'ଝୁଲଣା ଦ୍ୱିତୀୟ ଶ୍ରେଣୀ',
    'Majare Majare Ganita',
  ],
  'class-3': [
    'ଭାଷା ମହକ 1',
    'ଆମ ବିଚିତ୍ର ପୃଥିବୀ',
    'ଗଣିତ ମେଳା',
    'ଇନ୍ଦ୍ରଧନୁ',
    'ଖେଳ ଯୋଗ',
    'Pallavi',
  ],
  'class-4': [
    'ଭାଷା ମହକ 2',
    'ଇନ୍ଦ୍ରଧନୁ',
    'ଗଣିତ ମେଳା',
    'ଆମ ବିଚିତ୍ର ବିଶ୍ୱ',
    'ପଲ୍ଲବୀ',
    'Khela o Joga',
  ],
  'class-5': [
    'ଆମ ବିଚିତ୍ର ବିଶ୍ୱ',
    'ଭାଷା ମହକ 3',
    'ପଲ୍ଲବୀ',
    'ଖେଳ ଯୋଗ',
    'ଗଣିତ ମେଳା',
    'ନବରସ',
  ],
  'class-6': [
    'Jasmine',
    'ହିନ୍ଦୀ କଳିକା',
    'କଳାକୁଞ୍ଜ',
    'ଖେଳ ଶିକ୍ଷା',
    'କୌଶଳ ବୋଧ',
    'ଗଣିତ ପ୍ରକାଶ',
    'ସାହିତ୍ୟ ସୁଧା',
    'ସଂସ୍କୃତ କଳିକା - 1',
    'ବିଜ୍ଞାନ',
    'Adhyayan: Bharat O Ama Pruthibi',
    'ଉଲ୍ଲାସ',
  ],
  'class-7': [
    'Jasmine',
    'ହିନ୍ଦୀ କଳିକା',
    'କୃତି',
    'ଖେଳ ଶିକ୍ଷା',
    'କୌଶଳ ବୋଧ',
    'ଗଣିତ ପ୍ରକାଶ',
    'ସାହିତ୍ୟ ସୁମନ',
    'ସଂସ୍କୃତ କଳିକା - 2',
    'ବିଜ୍ଞାନ',
    'Adhyayan: Bharat O Ama Pruthibi',
    'ଉଲ୍ଲାସ',
  ],
  'class-8': [
    'Jasmine',
    'ହିନ୍ଦୀ କଳିକା',
    'ବିଜ୍ଞାନ',
    'ଖେଳ ଶିକ୍ଷା',
    'କୌଶଳ ବୋଧ',
    'କୃତି',
    'ଗଣିତ ପ୍ରକାଶ',
    'ସାହିତ୍ୟ ସୁରଭି',
    'ସଂସ୍କୃତ କଳିକା - 3',
    'ସାମାଜିକ ବିଜ୍ଞାନ',
    'ଉଲ୍ଲାସ',
  ],
  'class-9': [
    'ସାହିତ୍ୟ ଧାରା',
    'ମାଧ୍ୟମିକ ବ୍ୟାକରଣ',
    'Learn & Practice Grammar',
    'Skills of Communicative English',
    'Sanskruta Ballari',
    'ସଂସ୍କୃତ ବ୍ୟାକରଣ ପ୍ରଦୀପ',
    'Hindi Manjari',
    'Hindi Byakaran aur Prayog',
    'ମାଧ୍ୟମିକ ବୀଜଗଣିତ',
    'ମାଧ୍ୟମିକ ଜ୍ୟାମିତି',
    'ଭୌତିକ ବିଜ୍ଞାନ',
    'ଜୀବ ବିଜ୍ଞାନ',
    'ଇତିହାସ ଓ ରାଜନୀତି ବିଜ୍ଞାନ',
    'ଭୂଗୋଳ ଓ ଅର୍ଥନୀତି',
  ],
  'class-10': [
    'ସାହିତ୍ୟ ସିନ୍ଧୁ',
    'ମାଧ୍ୟମିକ ବ୍ୟାକରଣ',
    'Skills of Communicative English',
    'Learn & Practice Grammar',
    'Sanskruta Sahitya Manjari',
    'ସଂସ୍କୃତ ବ୍ୟାକରଣ ପ୍ରକାଶ',
    'Hindi Saurav',
    'Madhyamika Hindi Byakaran',
    'ମାଧ୍ୟମିକ ବୀଜଗଣିତ',
    'ମାଧ୍ୟମିକ ଜ୍ୟାମିତି',
    'ଭୌତିକ ବିଜ୍ଞାନ',
    'ଜୀବ ବିଜ୍ଞାନ',
    'ଇତିହାସ ଓ ରାଜନୀତି ବିଜ୍ଞାନ',
    'ଭୂଗୋଳ ଓ ଅର୍ଥନୀତି',
    'ଭୂଗୋଳ ଓ ଅର୍ଥନୀତି (Additional Chapters)',
  ],
}

// =================== SAMPLE LESSONS ===================
const lessonContent = (title, intro, activities, conclusion) => `
<div class="lp-content">
  <h2>📌 ${title}</h2>
  <p><strong>Introduction:</strong> ${intro}</p>
  <h3>🎯 Step-by-Step Teaching Process</h3>
  <ol>${activities.map(a => `<li>${a}</li>`).join('')}</ol>
  <h3>🏆 Conclusion</h3>
  <p>${conclusion}</p>
</div>`

export const SAMPLE_LESSONS = [
  { classSlug: 'balvatika', bookName: 'ଝୁଲଣା', chapter: 'Number Recognition 1 to 5', chapterOrder: 1,
    periods: [
      { period: 1, title: 'Introducing Numbers 1, 2, 3',
        content: lessonContent('Numbers 1, 2, 3', 'Help children recognize and count small quantities using objects in their surroundings.',
          ['Show real objects (pebbles, leaves) one by one and count aloud.','Sing the counting rhyme "One, two, buckle my shoe".','Ask each child to bring 1, then 2, then 3 stones.','Draw numerals 1, 2, 3 on the board with finger tracing.'],
          'Children will be able to identify and count up to 3 objects accurately.'),
        teacherNotes: 'Use loud, slow pronunciation. Repeat counting at least 3 times. Praise each child individually.',
        tlm: ['Pebbles/stones', 'Counting beads', 'Number flashcards 1-3', 'Chart paper with big numerals'],
        learningOutcomes: ['Recognises numbers 1, 2, 3', 'Counts up to 3 objects orally', 'Writes numerals 1, 2, 3 in the air'],
        loCodes: ['BV-M-1.1', 'BV-M-1.2'],
        assessmentQuestions: ['Show 2 fingers. Ask: How many?','Place 3 stones. Ask child to count.','Ask child to show the numeral 1 from flashcards.'] },
      { period: 2, title: 'Numbers 4 and 5 with Play',
        content: lessonContent('Numbers 4 & 5', 'Extend counting from 3 to 5 using games and group activities.',
          ['Recall numbers 1-3 with claps.','Introduce 4 by clapping 4 times together.','Introduce 5 with the song "Five little ducks".','Group activity: make groups of 5 and dance.'],
          'Children will count and form groups of up to 5 objects.'),
        teacherNotes: 'Use songs and movement. Keep periods short (20 minutes).',
        tlm: ['Toy ducks', 'Beads', 'Number cards 4-5'],
        learningOutcomes: ['Counts orally up to 5', 'Forms groups of 4 and 5 objects'],
        loCodes: ['BV-M-1.3'],
        assessmentQuestions: ['Make a group of 4 leaves.','Show 5 on your fingers.'] },
    ]
  },
  { classSlug: 'class-1', bookName: 'ଝୁଲଣା ଶ୍ରେଣୀ ୧', chapter: 'ଅକ୍ଷର ପରିଚୟ (Akshar Parichaya)', chapterOrder: 1,
    periods: [
      { period: 1, title: 'ଅ, ଆ, ଇ, ଈ ସ୍ୱର ବର୍ଣ୍ଣ',
        content: lessonContent('ଅକ୍ଷର ପରିଚୟ - ଅ ଆ ଇ ଈ', 'Introduce children to the first four vowels of the Odia alphabet through sound, sight, and writing.',
          ['ଶିକ୍ଷକ ବର୍ଣ୍ଣ ଚାର୍ଟ ଦେଖାଇବେ ଏବଂ ଉଚ୍ଚାରଣ କରିବେ।','Children repeat the sound of each vowel 3 times.','Show picture-words: ଅ for ଅମ୍ବ (mango), ଆ for ଆମ୍ବ ଗଛ।','Children trace ଅ, ଆ, ଇ, ଈ on slate.'],
          'Children will recognise and write the first 4 Odia vowels.'),
        teacherNotes: "Use mother-tongue based pronunciation. Connect to children's home vocabulary.",
        tlm: ['ବର୍ଣ୍ଣ ଚାର୍ଟ', 'Slate and chalk', 'Picture flashcards'],
        learningOutcomes: ['Identifies vowels ଅ, ଆ, ଇ, ଈ', 'Writes them with proper stroke order', 'Says one word starting with each'],
        loCodes: ['C1-O-1.1', 'C1-O-1.2'],
        assessmentQuestions: ['Point to AA on the chart.','Write I on your slate.','Say one word starting with A.'] },
    ]
  },
  { classSlug: 'class-1', bookName: 'Ganita Khela', chapter: 'Numbers 1 to 10', chapterOrder: 1,
    periods: [
      { period: 1, title: 'Counting 1 to 5 with Objects',
        content: lessonContent('Numbers 1 to 5', 'Teach number sense using concrete objects before symbols.',
          ['Show 1 pencil, ask: How many?','Add objects one by one up to 5, counting aloud.','Children form groups of 1, 2, 3, 4, 5 with bottle caps.','Write numerals 1-5 on board; children trace in notebook.'],
          'Students will count and write numerals 1-5 accurately.'),
        teacherNotes: 'Use the CPA approach: Concrete → Pictorial → Abstract.',
        tlm: ['Bottle caps', 'Counting cards', 'Number line 1-10'],
        learningOutcomes: ['Counts objects up to 5', 'Writes numerals 1 to 5', 'Recognises number names'],
        loCodes: ['C1-M-1.1'],
        assessmentQuestions: ['How many fingers are on one hand?','Write the number that comes after 3.','Make a group of 4 caps.'] },
      { period: 2, title: 'Counting 6 to 10 and Number Names',
        content: lessonContent('Numbers 6 to 10', 'Extend counting to 10 and introduce number names in English and Odia.',
          ['Revise 1-5 quickly.','Introduce 6, 7, 8, 9, 10 with claps and jumps.','Match numeral with number name cards.','Worksheet: circle the correct number of objects.'],
          'Students will count and read numbers up to 10.'),
        teacherNotes: 'Connect to daily life: 10 fingers, 5+5, etc.',
        tlm: ['Number name cards', 'Counters', 'Worksheets'],
        learningOutcomes: ['Counts up to 10', 'Matches numeral to name', 'Identifies before/after numbers'],
        loCodes: ['C1-M-1.2', 'C1-M-1.3'],
        assessmentQuestions: ['Which number comes after 7?','Write the number ten in figures.','Match 8 with eight.'] },
    ]
  },
  { classSlug: 'class-3', bookName: 'Pallavi', chapter: 'My Family', chapterOrder: 1,
    periods: [
      { period: 1, title: 'Family Members & Vocabulary',
        content: lessonContent('My Family', 'Build vocabulary around family relationships with pictures and conversation.',
          ['Show family tree picture; introduce: father, mother, brother, sister, grandfather, grandmother.','Children repeat words 3 times each.','Pair work: ask "Who is this?" using flashcards.','Children draw their own family in notebook.'],
          'Students will identify and name family members in English.'),
        teacherNotes: 'Be sensitive to different family structures. Use inclusive language.',
        tlm: ['Family tree chart', 'Picture flashcards', 'Drawing notebook'],
        learningOutcomes: ['Names 6+ family members in English', 'Uses "This is my ___" sentence', 'Draws family members'],
        loCodes: ['C3-E-1.1', 'C3-E-1.2'],
        assessmentQuestions: ["Who is your mother's mother?",'Make a sentence with the word "sister".','Draw your father.'] },
    ]
  },
  { classSlug: 'class-5', bookName: 'ଗଣିତ ମେଳା', chapter: 'Large Numbers', chapterOrder: 1,
    periods: [
      { period: 1, title: 'Numbers up to 1,00,000',
        content: lessonContent('Large Numbers up to One Lakh', 'Introduce place value of 5- and 6-digit numbers using the Indian numbering system.',
          ['Revise 4-digit numbers and place value.','Build a place value chart: TTh, Th, H, T, O.','Read numbers like 45,678; 1,00,000 aloud.','Practice writing number names: forty-five thousand six hundred seventy-eight.'],
          'Students will read, write, and identify place value of 5 and 6 digit numbers.'),
        teacherNotes: 'Use Indian comma placement (1,00,000 not 100,000).',
        tlm: ['Place value chart', 'Number cards', 'Abacus'],
        learningOutcomes: ['Reads and writes 5-digit numbers', 'Identifies place value', 'Compares two large numbers'],
        loCodes: ['C5-M-1.1', 'C5-M-1.2'],
        assessmentQuestions: ['Write 36,452 in words.','What is the place value of 5 in 65,234?','Compare: 23,456 ___ 23,654 (>, <, =).'] },
      { period: 2, title: 'Indian and International Number System',
        content: lessonContent('Indian vs International System', 'Compare Indian and International place value systems.',
          ['Show two place value charts side by side.','Examples: 1,00,000 (one lakh) = 100,000 (one hundred thousand).','Convert several examples.','Group work: convert 10 numbers each way.'],
          'Students will convert numbers between the two systems.'),
        teacherNotes: 'Reinforce that the value of digits does not change, only the grouping.',
        tlm: ['Comparison charts', 'Worksheets'],
        learningOutcomes: ['Converts between Indian and International formats', 'Reads numbers in both systems'],
        loCodes: ['C5-M-1.3'],
        assessmentQuestions: ['Write 2,34,567 in international format.','Read 850,000 in Indian system.'] },
    ]
  },
  { classSlug: 'class-8', bookName: 'ବିଜ୍ଞାନ', chapter: 'Crop Production and Management', chapterOrder: 1,
    periods: [
      { period: 1, title: 'Agricultural Practices - Introduction',
        content: lessonContent('Crop Production - Introduction', 'Explore the basic steps farmers follow from seed to harvest.',
          ['Discuss: where does our rice come from?','Introduce 7 basic agricultural practices: preparation of soil, sowing, manuring, irrigation, weeding, harvesting, storage.','Show pictures/video clips for each practice.','Group activity: arrange the 7 steps in correct order.'],
          'Students will name and sequence the 7 main agricultural practices.'),
        teacherNotes: "Link to Odisha's farming context - paddy is dominant. Invite stories from rural students.",
        tlm: ['Pictures of farming tools', 'Video clip', 'Sequencing cards'],
        learningOutcomes: ['Lists 7 agricultural practices', 'Sequences them correctly', 'Defines kharif and rabi crops'],
        loCodes: ['C8-S-1.1', 'C8-S-1.2'],
        assessmentQuestions: ['What is the first step in crop production?','Name 2 kharif crops grown in Odisha.','Why is weeding important?'] },
    ]
  },
  { classSlug: 'class-10', bookName: 'ଭୂଗୋଳ ଓ ଅର୍ଥନୀତି', chapter: 'Resources and Development', chapterOrder: 1,
    periods: [
      { period: 1, title: 'Types of Resources',
        content: lessonContent('Resources and Development - Classification', 'Classify resources on the basis of origin, exhaustibility, ownership and status of development.',
          ['Brainstorm: What is a resource? Give 5 examples from your village.','Introduce classification: biotic/abiotic, renewable/non-renewable, individual/community/national/international, potential/developed/stock/reserve.','Group work: place 10 resource cards into correct categories.',"Discuss India's major resources with a wall map."],
          'Students will classify resources on four different bases.'),
        teacherNotes: 'Use Odisha examples: bauxite, iron ore, paddy, marine fish.',
        tlm: ['Resource cards', 'India physical map', 'Chart paper'],
        learningOutcomes: ['Classifies resources on 4 bases', 'Gives 3 examples for each type', 'Relates to local resources'],
        loCodes: ['C10-SS-1.1', 'C10-SS-1.2'],
        assessmentQuestions: ['Define renewable resource with example.','Classify coal as renewable/non-renewable.','Give 2 examples of community resources.'] },
    ]
  },
]

// =================== SEED ===================
// IMPORTANT: This seed is NON-DESTRUCTIVE. It NEVER deletes existing content.
// Starter sample content is only inserted on a brand-new, EMPTY database.
// On any database that already has content (e.g. production), it does nothing
// except the idempotent admin/settings seed — real lessons/Panchapadi are preserved.
export async function seedDatabase(db) {
  // Always run admin + settings seed (idempotent) — separate from content seed
  await seedAdminAndSettings(db)

  // If we've already marked content as seeded, stop (idempotent fast path).
  const meta = await db.collection('meta').findOne({ key: 'seeded_v4' })
  if (meta) return

  // Safety guard: if ANY content already exists, DO NOT touch it. Just mark
  // the DB as seeded so this block never runs again, and return. This protects
  // existing production data (lessons, Panchapadi, books, etc.).
  const existingClasses = await db.collection('classes').countDocuments()
  const existingLessons = await db.collection('lessons').countDocuments()
  if (existingClasses > 0 || existingLessons > 0) {
    await db.collection('meta').updateOne(
      { key: 'seeded_v4' },
      { $set: { key: 'seeded_v4', at: new Date(), note: 'existing content detected — preserved, not re-seeded' } },
      { upsert: true }
    )
    return
  }

  // ---- Fresh / empty database only: seed starter content (no deletes needed) ----
  // Indexes
  await db.collection('users').createIndex({ mobile: 1 }, { unique: true }).catch(() => {})
  await db.collection('books').createIndex({ classId: 1, order: 1 }).catch(() => {})
  await db.collection('chapters').createIndex({ classId: 1, bookId: 1, order: 1 }).catch(() => {})
  await db.collection('lessons').createIndex({ classId: 1, bookId: 1, chapterId: 1, period: 1 }).catch(() => {})

  // Insert classes
  const classDocs = CLASSES.map(c => ({ id: uuidv4(), ...c }))
  await db.collection('classes').insertMany(classDocs)

  // Insert books per class
  const bookDocs = []
  for (const cls of classDocs) {
    const list = BOOKS_BY_CLASS[cls.slug] || []
    list.forEach((name, idx) => {
      bookDocs.push({
        id: uuidv4(),
        classId: cls.id,
        name,
        order: idx + 1,
        emoji: BOOK_EMOJIS[idx % BOOK_EMOJIS.length],
        color: BOOK_COLORS[idx % BOOK_COLORS.length],
      })
    })
  }
  if (bookDocs.length) await db.collection('books').insertMany(bookDocs)

  // Sample chapters & lessons
  for (const lp of SAMPLE_LESSONS) {
    const cls = classDocs.find(c => c.slug === lp.classSlug)
    if (!cls) continue
    const book = bookDocs.find(b => b.classId === cls.id && b.name === lp.bookName)
    if (!book) continue
    const chapterId = uuidv4()
    await db.collection('chapters').insertOne({
      id: chapterId, classId: cls.id, bookId: book.id,
      name: lp.chapter, order: lp.chapterOrder, totalPeriods: lp.periods.length,
    })
    for (const p of lp.periods) {
      await db.collection('lessons').insertOne({
        id: uuidv4(), classId: cls.id, bookId: book.id, chapterId,
        period: p.period, title: p.title, content: p.content,
        teacherNotes: p.teacherNotes, tlm: p.tlm,
        learningOutcomes: p.learningOutcomes, loCodes: p.loCodes,
        assessmentQuestions: p.assessmentQuestions,
        panchapadiSopana: p.panchapadiSopana || '',
        activities: p.activities || [],
        worksheet: p.worksheet || '',
        homework: p.homework || '',
        createdAt: new Date(), updatedAt: new Date(),
      })
    }
  }

  // Admin users and settings are seeded by seedAdminAndSettings() at start (idempotent)
  await db.collection('meta').updateOne(
    { key: 'seeded_v4' },
    { $set: { key: 'seeded_v4', at: new Date() } },
    { upsert: true }
  )
}

// Idempotent — safe to call on every request. Adds admin users and default settings.
export async function seedAdminAndSettings(db) {
  await seedSecurityImages(db)
  // Primary admin (user-configured)
  const primaryAdmin = await db.collection('users').findOne({ mobile: '9692604577' })
  if (!primaryAdmin) {
    const primaryPass = await bcrypt.hash('Subrat@909e', 10)
    await db.collection('users').insertOne({
      id: uuidv4(),
      name: 'Admin',
      mobile: '9692604577',
      password: primaryPass,
      role: 'admin',
      subscription: { plan: 'lifetime', startDate: new Date(), expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 99), status: 'active' },
      mustChangePassword: false,
      createdAt: new Date(),
    })
  }
  // NOTE: The legacy demo admin (mobile 9999999999 / password admin123) was
  // intentionally REMOVED (2026-06). It is no longer auto-seeded. The only
  // seeded admin is the primary user-configured account above.
  // Default plan settings (admin can edit later)
  // Use schema version so we can push plan structure updates without overwriting admin's customizations.
  const PLANS_SCHEMA_VERSION = 'v5_special199_yearly_2026_07'
  const planSettings = await db.collection('settings').findOne({ key: 'plans' })
  if (!planSettings) {
    await db.collection('settings').insertOne({ key: 'plans', value: PLANS, version: PLANS_SCHEMA_VERSION, updatedAt: new Date() })
  } else if (planSettings.version !== PLANS_SCHEMA_VERSION && !planSettings.customized) {
    // Auto-migrate to new structure if admin hasn't manually customized
    await db.collection('settings').updateOne(
      { key: 'plans' },
      { $set: { value: PLANS, version: PLANS_SCHEMA_VERSION, updatedAt: new Date() } }
    )
  }
}

// =================== SECURITY IMAGES (Password Recovery) ===================
export const SECURITY_IMAGE_LIBRARY = [
  { label: 'Lion',      emoji: '🦁', gradient: 'from-orange-400 to-red-500' },
  { label: 'Tree',      emoji: '🌳', gradient: 'from-green-400 to-emerald-600' },
  { label: 'Bicycle',   emoji: '🚲', gradient: 'from-blue-400 to-indigo-600' },
  { label: 'Sunflower', emoji: '🌻', gradient: 'from-yellow-400 to-amber-500' },
  { label: 'Football',  emoji: '⚽', gradient: 'from-slate-500 to-slate-800' },
  { label: 'Elephant',  emoji: '🐘', gradient: 'from-pink-400 to-fuchsia-600' },
  { label: 'Peacock',   emoji: '🦚', gradient: 'from-teal-400 to-cyan-600' },
  { label: 'Book',      emoji: '📚', gradient: 'from-violet-400 to-purple-600' },
  { label: 'Star',      emoji: '⭐', gradient: 'from-amber-400 to-orange-500' },
  // Extended library (added June 2026)
  { label: 'Flower',    emoji: '🌸', gradient: 'from-pink-300 to-rose-500' },
  { label: 'House',     emoji: '🏠', gradient: 'from-amber-500 to-orange-700' },
  { label: 'Moon',      emoji: '🌙', gradient: 'from-slate-600 to-indigo-800' },
  { label: 'Sun',       emoji: '☀️', gradient: 'from-yellow-300 to-orange-500' },
  { label: 'Pencil',    emoji: '✏️', gradient: 'from-yellow-500 to-amber-700' },
  { label: 'Apple',     emoji: '🍎', gradient: 'from-red-400 to-rose-600' },
  { label: 'Cake',      emoji: '🎂', gradient: 'from-pink-400 to-red-500' },
  { label: 'Gift',      emoji: '🎁', gradient: 'from-fuchsia-500 to-pink-600' },
  { label: 'Balloon',   emoji: '🎈', gradient: 'from-rose-400 to-red-500' },
  { label: 'Car',       emoji: '🚗', gradient: 'from-red-500 to-orange-600' },
  { label: 'Airplane',  emoji: '✈️', gradient: 'from-sky-400 to-blue-600' },
  { label: 'Fish',      emoji: '🐟', gradient: 'from-cyan-400 to-blue-600' },
]

export async function seedSecurityImages(db) {
  // Idempotent — only add images whose label isn't already present.
  const existing = await db.collection('security_images').find({}).project({ label: 1, order: 1 }).toArray()
  const existingLabels = new Set(existing.map(x => x.label))
  const maxOrder = existing.reduce((m, x) => Math.max(m, x.order || 0), 0)
  const toAdd = SECURITY_IMAGE_LIBRARY.filter(it => !existingLabels.has(it.label))
  if (toAdd.length === 0) return
  const docs = toAdd.map((it, i) => ({
    id: uuidv4(),
    label: it.label,
    emoji: it.emoji,
    gradient: it.gradient,
    url: null,
    active: true,
    order: maxOrder + i + 1,
    createdAt: new Date(),
  }))
  await db.collection('security_images').insertMany(docs)
}


export const PLANS = [
  {
    id: 'free', name: 'Free', price: 0, originalPrice: 0, days: 0,
    badge: 'Free Forever', emoji: '🆓', popular: false, enabled: true,
    tagline: 'Browse & explore',
    headline: 'Start exploring for free',
    features: [
      'Limited Lesson Preview',
      'Browse full Curriculum',
      'View Sample Lessons',
      'Access Public Pages',
      'No Premium Content',
    ],
  },
  {
    id: 'special199', name: '🎁 Special Offer', price: 199, originalPrice: 1188, days: 365,
    badge: '🎁 LIMITED TIME · ₹199/year', emoji: '🎁', popular: true, enabled: true,
    tagline: 'Full Year Premium @ Just ₹199!',
    headline: 'Special Campaign Offer — 1 Year Access',
    savingsText: 'Save ₹989 vs Yearly · Save ₹989 vs 12 × Monthly',
    features: [
      '🎁 Special Offer — ₹199 for 12 Months',
      '✅ Full Premium Lesson Access',
      '✅ Balvatika to Class 10',
      '✅ All Books · Chapters · Periods',
      '✅ Learning Outcomes + Panchapadi + 5E',
      '✅ Worksheets · Question Banks · Assessments',
      '✅ Premium Support · Priority Delivery',
      '✅ All Future Updates Included',
    ],
  },
  {
    id: 'monthly', name: 'Monthly', price: 99, originalPrice: 99, days: 30,
    badge: 'Starter Plan', emoji: '🌱', popular: false, enabled: true,
    tagline: 'Start Teaching Smarter',
    headline: 'Perfect for getting started',
    features: [
      '✅ Full Premium Lesson Access',
      '✅ Balvatika to Class 10',
      '✅ All Books Access',
      '✅ All Chapters Access',
      '✅ All Period Lesson Plans',
      '✅ Learning Outcomes',
      '✅ Panchapadi Lesson Plans',
      '✅ Worksheets & Question Banks',
      '✅ Assessment Resources',
      '✅ Premium Support',
    ],
  },
  {
    id: 'quarterly', name: 'Quarterly', price: 249, originalPrice: 297, days: 90,
    badge: 'Best Value', emoji: '🌿', popular: false, enabled: true,
    tagline: 'Best Value for Active Teachers',
    headline: 'Save ₹48 compared to Monthly',
    savingsText: 'Save ₹48 compared to Monthly',
    features: [
      'Everything in Monthly Plan',
      '✅ 90 Days Access',
      '✅ Priority Support',
      '✅ Early Access to New Content',
    ],
  },
  {
    id: 'semi_annual', name: 'Semi-Annual', price: 99, originalPrice: 594, days: 180,
    badge: '🎉 SPECIAL OFFER', emoji: '🌸', popular: false, enabled: true,
    tagline: '6 Months at Just ₹99!',
    headline: '6 Months Premium Access — Limited Time',
    savingsText: 'Save ₹495 vs 6 × Monthly',
    features: [
      'Everything in Quarterly Plan',
      '✅ 180 Days (6 Months) Access',
      '✅ Priority Teacher Support',
      '✅ All Future Updates Included',
      '✅ Ideal for Half-Year Planning',
    ],
  },
  {
    id: 'yearly', name: 'Yearly', price: 499, originalPrice: 1188, days: 365,
    badge: '⭐ MOST POPULAR', emoji: '🌳', popular: true, enabled: true,
    tagline: 'Most Popular Choice Among Teachers',
    headline: 'Save ₹689 compared to Monthly',
    savingsText: 'Save ₹689 compared to Monthly',
    features: [
      'Everything in Quarterly Plan',
      '✅ Full Year Access',
      '✅ All Future Updates',
      '✅ Premium Teacher Resources',
      '✅ New Lesson Plans Added Regularly',
      '✅ Highest Value for Teachers',
    ],
  },
  {
    id: 'lifetime', name: 'Lifetime', price: 2499, originalPrice: 4999, days: 365 * 99,
    badge: '🔥 LIFETIME ACCESS', emoji: '👑', popular: false, enabled: true,
    tagline: 'One Payment. Lifetime Teaching Resources.',
    headline: 'Pay Once, Access Forever',
    savingsText: 'Save ₹2500 — Limited Time Offer',
    features: [
      'Everything in Yearly Plan',
      '✅ Lifetime Access',
      '✅ All Future Updates',
      '✅ Priority Customer Support',
      '✅ Lifetime Premium Membership',
      '✅ One-Time Payment',
      '✅ No Renewal Required',
    ],
  },
]
