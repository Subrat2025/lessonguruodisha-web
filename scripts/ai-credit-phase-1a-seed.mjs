// AI Credit — Phase 1A Seed Script
//
// Idempotent seeder that:
//   1. Creates 6 new MongoDB collections (aiCreditWallet, aiCreditTransactions,
//      aiGeneratedResources, aiCreditPlans, aiGenerationCosts, aiGeminiCalls).
//   2. Creates required indexes.
//   3. Upserts 5 AI Credit Plans (Starter / Teacher / Smart / Power / Ultimate).
//   4. Upserts 21 default generation costs across Engagement / Worksheet / Assessment.
//
// Run:
//   node /app/scripts/ai-credit-phase-1a-seed.mjs
//
// Safe to re-run — every insert is an upsert by stable _id.

import { MongoClient } from 'mongodb'
import fs from 'fs'
import path from 'path'

// Load /app/.env manually so we do not require the `dotenv` package.
try {
  const envPath = path.resolve('/app/.env')
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
} catch { /* ignore \u2014 rely on inherited env */ }

const MONGO_URL = process.env.MONGO_URL
const DB_NAME = process.env.DB_NAME

if (!MONGO_URL || !DB_NAME) {
  console.error('❌ MONGO_URL or DB_NAME missing from env')
  process.exit(1)
}

const COLLECTIONS = [
  'aiCreditWallet',
  'aiCreditTransactions',
  'aiGeneratedResources',
  'aiCreditPlans',
  'aiGenerationCosts',
  'aiGeminiCalls',
]

const PLANS = [
  { _id: 'plan_starter_100',  code: 'starter',  name: 'Starter Pack',   priceINR: 49,  credits: 100,  bestValue: false, badge: null,                  sortOrder: 1, active: true, productType: 'ai_credits' },
  { _id: 'plan_teacher_300',  code: 'teacher',  name: 'Teacher Pack',   priceINR: 99,  credits: 300,  bestValue: false, badge: null,                  sortOrder: 2, active: true, productType: 'ai_credits' },
  { _id: 'plan_smart_750',    code: 'smart',    name: 'Smart Choice',   priceINR: 199, credits: 750,  bestValue: true,  badge: '⭐ BEST VALUE',       sortOrder: 3, active: true, productType: 'ai_credits' },
  { _id: 'plan_power_2000',   code: 'power',    name: 'Power Pack',     priceINR: 399, credits: 2000, bestValue: false, badge: null,                  sortOrder: 4, active: true, productType: 'ai_credits' },
  { _id: 'plan_ultimate_5000',code: 'ultimate', name: 'Ultimate Pack',  priceINR: 799, credits: 5000, bestValue: false, badge: null,                  sortOrder: 5, active: true, productType: 'ai_credits' },
]

// zone: engagement | worksheet | assessment | bulk
// type: machine-readable stable slug (used inside fingerprint & routes later)
const COSTS = [
  // Student Engagement Zone
  { _id: 'cost_engagement_topic_check',      zone: 'engagement', type: 'topic_check',       label: 'Topic Check',              credits: 3,  active: true },
  { _id: 'cost_engagement_more_examples',    zone: 'engagement', type: 'more_examples',     label: 'More Examples',            credits: 4,  active: true },
  { _id: 'cost_engagement_more_questions',   zone: 'engagement', type: 'more_questions',    label: 'More Questions',           credits: 5,  active: true },
  { _id: 'cost_engagement_project_work',     zone: 'engagement', type: 'project_work',      label: 'Project Work',             credits: 6,  active: true },
  { _id: 'cost_engagement_practice_set',     zone: 'engagement', type: 'practice_set',      label: 'Practice Set',             credits: 5,  active: true },
  { _id: 'cost_engagement_hots',             zone: 'engagement', type: 'hots',              label: 'HOTS',                     credits: 6,  active: true },
  { _id: 'cost_engagement_homework',         zone: 'engagement', type: 'homework',          label: 'Homework',                 credits: 5,  active: true },
  { _id: 'cost_engagement_activity',         zone: 'engagement', type: 'activity',          label: 'Activity',                 credits: 5,  active: true },
  { _id: 'cost_engagement_competency',       zone: 'engagement', type: 'competency',        label: 'Competency',               credits: 6,  active: true },
  { _id: 'cost_engagement_skill',            zone: 'engagement', type: 'skill',             label: 'Skill',                    credits: 5,  active: true },
  { _id: 'cost_engagement_revision',         zone: 'engagement', type: 'revision',          label: 'Revision',                 credits: 5,  active: true },
  { _id: 'cost_engagement_remedial',         zone: 'engagement', type: 'remedial',          label: 'Remedial',                 credits: 5,  active: true },
  { _id: 'cost_engagement_exam',             zone: 'engagement', type: 'exam',              label: 'Exam',                     credits: 7,  active: true },
  // Custom Worksheet
  { _id: 'cost_worksheet_custom',            zone: 'worksheet',  type: 'custom_worksheet',  label: 'Custom Worksheet',         credits: 6,  active: true },
  { _id: 'cost_worksheet_assessment',        zone: 'worksheet',  type: 'assessment_worksheet', label: 'Assessment Worksheet',  credits: 8,  active: true },
  // Assessment Section
  { _id: 'cost_assessment_fa',               zone: 'assessment', type: 'fa_assessment',     label: 'FA Assessment',            credits: 8,  active: true },
  { _id: 'cost_assessment_sa',               zone: 'assessment', type: 'sa_assessment',     label: 'SA Assessment',            credits: 8,  active: true },
  { _id: 'cost_assessment_observation',      zone: 'assessment', type: 'observation',       label: 'Observation',              credits: 6,  active: true },
  { _id: 'cost_assessment_paper',            zone: 'assessment', type: 'assessment_paper',  label: 'Assessment Paper',         credits: 10, active: true },
  // Bulk convenience buttons
  { _id: 'cost_bulk_engagement_all',         zone: 'bulk',       type: 'engagement_all',    label: 'Generate All (Engagement)',credits: 20, active: true },
  { _id: 'cost_bulk_worksheet_assessment_all', zone: 'bulk',     type: 'worksheet_assessment_all', label: 'Generate All (Worksheet/Assessment)', credits: 25, active: true },
]

async function main() {
  const client = await MongoClient.connect(MONGO_URL, { maxPoolSize: 5 })
  const db = client.db(DB_NAME)
  const report = { collections: [], indexes: [], plans: 0, costs: 0, warnings: [] }

  // 1) Ensure collections exist
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name))
  for (const c of COLLECTIONS) {
    if (!existing.has(c)) {
      await db.createCollection(c)
      report.collections.push({ name: c, created: true })
    } else {
      report.collections.push({ name: c, created: false, existed: true })
    }
  }

  // 2) Indexes
  const idx = async (coll, spec, opts = {}) => {
    const name = await db.collection(coll).createIndex(spec, opts)
    report.indexes.push({ coll, spec, name, opts })
  }

  // aiCreditWallet
  await idx('aiCreditWallet', { userId: 1 }, { unique: true, name: 'ux_wallet_userId' })
  // aiCreditTransactions
  await idx('aiCreditTransactions', { userId: 1, createdAt: -1 }, { name: 'ix_txn_user_time' })
  await idx('aiCreditTransactions', { type: 1, createdAt: -1 }, { name: 'ix_txn_type_time' })
  await idx('aiCreditTransactions', { razorpayPaymentId: 1 }, { name: 'ix_txn_rzp_payment', sparse: true })
  await idx('aiCreditTransactions', { fingerprint: 1 }, { name: 'ix_txn_fingerprint', sparse: true })
  // aiGeneratedResources — fingerprint is the cache key
  await idx('aiGeneratedResources', { fingerprint: 1 }, { unique: true, name: 'ux_resource_fingerprint' })
  await idx('aiGeneratedResources', { zone: 1, generationType: 1, createdAt: -1 }, { name: 'ix_resource_zone_type' })
  await idx('aiGeneratedResources', { createdAt: -1 }, { name: 'ix_resource_time' })
  // aiCreditPlans
  await idx('aiCreditPlans', { active: 1, sortOrder: 1 }, { name: 'ix_plans_active_sort' })
  await idx('aiCreditPlans', { code: 1 }, { unique: true, name: 'ux_plans_code' })
  // aiGenerationCosts
  await idx('aiGenerationCosts', { zone: 1, type: 1 }, { unique: true, name: 'ux_costs_zone_type' })
  await idx('aiGenerationCosts', { active: 1 }, { name: 'ix_costs_active' })
  // aiGeminiCalls
  await idx('aiGeminiCalls', { userId: 1, startedAt: -1 }, { name: 'ix_calls_user_time' })
  await idx('aiGeminiCalls', { status: 1, startedAt: -1 }, { name: 'ix_calls_status_time' })
  await idx('aiGeminiCalls', { zone: 1, generationType: 1, startedAt: -1 }, { name: 'ix_calls_zone_type' })
  await idx('aiGeminiCalls', { fingerprint: 1 }, { name: 'ix_calls_fingerprint', sparse: true })

  // 3) Seed plans (upsert)
  for (const p of PLANS) {
    const now = new Date()
    const { _id, ...rest } = p
    await db.collection('aiCreditPlans').updateOne(
      { _id },
      {
        $set: { ...rest, updatedAt: now },
        $setOnInsert: { createdAt: now, seededAt: now },
      },
      { upsert: true }
    )
    report.plans++
  }

  // 4) Seed costs (upsert)
  for (const c of COSTS) {
    const now = new Date()
    const { _id, ...rest } = c
    await db.collection('aiGenerationCosts').updateOne(
      { _id },
      {
        $set: { ...rest, updatedAt: now },
        $setOnInsert: { createdAt: now, seededAt: now, editable: true, minCredits: 1 },
      },
      { upsert: true }
    )
    report.costs++
  }

  // 5) Print summary
  console.log(JSON.stringify(report, null, 2))

  // 6) Verification counts
  const counts = {}
  for (const c of COLLECTIONS) counts[c] = await db.collection(c).countDocuments({})
  console.log('COUNTS:', counts)

  await client.close()
}

main().catch((e) => {
  console.error('❌ Seed failed:', e)
  process.exit(1)
})
