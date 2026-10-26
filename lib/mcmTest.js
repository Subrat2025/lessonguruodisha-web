// ============================================================
//  MCM Knowledge Test — server-side helpers
// ------------------------------------------------------------
//  Tests live in Mongo (collection `mcmTests`). The initial 3
//  months (July/Aug/Sep 2026) are seeded once from the
//  Webpack-inlined JSON below (admin edits are preserved — we
//  only $setOnInsert). Scoring, pass/fail and certificate
//  eligibility are ALWAYS computed here on the server; correct
//  answers are never sent to the client before submission.
// ============================================================
import seed from './mcm/mcmTestSeed.json'
import { randomUUID } from 'crypto'

export const MCM_TEST_SEED = seed.tests || []

// Insert seed tests once (idempotent by `key`). Never overwrites admin edits.
export async function ensureMcmTestsSeeded(d) {
  try {
    const col = d.collection('mcmTests')
    for (const t of MCM_TEST_SEED) {
      const now = new Date()
      await col.updateOne(
        { key: t.key },
        {
          $setOnInsert: {
            id: randomUUID(),
            key: t.key,
            monthLabel: t.monthLabel,
            monthEn: t.monthEn,
            monthShort: t.monthShort,
            order: t.order,
            title: t.title,
            instructions: t.instructions,
            durationMinutes: t.durationMinutes,
            passingPercentage: t.passingPercentage,
            marksPerQuestion: t.marksPerQuestion,
            certificateTitle: t.certificateTitle,
            questions: t.questions,
            published: !!t.published,
            archived: false,
            createdAt: now,
            updatedAt: now,
            seeded: true,
          },
        },
        { upsert: true },
      )
    }
  } catch (e) { /* ignore seeding errors */ }
}

const totalMarksOf = (test) =>
  (test.questions || []).reduce((s, q) => s + (Number(q.marks) || 1), 0)

// Strip correct answers/explanations for the test-taking client.
export function sanitizeTestForUser(test) {
  if (!test) return null
  return {
    id: test.id,
    key: test.key,
    monthLabel: test.monthLabel,
    monthEn: test.monthEn,
    monthShort: test.monthShort,
    title: test.title,
    instructions: test.instructions,
    durationMinutes: Number(test.durationMinutes) || 0,
    passingPercentage: Number(test.passingPercentage) || 60,
    certificateTitle: test.certificateTitle || 'MCM Knowledge Test',
    questionCount: (test.questions || []).length,
    totalMarks: totalMarksOf(test),
    questions: (test.questions || []).map(q => ({
      id: q.id,
      q: q.q,
      options: q.options,
      marks: Number(q.marks) || 1,
    })),
  }
}

// Score an attempt server-side. `answers` = { [questionId]: selectedIndex }.
export function scoreAttempt(test, answers) {
  const qs = test.questions || []
  const total = qs.length
  const totalMarks = totalMarksOf(test)
  let correctCount = 0
  let marksObtained = 0
  const review = qs.map(q => {
    const sel = answers && Object.prototype.hasOwnProperty.call(answers, q.id) ? Number(answers[q.id]) : null
    const isCorrect = sel !== null && sel === Number(q.correctIndex)
    if (isCorrect) { correctCount++; marksObtained += (Number(q.marks) || 1) }
    return {
      id: q.id, q: q.q, options: q.options,
      correctIndex: Number(q.correctIndex),
      selectedIndex: sel,
      isCorrect,
      explanation: q.explanation || '',
      marks: Number(q.marks) || 1,
    }
  })
  const wrongCount = total - correctCount
  const percentage = totalMarks > 0 ? Math.round((marksObtained / totalMarks) * 100) : 0
  const passed = percentage >= (Number(test.passingPercentage) || 60)
  return { total, correctCount, wrongCount, marksObtained, totalMarks, percentage, passed, review }
}

// Unique, human-friendly certificate id, e.g. LG-MCM-AUG-7F3K9Q
export function makeCertificateId(test) {
  const mon = (test.monthShort || 'MCM').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
  const rnd = randomUUID().replace(/-/g, '').toUpperCase().slice(0, 6)
  return `LG-MCM-${mon}-${rnd}`
}
