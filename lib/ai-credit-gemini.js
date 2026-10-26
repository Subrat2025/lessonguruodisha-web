// AI Credit — Gemini Call Wrapper with Cost + Usage Logging
//
// Wraps `generateJSONGeminiOnly` from lib/gemini.js and writes an audit row
// into `aiGeminiCalls` for every request. Returns rough token usage and an
// INR cost estimate so Phase 3 admin dashboards can show real margins.
//
// This wrapper is used ONLY by the new AI credit zones (Student Engagement,
// Custom Worksheets, Assessments). It does not replace lib/gemini.js — the
// existing Panchapadi and LO-code paths keep using their current calls.

import { v4 as uuidv4 } from 'uuid'
import { getDb } from './mongodb.js'
import { generateJSONGeminiOnly, currentModel, lastUsageMetadata } from './gemini.js'

export const CALLS_COLL = 'aiGeminiCalls'

// Gemini flash pricing (December 2025 published Google AI Studio rates,
// USD per 1M tokens).  These live here as sensible defaults but the admin
// dashboard reads the aiCreditPricingConfig collection first (if seeded),
// so ops can update pricing without a deploy.
export const GEMINI_PRICE_INPUT_PER_M_USD = 0.075
export const GEMINI_PRICE_OUTPUT_PER_M_USD = 0.30
export const USD_TO_INR = 83

/** Very rough token estimator: ~4 characters per token. Fallback only. */
export function estimateTokens(text) {
  const s = typeof text === 'string' ? text : JSON.stringify(text || '')
  return Math.max(0, Math.ceil((s || '').length / 4))
}

export function estimateGeminiCostINR(tokensIn, tokensOut, {
  usdInPer1M = GEMINI_PRICE_INPUT_PER_M_USD,
  usdOutPer1M = GEMINI_PRICE_OUTPUT_PER_M_USD,
  usdToInr = USD_TO_INR,
} = {}) {
  const usd = (Number(tokensIn || 0) / 1e6) * usdInPer1M
    + (Number(tokensOut || 0) / 1e6) * usdOutPer1M
  return Number((usd * usdToInr).toFixed(6))
}

/**
 * Call Gemini and log the attempt into aiGeminiCalls.
 * Returns:
 *   { ok:true,  content, model, tokensIn, tokensOut, costINR, callId }
 *   { ok:false, error, callId, durationMs }
 *
 * Callers MUST handle ok:false → refund the debited credits.
 *
 * NEW (Phase-1 admin): pass `generationId` (any stable ID for the resulting
 * artifact — worksheet id, assessment id, engagement section key, etc.)
 * and `creditTransactionId` (the aiCreditTransactions row id created by the
 * debit).  These land in the aiGeminiCalls row so admins can trace
 * revenue↔spend on a per-request basis.
 */
export async function callGeminiWithLog({
  userId = null,
  zone = null,
  generationType = null,
  prompt,
  schema,
  temperature = 0.7,
  systemInstruction,
  fingerprint = null,
  generationId = null,
  creditTransactionId = null,
  creditsDeducted = null,
  meta = {},
}) {
  const db = await getDb()
  const callId = uuidv4()
  const startedAt = new Date()
  await db.collection(CALLS_COLL).insertOne({
    _id: callId,
    userId,
    zone,
    generationType,
    fingerprint,
    generationId,
    creditTransactionId,
    creditsDeducted: creditsDeducted == null ? null : Number(creditsDeducted),
    model: null,
    status: 'pending',
    startedAt,
    finishedAt: null,
    durationMs: null,
    tokensIn: 0,
    tokensOut: 0,
    tokensThinking: 0,
    tokensTotal: 0,
    tokensSource: 'pending',
    costINR: 0,
    errorMessage: null,
    meta,
  })

  try {
    const content = await generateJSONGeminiOnly({ prompt, schema, temperature, systemInstruction })
    // Prefer REAL usage from Gemini's usageMetadata; fall back to
    // char-length estimation only if the SDK didn't populate it.
    const usage = lastUsageMetadata()
    let tokensIn, tokensOut, tokensThinking = 0, tokensTotal, tokensSource
    if (usage && (usage.promptTokenCount || usage.candidatesTokenCount)) {
      tokensIn = Number(usage.promptTokenCount || 0)
      tokensOut = Number(usage.candidatesTokenCount || 0)
      tokensThinking = Number(usage.thoughtsTokenCount || 0)
      tokensTotal = Number(usage.totalTokenCount || (tokensIn + tokensOut + tokensThinking))
      tokensSource = 'gemini_api'
    } else {
      tokensIn = estimateTokens(prompt)
      tokensOut = estimateTokens(content)
      tokensTotal = tokensIn + tokensOut
      tokensSource = 'estimated'
    }
    // Thinking tokens are billed as output on the Gemini side.
    const costINR = estimateGeminiCostINR(tokensIn, tokensOut + tokensThinking)
    const finishedAt = new Date()
    const durationMs = finishedAt - startedAt
    await db.collection(CALLS_COLL).updateOne(
      { _id: callId },
      { $set: {
        model: currentModel(), status: 'ok', finishedAt, durationMs,
        tokensIn, tokensOut, tokensThinking, tokensTotal, tokensSource, costINR,
      } }
    )
    return { ok: true, content, model: currentModel(), tokensIn, tokensOut, tokensThinking, tokensTotal, costINR, callId, durationMs }
  } catch (err) {
    const finishedAt = new Date()
    const durationMs = finishedAt - startedAt
    const errorMessage = String(err?.message || err).slice(0, 500)
    await db.collection(CALLS_COLL).updateOne(
      { _id: callId },
      { $set: { status: 'failed', finishedAt, durationMs, errorMessage } }
    )
    return { ok: false, error: err, callId, durationMs, errorMessage }
  }
}
