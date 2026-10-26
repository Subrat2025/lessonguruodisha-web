// OpenAI ChatGPT integration for Lesson Guru Odisha
// Serves as an AUTOMATIC FALLBACK when Google Gemini fails (quota, rate-limit,
// timeout, transient server error, safety block, etc.).
//
// Same public surface as /lib/gemini.js `generateJSON({ prompt, schema, temperature })`
// so callers can transparently switch between providers with no code changes.

import OpenAI from 'openai'
import { getDb } from './mongodb.js'

const API_KEY = process.env.OPENAI_API_KEY || ''
const MODEL = 'gpt-4o-mini'   // Cost-parity with Gemini 2.5 Flash for JSON schema
// Internal safety cap on OpenAI fallback usage per day (guards runaway spend).
// Override via env: OPENAI_DAILY_LIMIT (e.g., 50000). Default is generous.
const DAILY_LIMIT = Number(process.env.OPENAI_DAILY_LIMIT) || 10000

let client = null
export function getOpenAI() {
  if (client) return client
  if (!API_KEY) return null
  client = new OpenAI({ apiKey: API_KEY })
  return client
}

export function openaiEnabled() {
  return !!API_KEY
}

// =========== QUOTA TRACKER (separate collection so Gemini + OpenAI don't share counters) ===========
export async function bumpOpenAIQuota(db) {
  const today = new Date().toISOString().slice(0, 10)
  const doc = await db.collection('ai_usage_openai').findOneAndUpdate(
    { date: today },
    { $inc: { count: 1 } },
    { upsert: true, returnDocument: 'after' }
  )
  const count = doc?.value?.count || doc?.count || 1
  if (count > DAILY_LIMIT) {
    throw new Error(`Daily OpenAI fallback quota reached (${count}/${DAILY_LIMIT}). Try again tomorrow.`)
  }
  return count
}

export async function getOpenAIQuotaStatus(db) {
  const today = new Date().toISOString().slice(0, 10)
  const doc = await db.collection('ai_usage_openai').findOne({ date: today })
  const used = doc?.count || 0
  return { used, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - used), date: today }
}

// =========== SCHEMA ADAPTER ===========
// Gemini schemas are permissive.  OpenAI `json_schema` in strict mode requires:
//   1) `additionalProperties: false` on every object
//   2) EVERY property in `properties` listed in `required[]`
//   3) No unknown keys like `propertyOrdering`
//
// This function walks the schema and rewrites it in-place-safe (returns a new object).
export function toOpenAISchema(schema) {
  if (!schema || typeof schema !== 'object') return schema
  const out = Array.isArray(schema) ? [] : {}
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'propertyOrdering') continue                        // Gemini-only
    if (v && typeof v === 'object') out[k] = toOpenAISchema(v)
    else out[k] = v
  }
  if (out.type === 'object' && out.properties && typeof out.properties === 'object') {
    // Force strict shape
    out.additionalProperties = false
    out.required = Object.keys(out.properties)   // every property becomes required
  }
  return out
}

// =========== SYSTEM INSTRUCTION (matches Gemini's persona) ===========
const SYSTEM_INSTRUCTION = `You are an expert bilingual educator fluent in Odia (ଓଡ଼ିଆ) and English, specializing in the Odisha state primary/secondary curriculum (Balvatika to Class 10) following the Panchapadi (5-step) methodology:
1. ଅଧୀତି (Adhiti) — Introduction / Preparation
2. ବୋଧ (Bodha) — Conceptual Understanding / Comprehension
3. ଅଭ୍ୟାସ (Abhyasa) — Practice
4. ପ୍ରୟୋଗ (Prayoga) — Application
5. ମୂଲ୍ୟାୟନ (Mulyayan) — Evaluation

You produce culturally-relevant Odisha-flavoured educational content in valid JSON only.`

// =========== CORE GENERATION FN ===========
// Signature matches gemini.js `generateJSON` so it can be dropped in as a fallback.
// Auto-fetches the db handle when possible so callers don't have to thread it through.
export async function generateJSONWithOpenAI({ prompt, schema, temperature = 0.7, db = null }) {
  const ai = getOpenAI()
  if (!ai) throw new Error('OpenAI API key not configured')

  // Auto-resolve db so quota tracking works even when caller doesn't pass one
  let dbHandle = db
  if (!dbHandle) {
    try { dbHandle = await getDb() } catch { /* ignore — proceed without tracking */ }
  }
  if (dbHandle) {
    try { await bumpOpenAIQuota(dbHandle) } catch (e) { throw e }
  }

  const strictSchema = schema ? toOpenAISchema(schema) : null
  // If no schema (or schema opts into loose mode), use plain json_object response
  const useLooseJson = !strictSchema || schema?.__loose__ === true
  const resp = await ai.chat.completions.create({
    model: MODEL,
    temperature,
    messages: [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      { role: 'user', content: prompt },
    ],
    response_format: useLooseJson
      ? { type: 'json_object' }
      : {
          type: 'json_schema',
          json_schema: {
            name: 'structured_response',
            schema: strictSchema,
            strict: true,
          },
        },
  })
  const text = resp?.choices?.[0]?.message?.content || ''
  try {
    return JSON.parse(text)
  } catch {
    // Fence-strip fallback (some models still wrap in markdown occasionally)
    const cleaned = String(text || '').replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    return JSON.parse(cleaned)
  }
}
