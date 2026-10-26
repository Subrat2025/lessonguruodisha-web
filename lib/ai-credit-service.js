// AI Credit — Wallet + Resource Service (INERT until Phase 1B wires routes)
//
// Responsibilities:
//   - Wallet: get/create, get balance, debit, credit, refund, transactions.
//   - Costs:  read admin-configurable per-generation credit costs.
//   - Resources: cache-first store & fetch of AI-generated content.
//   - Guardrails: minimum-1-credit cost, insufficient-credit rejection,
//                 explicit refund helper for failed Gemini generations.
//
// This module MUST remain the single source of truth for wallet mutations.
// Never mutate `aiCreditWallet` from anywhere else — always debit/credit/refund
// through these helpers so that a matching `aiCreditTransactions` row is
// always written.

import { v4 as uuidv4 } from 'uuid'
import { getDb } from './mongodb.js'

export const COLL = Object.freeze({
  wallet: 'aiCreditWallet',
  txns: 'aiCreditTransactions',
  resources: 'aiGeneratedResources',
  plans: 'aiCreditPlans',
  costs: 'aiGenerationCosts',
  calls: 'aiGeminiCalls',
})

export const MIN_GENERATION_COST = 1 // hard safeguard — admin cannot drop below this

// ------------------------- Wallet -------------------------

export async function getOrCreateWallet(userId) {
  if (!userId) throw new Error('userId is required')
  const db = await getDb()
  const wallets = db.collection(COLL.wallet)
  let w = await wallets.findOne({ userId })
  if (!w) {
    const now = new Date()
    w = {
      _id: uuidv4(),
      userId,
      balance: 0,
      lifetimePurchased: 0,
      lifetimeSpent: 0,
      lifetimeRefunded: 0,
      createdAt: now,
      updatedAt: now,
    }
    try {
      await wallets.insertOne(w)
    } catch (e) {
      // Race: another concurrent insert — re-read.
      w = await wallets.findOne({ userId })
    }
  }
  return w
}

export async function getBalance(userId) {
  const w = await getOrCreateWallet(userId)
  return Number(w?.balance || 0)
}

export async function ensureCanAfford(userId, cost) {
  const balance = await getBalance(userId)
  const need = Math.max(MIN_GENERATION_COST, Number(cost || 0))
  if (balance < need) {
    const err = new Error(`Insufficient credits. Required: ${need}, Available: ${balance}`)
    err.code = 'INSUFFICIENT_CREDITS'
    err.required = need
    err.balance = balance
    throw err
  }
  return balance
}

// ------------------------- Costs (admin-configurable) -------------------------

export async function getGenerationCost(zone, type) {
  if (!zone || !type) throw new Error('zone + type required')
  const db = await getDb()
  await _ensureCostsSeeded(db)
  const doc = await db.collection(COLL.costs).findOne({ zone, type, active: true })
  if (!doc) return null
  return Math.max(MIN_GENERATION_COST, Number(doc.credits || MIN_GENERATION_COST))
}

export async function listGenerationCosts() {
  const db = await getDb()
  await _ensureCostsSeeded(db)
  return db.collection(COLL.costs).find({}).sort({ zone: 1, type: 1 }).toArray()
}

// ------------------------- Transactions -------------------------

async function writeTxn(db, doc) {
  const row = { _id: uuidv4(), createdAt: new Date(), ...doc }
  await db.collection(COLL.txns).insertOne(row)
  return row
}

/**
 * Atomically debit `cost` credits. Refuses if balance is insufficient.
 * Records a matching debit txn. `cacheHit` distinguishes cached-serve vs fresh Gemini.
 */
export async function debitCredits({ userId, cost, zone, type, resourceId = null, fingerprint = null, cacheHit = false, meta = {} }) {
  if (!userId) throw new Error('userId required')
  const need = Math.max(MIN_GENERATION_COST, Number(cost || 0))
  const db = await getDb()
  await getOrCreateWallet(userId)
  const result = await db.collection(COLL.wallet).findOneAndUpdate(
    { userId, balance: { $gte: need } },
    { $inc: { balance: -need, lifetimeSpent: need }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  const w = result?.value || result
  if (!w) {
    const bal = await getBalance(userId)
    const err = new Error(`Insufficient credits. Required: ${need}, Available: ${bal}`)
    err.code = 'INSUFFICIENT_CREDITS'
    err.required = need
    err.balance = bal
    throw err
  }
  const txn = await writeTxn(db, {
    userId,
    type: 'debit',
    zone: zone || null,
    generationType: type || null,
    credits: -need,
    balanceAfter: w.balance,
    resourceId,
    fingerprint,
    cacheHit: !!cacheHit,
    meta,
  })
  return { ok: true, txnId: txn._id, newBalance: w.balance, cacheHit: !!cacheHit, debited: need }
}

/**
 * Credit credits to a wallet — used for Razorpay `ai_credits` purchases,
 * admin bonuses, referrals, etc. Records a matching credit txn.
 */
export async function creditCredits({ userId, credits, reason = 'purchase', razorpayOrderId = null, razorpayPaymentId = null, planId = null, meta = {} }) {
  if (!userId) throw new Error('userId required')
  const amt = Math.max(1, Number(credits || 0))
  const db = await getDb()
  await getOrCreateWallet(userId)
  const result = await db.collection(COLL.wallet).findOneAndUpdate(
    { userId },
    { $inc: { balance: amt, lifetimePurchased: amt }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  const w = result?.value || result
  const txn = await writeTxn(db, {
    userId,
    type: 'credit',
    credits: amt,
    balanceAfter: w?.balance || 0,
    reason,
    planId,
    razorpayOrderId,
    razorpayPaymentId,
    meta,
  })
  return { ok: true, txnId: txn._id, newBalance: w?.balance || 0, credited: amt }
}

/**
 * Refund credits after a failed generation. Marks lifetimeSpent DOWN and
 * lifetimeRefunded UP so accounting stays true.
 */
export async function refundCredits({ userId, credits, reason = 'generation_failed', relatedTxnId = null, meta = {} }) {
  if (!userId) throw new Error('userId required')
  const amt = Math.max(1, Number(credits || 0))
  const db = await getDb()
  await getOrCreateWallet(userId)
  const result = await db.collection(COLL.wallet).findOneAndUpdate(
    { userId },
    { $inc: { balance: amt, lifetimeSpent: -amt, lifetimeRefunded: amt }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  const w = result?.value || result
  const txn = await writeTxn(db, {
    userId,
    type: 'refund',
    credits: amt,
    balanceAfter: w?.balance || 0,
    reason,
    relatedTxnId,
    meta,
  })
  return { ok: true, txnId: txn._id, newBalance: w?.balance || 0, refunded: amt }
}

export async function listTransactions(userId, { limit = 100, skip = 0, type = null } = {}) {
  const db = await getDb()
  const q = { userId }
  if (type) q.type = type
  return db.collection(COLL.txns).find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray()
}

// ------------------------- Resource Cache -------------------------

export async function findCachedResource(fingerprint) {
  if (!fingerprint) return null
  const db = await getDb()
  return db.collection(COLL.resources).findOne({ fingerprint, status: 'ready' })
}

export async function storeGeneratedResource({
  fingerprint,
  zone,
  generationType,
  content,
  promptSummary = null,
  model = null,
  tokensIn = 0,
  tokensOut = 0,
  geminiCallId = null,
  costINRAtGeneration = 0,
  className = null,
  bookName = null,
  chapterName = null,
  topic = null,
  loCodes = [],
  language = 'odia',
  createdBy = null,
}) {
  if (!fingerprint) throw new Error('fingerprint required')
  const db = await getDb()
  const now = new Date()
  const doc = {
    _id: uuidv4(),
    fingerprint,
    zone: zone || null,
    generationType: generationType || null,
    className, bookName, chapterName, topic,
    loCodes: Array.isArray(loCodes) ? loCodes : [],
    language,
    content,
    promptSummary,
    model,
    tokensIn,
    tokensOut,
    costINRAtGeneration,
    geminiCallId,
    reuseCount: 0,
    createdBy,
    status: 'ready',
    createdAt: now,
    updatedAt: now,
  }
  await db.collection(COLL.resources).insertOne(doc)
  return doc
}

export async function bumpResourceReuse(resourceId) {
  if (!resourceId) return
  const db = await getDb()
  await db.collection(COLL.resources).updateOne(
    { _id: resourceId },
    { $inc: { reuseCount: 1 }, $set: { updatedAt: new Date() } }
  )
}

// ------------------------- Plans -------------------------

// Default seed data — mirrored from /app/scripts/ai-credit-phase-1a-seed.mjs
// Used ONLY when listActivePlans() finds an empty collection (e.g. a fresh
// production DB that never had the Phase 1A seed script run against it).
// Upserts are idempotent by `_id`, so on a healthy DB this is a safe no-op.
const DEFAULT_PLANS = [
  { _id: 'plan_starter_100',   code: 'starter',  name: 'Starter Pack',   priceINR: 49,  credits: 100,  bestValue: false, badge: null,             sortOrder: 1, active: true, productType: 'ai_credits' },
  { _id: 'plan_teacher_300',   code: 'teacher',  name: 'Teacher Pack',   priceINR: 99,  credits: 300,  bestValue: false, badge: null,             sortOrder: 2, active: true, productType: 'ai_credits' },
  { _id: 'plan_smart_750',     code: 'smart',    name: 'Smart Choice',   priceINR: 199, credits: 750,  bestValue: true,  badge: '⭐ BEST VALUE', sortOrder: 3, active: true, productType: 'ai_credits' },
  { _id: 'plan_power_2000',    code: 'power',    name: 'Power Pack',     priceINR: 399, credits: 2000, bestValue: false, badge: null,             sortOrder: 4, active: true, productType: 'ai_credits' },
  { _id: 'plan_ultimate_5000', code: 'ultimate', name: 'Ultimate Pack',  priceINR: 799, credits: 5000, bestValue: false, badge: null,             sortOrder: 5, active: true, productType: 'ai_credits' },
]

const DEFAULT_COSTS = [
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
  { _id: 'cost_worksheet_custom',            zone: 'worksheet',  type: 'custom_worksheet',  label: 'Custom Worksheet',         credits: 6,  active: true },
  { _id: 'cost_worksheet_assessment',        zone: 'worksheet',  type: 'assessment_worksheet', label: 'Assessment Worksheet',  credits: 8,  active: true },
  { _id: 'cost_assessment_fa',               zone: 'assessment', type: 'fa_assessment',     label: 'FA Assessment',            credits: 8,  active: true },
  { _id: 'cost_assessment_sa',               zone: 'assessment', type: 'sa_assessment',     label: 'SA Assessment',            credits: 8,  active: true },
  { _id: 'cost_assessment_observation',      zone: 'assessment', type: 'observation',       label: 'Observation',              credits: 6,  active: true },
  { _id: 'cost_assessment_paper',            zone: 'assessment', type: 'assessment_paper',  label: 'Assessment Paper',         credits: 10, active: true },
  { _id: 'cost_question_paper',              zone: 'question_paper', type: 'question_paper',label: 'Question Paper',           credits: 8,  active: true },
  { _id: 'cost_bulk_engagement_all',         zone: 'bulk',       type: 'engagement_all',    label: 'Generate All (Engagement)',credits: 20, active: true },
  { _id: 'cost_bulk_worksheet_assessment_all', zone: 'bulk',     type: 'worksheet_assessment_all', label: 'Generate All (Worksheet/Assessment)', credits: 25, active: true },
]

// Guard so we only try the auto-seed once per process (prevents thundering herd
// when many concurrent requests hit a cold production instance).
let _plansAutoSeededOnce = false
let _costsAutoSeededOnce = false

async function _ensurePlansSeeded(db) {
  if (_plansAutoSeededOnce) return
  const count = await db.collection(COLL.plans).countDocuments({})
  if (count > 0) { _plansAutoSeededOnce = true; return }
  const now = new Date()
  const ops = DEFAULT_PLANS.map(p => {
    const { _id, ...rest } = p
    return {
      updateOne: {
        filter: { _id },
        update: {
          $set: { ...rest, updatedAt: now },
          $setOnInsert: { createdAt: now, seededAt: now, autoSeeded: true },
        },
        upsert: true,
      },
    }
  })
  try {
    await db.collection(COLL.plans).bulkWrite(ops, { ordered: false })
    console.log('[ai-credit-service] Auto-seeded 5 default plans (empty collection detected)')
  } catch (e) {
    console.warn('[ai-credit-service] Plan auto-seed failed (safe to ignore if plans now exist):', e.message)
  }
  _plansAutoSeededOnce = true
}

async function _ensureCostsSeeded(db) {
  if (_costsAutoSeededOnce) return
  const now = new Date()
  // Idempotent upsert: use $setOnInsert only so any admin edits to existing
  // rows (custom labels / adjusted credit prices) are NEVER overwritten.
  // Missing rows (e.g. a new tool added after initial seed) are inserted with
  // their default configuration.
  const ops = DEFAULT_COSTS.map(c => {
    const { _id, ...rest } = c
    return {
      updateOne: {
        filter: { _id },
        update: {
          $setOnInsert: {
            ...rest,
            createdAt: now,
            seededAt: now,
            editable: true,
            minCredits: 1,
            autoSeeded: true,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    }
  })
  try {
    const res = await db.collection(COLL.costs).bulkWrite(ops, { ordered: false })
    const inserted = res?.upsertedCount || 0
    if (inserted > 0) console.log(`[ai-credit-service] Auto-seeded ${inserted} generation cost row(s)`)
  } catch (e) {
    console.warn('[ai-credit-service] Cost auto-seed failed (safe to ignore if costs now exist):', e.message)
  }
  _costsAutoSeededOnce = true
}

export async function listActivePlans() {
  const db = await getDb()
  await _ensurePlansSeeded(db)
  return db.collection(COLL.plans).find({ active: true }).sort({ sortOrder: 1, priceINR: 1 }).toArray()
}

export async function getPlan(planId) {
  const db = await getDb()
  return db.collection(COLL.plans).findOne({ _id: planId })
}
