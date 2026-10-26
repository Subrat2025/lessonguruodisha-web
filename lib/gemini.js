// Google Gemini integration for Lesson Guru Odisha.
// Model selection is dynamic + self-healing:
//   1. If GEMINI_MODEL env var is set → use it verbatim.
//   2. Otherwise query the API's model catalogue for THIS key and pick the
//      first that appears in the preference list below.
//   3. If a call fails with NOT_FOUND/model unavailable, blacklist that model
//      and transparently retry with the next preferred one.
// The choice is cached for the lifetime of the process so we don't hit the
// list endpoint on every request.

import { GoogleGenAI } from '@google/genai'

const API_KEY = process.env.GEMINI_API_KEY || ''
const DAILY_LIMIT = Number(process.env.GEMINI_DAILY_LIMIT) || 5000 // safety buffer; override via env

// Preferred model order — override individual entries via env GEMINI_MODEL if you know exactly what you want.
// NOTE: Google deprecated the whole gemini-2.5-* family for new users on 2026-08.
// The listModels API STILL returns those names as available for this key, so the
// naive intersect-with-list resolver ends up picking a dead model and burns through
// maxModelAttempts before finding a working one.  We now put the -latest aliases
// first (which Google guarantees always resolve to a live snapshot), followed by
// the 3.x flash family, and keep the deprecated names purely as safety fallbacks.
const MODEL_PREFERENCE = [
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-pro-latest',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash-preview',
  'gemini-2.0-flash',
]
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta'

// Runtime state — never hardcode a model.
let _activeModel = null                       // resolved model name currently in use
let _modelResolver = null                     // in-flight promise while resolving
const _blacklistedModels = new Set()          // models we've seen NOT_FOUND from
let _startupLogged = false

let aiClient = null
export function getGemini() {
  if (aiClient) return aiClient
  if (!API_KEY) return null
  aiClient = new GoogleGenAI({ apiKey: API_KEY })
  return aiClient
}

export function geminiEnabled() {
  return !!API_KEY
}

// Fetch the list of models available to THIS API key.  Cached across calls.
let _availableModelsCache = null
async function listAvailableModels() {
  if (_availableModelsCache) return _availableModelsCache
  const ai = getGemini(); if (!ai) return []
  try {
    // The SDK exposes `ai.models.list()` returning an async iterable of Model objects.
    // Fall back to the REST endpoint if that shape changes.
    const out = []
    if (typeof ai.models?.list === 'function') {
      const pager = await ai.models.list()
      // Pager can be an async iterable or a { page } object; handle both defensively.
      if (pager?.[Symbol.asyncIterator]) {
        for await (const m of pager) out.push(m?.name || m?.model || '')
      } else if (Array.isArray(pager?.page)) {
        for (const m of pager.page) out.push(m?.name || m?.model || '')
      } else if (Array.isArray(pager?.models)) {
        for (const m of pager.models) out.push(m?.name || m?.model || '')
      }
    }
    if (out.length === 0) {
      // REST fallback
      const res = await fetch(`${ENDPOINT}/models?key=${encodeURIComponent(API_KEY)}`)
      const j = await res.json()
      for (const m of (j?.models || [])) out.push(m?.name || '')
    }
    _availableModelsCache = out
      .map(n => String(n || '').replace(/^models\//, ''))
      .filter(Boolean)
    return _availableModelsCache
  } catch (e) {
    console.warn('[gemini] listAvailableModels failed:', e?.message)
    _availableModelsCache = []
    return _availableModelsCache
  }
}

// Resolve the model to use for the NEXT call.  Guarantees only one concurrent
// resolution — subsequent calls await the same promise.
async function resolveActiveModel() {
  if (_activeModel && !_blacklistedModels.has(_activeModel)) return _activeModel
  if (_modelResolver) return _modelResolver
  _modelResolver = (async () => {
    // 1. Explicit env override wins (only if not blacklisted)
    const envChoice = (process.env.GEMINI_MODEL || '').trim()
    if (envChoice && !_blacklistedModels.has(envChoice)) {
      _activeModel = envChoice
      logStartupOnce('env-var')
      return _activeModel
    }
    // 2. Otherwise: intersect preference list with what THIS key can actually see
    const available = await listAvailableModels()
    const availableSet = new Set(available)
    for (const candidate of MODEL_PREFERENCE) {
      if (_blacklistedModels.has(candidate)) continue
      if (availableSet.has(candidate)) { _activeModel = candidate; break }
    }
    // 3. If we STILL have nothing, take the first non-blacklisted candidate
    //    from the preference list (best-effort — the actual call will error
    //    with NOT_FOUND and we'll blacklist + retry).
    if (!_activeModel) {
      for (const candidate of MODEL_PREFERENCE) {
        if (!_blacklistedModels.has(candidate)) { _activeModel = candidate; break }
      }
    }
    logStartupOnce(availableSet.size ? 'list-api' : 'preference-list-fallback')
    return _activeModel
  })().finally(() => { _modelResolver = null })
  return _modelResolver
}

function logStartupOnce(source) {
  if (_startupLogged) return
  _startupLogged = true
  let sdkVersion = 'unknown'
  try {
    const fs = require('fs')
    const raw = fs.readFileSync('/app/node_modules/@google/genai/package.json', 'utf8')
    sdkVersion = JSON.parse(raw).version || 'unknown'
  } catch { /* ignore — sdk version stays 'unknown' */ }
  console.log(`[gemini] ✅ Ready · model=${_activeModel} · source=${source} · sdk=@google/genai@${sdkVersion} · endpoint=${ENDPOINT}`)
}

// Public: read the resolved model without triggering resolution (for diagnostics)
export function currentModel() { return _activeModel }
// Public: force a re-resolution on next call (useful for admin panel)
export function resetModelCache() { _activeModel = null; _availableModelsCache = null; _blacklistedModels.clear(); _startupLogged = false }

// Latest Gemini usageMetadata (promptTokenCount, candidatesTokenCount,
// thoughtsTokenCount, totalTokenCount, cachedContentTokenCount, ...).
// Captured after every successful generateContent so the AI Credit wrapper
// can log REAL token usage instead of char-length estimates.
let _lastUsage = null
export function lastUsageMetadata() { return _lastUsage }

// -----------------------------------------------------------------------------
//  Low-level call helper with automatic model failover on NOT_FOUND.
// -----------------------------------------------------------------------------
// If the current model returns NOT_FOUND / model-unavailable, we blacklist it
// and transparently retry with the next preferred model.  All OTHER errors
// (rate limits, invalid schemas, malformed prompts, network failures) bubble
// straight up to the caller unchanged — we only auto-fix model-availability
// issues here, never business errors.
// Hard timeout for each Gemini call.  Cloudflare / ingress cuts idle
// connections after ~60s.  We surface a controlled timeout error so callers
// (paid AI Credit zones) can refund credits and show the friendly retry UI
// instead of returning a raw 504 to the user.
const GEMINI_CALL_TIMEOUT_MS = Number(process.env.GEMINI_CALL_TIMEOUT_MS) || 55000
async function _callWithTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Gemini call timed out after ${Math.round(ms / 1000)}s`)
      err.code = 'GEMINI_TIMEOUT'
      err.isTimeout = true
      reject(err)
    }, ms)
  })
  try { return await Promise.race([promise, timeout]) }
  finally { clearTimeout(timer) }
}

async function callGeminiWithFailover(callArgs, { maxModelAttempts = 8, timeoutMs = GEMINI_CALL_TIMEOUT_MS } = {}) {
  const ai = getGemini()
  if (!ai) throw new Error('Gemini API key not configured')
  let lastErr = null
  for (let attempt = 0; attempt < maxModelAttempts; attempt++) {
    const model = await resolveActiveModel()
    if (!model) throw new Error('No Gemini model is currently available for this API key')
    // 🔧 Gemini 3.x family REJECTS `thinkingConfig.thinkingBudget: 0` with a
    // 400 INVALID_ARGUMENT (only Gemini 2.x supports disabling thinking that
    // way). Strip thinkingConfig for any non-2.x model so JSON generation
    // works across the whole app. Verified 2026-08 against gemini-3.6-flash.
    let effectiveArgs = callArgs
    if (callArgs?.config?.thinkingConfig && !/gemini-2(\.|-)/i.test(model)) {
      const { thinkingConfig, ...restCfg } = callArgs.config
      effectiveArgs = { ...callArgs, config: restCfg }
    }
    try {
      const response = await _callWithTimeout(ai.models.generateContent({ model, ...effectiveArgs }), timeoutMs)
      // Cache the usage metadata so ai-credit-gemini.js can log REAL tokens
      // (falls back to null if the SDK didn't populate it).
      _lastUsage = response?.usageMetadata || null
      return response
    } catch (err) {
      lastErr = err
      const msg = String(err?.message || '')
      const isModelUnavailable = /NOT_FOUND|no longer available for new users|not found|unsupported|Requested entity was not found/i.test(msg)
      if (!isModelUnavailable) throw err              // non-model errors propagate
      console.warn(`[gemini] model "${model}" is unavailable — blacklisting and switching. reason: ${msg.slice(0, 160)}`)
      _blacklistedModels.add(model)
      _activeModel = null
      // Force fresh listAvailableModels() next round so we don't loop on stale cache
      _availableModelsCache = null
    }
  }
  throw lastErr || new Error('All preferred Gemini models are unavailable for this API key')
}

// =========== QUOTA TRACKER ===========
// Stores per-day count in `ai_usage` collection (keyed by YYYY-MM-DD).
export async function bumpQuota(db) {
  const today = new Date().toISOString().slice(0, 10)
  const doc = await db.collection('ai_usage').findOneAndUpdate(
    { date: today },
    { $inc: { count: 1 } },
    { upsert: true, returnDocument: 'after' }
  )
  const count = doc?.value?.count || doc?.count || 1
  if (count > DAILY_LIMIT) {
    throw new Error(`Daily AI quota reached (${count}/${DAILY_LIMIT}). Try again tomorrow.`)
  }
  return count
}

export async function getQuotaStatus(db) {
  const today = new Date().toISOString().slice(0, 10)
  const doc = await db.collection('ai_usage').findOne({ date: today })
  const used = doc?.count || 0
  return { used, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - used), date: today }
}

// =========== SYSTEM INSTRUCTIONS ===========
const SYSTEM_INSTRUCTION = `You are an expert bilingual educator fluent in Odia (ଓଡ଼ିଆ) and English, specializing in the Odisha state primary/secondary curriculum (Balvatika to Class 10) following the Panchapadi (5-step) methodology:
1. ଅଧୀତି (Adhiti) — Introduction / Preparation
2. ବୋଧ (Bodha) — Conceptual Understanding / Comprehension
3. ଅଭ୍ୟାସ (Abhyasa) — Practice
4. ପ୍ରୟୋଗ (Prayoga) — Application
5. ପ୍ରସାର (Prasara) — Expansion / Extension

Your output:
- MUST follow the exact JSON schema provided.
- MUST be culturally rooted in Odisha (use local examples — Konark, Jagannath, Chilika, paddy fields, sambalpuri, traditional games, common Odia names: Subrat, Pratima, Bishnu, Sasmita).
- MUST default to Odia (ଓଡ଼ିଆ) language unless asked in English.
- MUST be age-appropriate and pedagogically sound.
- Avoid politics, religion controversies, unsafe topics.`

// =========== JSON SCHEMAS ===========

// Panchapadi lesson plan — matches DB lesson.panchapadi structure
export const PANCHAPADI_SCHEMA = {
  type: 'object',
  properties: {
    topic: { type: 'string', description: 'Topic of this period in Odia' },
    learningOutcomes: { type: 'array', items: { type: 'string' }, description: '3-5 learning outcomes in Odia' },
    tlm: { type: 'array', items: { type: 'string' }, description: 'Teaching-Learning Materials list' },
    homework: { type: 'string', description: 'Homework / Practice instructions in Odia' },
    panchapadi: {
      type: 'object',
      properties: {
        prastabana: {
          type: 'object',
          properties: {
            timing: { type: 'string', description: 'e.g. ୫ ମିନିଟ୍' },
            teacherActivity: { type: 'string' },
            studentActivity: { type: 'string' },
          },
          required: ['teacherActivity', 'studentActivity'],
        },
        anweshana: {
          type: 'object',
          properties: {
            timing: { type: 'string' },
            teacherActivity: { type: 'string' },
            studentActivity: { type: 'string' },
          },
          required: ['teacherActivity', 'studentActivity'],
        },
        alochana: {
          type: 'object',
          properties: {
            timing: { type: 'string' },
            teacherActivity: { type: 'string' },
            studentActivity: { type: 'string' },
          },
          required: ['teacherActivity', 'studentActivity'],
        },
        prayoga: {
          type: 'object',
          properties: {
            timing: { type: 'string' },
            teacherActivity: { type: 'string' },
            studentActivity: { type: 'string' },
          },
          required: ['teacherActivity', 'studentActivity'],
        },
        mulyayana: {
          type: 'object',
          properties: {
            timing: { type: 'string' },
            teacherActivity: { type: 'string' },
            studentActivity: { type: 'string' },
          },
          required: ['teacherActivity', 'studentActivity'],
        },
      },
      required: ['prastabana', 'anweshana', 'alochana', 'prayoga', 'mulyayana'],
    },
  },
  required: ['topic', 'learningOutcomes', 'tlm', 'panchapadi'],
}

export const WORKSHEET_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    instructions: { type: 'string', description: 'How students should attempt this worksheet, in Odia' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'The question text' },
          type: { type: 'string', enum: ['mcq', 'fill', 'short', 'long', 'truefalse', 'match'] },
          options: { type: 'array', items: { type: 'string' }, description: 'For MCQ only' },
          answer: { type: 'string', description: 'The correct answer' },
          marks: { type: 'number' },
        },
        required: ['q', 'type'],
      },
    },
    totalMarks: { type: 'number' },
  },
  required: ['title', 'questions'],
}

export const MCQ_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
          correctIndex: { type: 'number' },
          explanation: { type: 'string' },
        },
        required: ['q', 'options', 'correctIndex'],
      },
    },
  },
  required: ['questions'],
}

export const ACTIVITY_SCHEMA = {
  type: 'object',
  properties: {
    activities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          duration: { type: 'string' },
          materials: { type: 'array', items: { type: 'string' } },
          instructions: { type: 'string' },
          learningGoal: { type: 'string' },
        },
        required: ['title', 'instructions'],
      },
    },
  },
  required: ['activities'],
}

// =========== CORE GENERATION FN ===========
// Attempts Gemini first.  If Gemini fails for ANY reason (quota exceeded, rate
// limit, transient 5xx, safety-block, timeout, malformed response …) it
// transparently falls back to OpenAI (`gpt-4o-mini`).  Both return the same
// parsed-JSON shape so callers don't have to change anything.
export async function generateJSON({ prompt, schema, temperature = 0.7 }) {
  const ai = getGemini()
  const tryOpenAI = async (reason) => {
    // Dynamic import so the file stays fine even when OpenAI package isn't installed
    const { generateJSONWithOpenAI, openaiEnabled } = await import('./openai.js')
    if (!openaiEnabled()) {
      throw new Error(`Gemini failed (${reason}) and OpenAI fallback is not configured`)
    }
    // eslint-disable-next-line no-console
    console.warn(`[LLM] Gemini failed → falling back to OpenAI. Reason:`, reason)
    return generateJSONWithOpenAI({ prompt, schema, temperature })
  }
  if (!ai) return tryOpenAI('GEMINI_API_KEY not configured')
  // Strip OpenAI-only hints from schema before sending to Gemini
  const geminiSchema = schema && typeof schema === 'object' ? (() => {
    const { __loose__: _ignored, ...rest } = schema
    return rest
  })() : schema
  // eslint-disable-next-line no-unused-vars
  const _schemaHint = geminiSchema
  try {
    const response = await callGeminiWithFailover({
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        // NOTE: responseSchema intentionally omitted — see notes in
        // generateJSONGeminiOnly (avoids gemini-3.x-flash loop regression).
        temperature,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 65536,
      },
    })
    const text = response.text
    try {
      return JSON.parse(text)
    } catch {
      const cleaned = String(text || '').replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
      return JSON.parse(cleaned)
    }
  } catch (err) {
    return tryOpenAI(err?.message || 'Unknown Gemini error')
  }
}

// =========== TRUE GEMINI-ONLY GENERATION (NO OpenAI fallback) ===========
// Used by paid AI Credit zones (Student Engagement, Custom Worksheets,
// Assessment, Resources like HOTS/Homework/Practice/etc). If Gemini fails
// for any reason — quota, rate limit, safety block, timeout — we surface
// a friendly application-level error. There is NO OpenAI fallback here.
// This is a hard policy: paid zones must never charge users for OpenAI usage.
//
// Kept the legacy name for backwards compat. Also exported as
// `generateJSONGeminiStrict` for callers who prefer the clearer name.
export async function generateJSONGeminiOnly({ prompt, schema, temperature = 0.7, systemInstruction } = {}) {
  const ai = getGemini()
  // NOTE: We deliberately do NOT pass responseSchema anymore.
  // The new gemini-3.x-flash family + responseSchema + a large persona
  // prompt = the model degenerates into an infinite repetition loop
  // (regression seen on 2026-08).  responseMimeType='application/json'
  // + a schema described in the prompt is more reliable AND ~10× faster.
  // eslint-disable-next-line no-unused-vars
  const _schemaHint = schema  // kept in signature for backwards compat

  if (!ai) {
    const err = new Error('AI generation is temporarily unavailable. Please try again shortly. No credits were charged.')
    err.code = 'GEMINI_NOT_CONFIGURED'
    err.provider = 'gemini'
    throw err
  }

  try {
    const response = await callGeminiWithFailover({
      contents: prompt,
      config: {
        systemInstruction: systemInstruction || SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        temperature,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 65536,
      },
    })
    const text = response.text
    // Defensive normalization: gemini-3.x-flash sometimes emits Odia/Devanagari
    // digits inside JSON numeric literals (e.g. `"q_number": ୧`) even though
    // the string body is fine.  We ONLY normalize digit characters — string
    // content is preserved as-is.
    const _normalizeJsonDigits = (s) => String(s || '')
      .replace(/[୦-୯]/g, (d) => '୦୧୨୩୪୫୬୭୮୯'.indexOf(d).toString())          // Odia
      .replace(/[०-९]/g, (d) => '०१२३४५६७८९'.indexOf(d).toString())            // Devanagari
      .replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d).toString())            // Bengali
    const _tryParse = (raw) => {
      try { return JSON.parse(raw) } catch { /* fall through */ }
      const cleaned = String(raw || '').replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
      try { return JSON.parse(cleaned) } catch { /* fall through */ }
      return JSON.parse(_normalizeJsonDigits(cleaned))
    }
    return _tryParse(text)
  } catch (err) {
    const msg = String(err?.message || '')
    // 🔍 Diagnostic log — helps us see the underlying Gemini failure without
    // exposing details to the user.  Safe to keep; friendly error is returned.
    console.warn('[gemini] generateJSONGeminiOnly failed:', msg.slice(0, 400))
    const isRateLimit = /RESOURCE_EXHAUSTED|429|quota|exhaust|rate/i.test(msg)
    const isTimeout = /timeout|etimedout|deadline/i.test(msg)
    const isDaily = /generate_content_free_tier_requests|per_day/i.test(msg)
    let friendly
    if (isDaily) {
      friendly = new Error('⚠️ AI generation quota reached for today. Please try again tomorrow. No credits were charged.')
      friendly.code = 'GEMINI_DAILY_QUOTA'
      friendly.isDailyQuota = true
    } else if (isRateLimit) {
      const retryMatch = /retry in ([\d.]+)s|retryDelay":"(\d+)s/i.exec(msg)
      const retryAfterSec = retryMatch ? Math.ceil(Number(retryMatch[1] || retryMatch[2] || 0)) : 0
      friendly = new Error(`⚠️ AI generation is temporarily busy. Please try again in ${retryAfterSec || 60} seconds. No credits were charged.`)
      friendly.code = 'GEMINI_RATE_LIMIT'
      friendly.retryAfterSec = retryAfterSec
    } else if (isTimeout) {
      friendly = new Error('⚠️ AI generation timed out. Please try again shortly. No credits were charged.')
      friendly.code = 'GEMINI_TIMEOUT'
    } else {
      friendly = new Error('⚠️ AI generation is temporarily unavailable. Please try again shortly. No credits were charged.')
      friendly.code = 'GEMINI_FAILED'
    }
    friendly.provider = 'gemini'
    friendly.originalMessage = msg
    throw friendly
  }
}

// Clearer alias for new callers.
export const generateJSONGeminiStrict = generateJSONGeminiOnly

// ------------------------------------------------------------
// Plain-text variant — used by the FA/SA Paper Generator to fetch
// a full HTML document.  Same failover + error mapping as the JSON
// path but WITHOUT responseMimeType='application/json'.
// ------------------------------------------------------------
export async function generateTextGeminiOnly({ prompt, systemInstruction, temperature = 0.4, maxOutputTokens = 32768 } = {}) {
  const ai = getGemini()
  if (!ai) {
    const err = new Error('AI generation is temporarily unavailable. Please try again shortly. No credits were charged.')
    err.code = 'GEMINI_NOT_CONFIGURED'; err.provider = 'gemini'
    throw err
  }
  try {
    const response = await callGeminiWithFailover({
      contents: prompt,
      config: {
        systemInstruction: systemInstruction || SYSTEM_INSTRUCTION,
        temperature,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens,
      },
    })
    return String(response.text || '')
  } catch (err) {
    const msg = String(err?.message || '')
    console.warn('[gemini] generateTextGeminiOnly failed:', msg.slice(0, 400))
    const isRateLimit = /RESOURCE_EXHAUSTED|429|quota|exhaust|rate/i.test(msg)
    const isTimeout = /timeout|etimedout|deadline/i.test(msg)
    let friendly
    if (isRateLimit) friendly = new Error('⚠️ AI is busy right now. Please try again in a minute. No credits were charged.')
    else if (isTimeout) friendly = new Error('⚠️ AI took too long. Please try again. No credits were charged.')
    else friendly = new Error('⚠️ AI generation failed. Please try again. No credits were charged.')
    friendly.code = err?.code || 'GEMINI_ERROR'; friendly.provider = 'gemini'
    throw friendly
  }
}


// Retained legacy stub — was previously named generateJSONGeminiOnly with
// OpenAI fallback. Now identical to generateJSONGeminiOnly to prevent any
// accidental OpenAI fallback in paid AI Credit zones.
async function _legacyGeminiOnlyWithOpenAIFallback_REMOVED() {
  throw new Error('_legacyGeminiOnlyWithOpenAIFallback_REMOVED: OpenAI fallback disabled for paid AI Credit zones. Use generateJSONGeminiOnly.')
}

// =========== HIGH-LEVEL HELPERS ===========
export async function genLessonPlan({ className, bookName, chapterName, topic, period, language = 'odia' }) {
  const lang = language === 'english' ? 'English' : 'Odia (ଓଡ଼ିଆ)'
  const prompt = `Generate a complete Panchapadi lesson plan for the following:

Class: ${className}
Book / Subject: ${bookName}
Chapter: ${chapterName}
Period Number: ${period || 1}
Topic / Sub-topic: ${topic || 'auto-derive from chapter'}
Output Language: ${lang}

Requirements:
- 3-5 specific, measurable Learning Outcomes (ଶିକ୍ଷଣ ଫଳାଫଳ) suitable for this class level.
- TLM (Teaching Learning Materials) — a list of 3-6 items.
- A complete 5-step Panchapadi with timings (total ~45 minutes). Use Odia numerals like ୫ ମିନିଟ୍ for timings.
- Teacher activity & Student activity for each step, written as if instructing a real Odisha government school teacher.
- A short homework (ଗୃହକାର୍ଯ୍ୟ) instruction.
- Make activities engaging, use local Odisha context.`
  return generateJSON({ prompt, schema: PANCHAPADI_SCHEMA, temperature: 0.7 })
}

export async function genWorksheet({ className, topic, count = 10, types = ['mcq', 'fill', 'short'], language = 'odia' }) {
  const lang = language === 'english' ? 'English' : 'Odia (ଓଡ଼ିଆ)'
  const prompt = `Generate a worksheet for Class ${className} on topic "${topic}".

Specifications:
- ${count} questions total mixing types: ${types.join(', ')}.
- Each question has appropriate marks (MCQ=1, fill/truefalse=1, short=2, long=5, match=4).
- Provide correct answer for each.
- Output language: ${lang}.
- Title should be in ${lang}.
- Include short instructions for students.`
  return generateJSON({ prompt, schema: WORKSHEET_SCHEMA, temperature: 0.6 })
}

export async function genMCQs({ className, topic, count = 10, language = 'odia' }) {
  const lang = language === 'english' ? 'English' : 'Odia (ଓଡ଼ିଆ)'
  const prompt = `Generate exactly ${count} multiple-choice questions for Class ${className} on the topic "${topic}".

Requirements:
- Each MCQ must have exactly 4 options.
- correctIndex is 0-based (0,1,2,3).
- Include a brief explanation for the correct answer.
- Output language: ${lang}.
- Mix difficulty (easy/medium/hard).`
  return generateJSON({ prompt, schema: MCQ_SCHEMA, temperature: 0.5 })
}

// ============== STUDENT ENGAGEMENT SCHEMAS & HELPERS ==============
export const ENGAGEMENT_ASSESSMENT_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          a: { type: 'string' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
        },
        required: ['q', 'a'],
      },
    },
  },
  required: ['questions'],
}

export const ENGAGEMENT_EXAMPLES_SCHEMA = {
  type: 'object',
  properties: {
    examples: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['title', 'description'],
      },
    },
  },
  required: ['examples'],
}

export const ENGAGEMENT_QUESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          hint: { type: 'string' },
        },
        required: ['q'],
      },
    },
  },
  required: ['questions'],
}

export const ENGAGEMENT_PROJECT_SCHEMA = {
  type: 'object',
  properties: {
    projects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          objective: { type: 'string' },
          materials: { type: 'array', items: { type: 'string' } },
          steps: { type: 'array', items: { type: 'string' } },
          outcome: { type: 'string' },
        },
        required: ['title', 'objective', 'steps'],
      },
    },
  },
  required: ['projects'],
}

export async function genEngagement({ section, className, bookName, chapterName, topic, language = 'odia' }) {
  const lang = language === 'english' ? 'English' : 'Odia (ଓଡ଼ିଆ)'
  const ctx = `Class: ${className}\nSubject / Book: ${bookName}\nChapter: ${chapterName}\nTopic: ${topic}\nOutput Language: ${lang}\n`
  // 🔒 Paid AI Credit zone — Gemini ONLY (no OpenAI fallback).
  if (section === 'assessment') {
    return generateJSONGeminiOnly({
      prompt: `${ctx}\nGenerate 5 assessment questions to check students' understanding of this topic. Mix easy / medium / hard. Each must include a model answer. Be specific to the topic, not generic.`,
      schema: ENGAGEMENT_ASSESSMENT_SCHEMA, temperature: 0.6,
    })
  }
  if (section === 'examples') {
    return generateJSONGeminiOnly({
      prompt: `${ctx}\nGive 5 vivid real-life examples that illustrate this topic. Each example must use the Odisha cultural context (local festivals, food, places, agriculture, fishing, daily village life). Title + 2-3 sentence description.`,
      schema: ENGAGEMENT_EXAMPLES_SCHEMA, temperature: 0.8,
    })
  }
  if (section === 'questions') {
    return generateJSONGeminiOnly({
      prompt: `${ctx}\nGenerate 8 practice questions on this topic for self-study. Mix of question types (recall, application, analysis). Include a short hint for each question to help the student think. No multiple-choice.`,
      schema: ENGAGEMENT_QUESTIONS_SCHEMA, temperature: 0.7,
    })
  }
  if (section === 'project') {
    return generateJSONGeminiOnly({
      prompt: `${ctx}\nDesign 2 hands-on student project ideas related to this topic. Each project should be doable at home or in a small classroom group, using easily available local materials. Provide title, objective, materials, 5-8 step instructions, and the final outcome.`,
      schema: ENGAGEMENT_PROJECT_SCHEMA, temperature: 0.8,
    })
  }
  throw new Error('Unknown engagement section: ' + section)
}

export async function genActivities({ className, topic, panchapadiStep, count = 3, language = 'odia' }) {
  const lang = language === 'english' ? 'English' : 'Odia (ଓଡ଼ିଆ)'
  const stepLabels = {
    prastabana: 'ପ୍ରସ୍ତାବନା (Introduction)',
    anweshana: 'ଅନ୍ୱେଷଣ (Exploration)',
    alochana: 'ଆଲୋଚନା (Discussion)',
    prayoga: 'ପ୍ରୟୋଗ (Application)',
    mulyayana: 'ମୂଲ୍ୟାୟନ (Evaluation)',
    any: 'any phase of the lesson',
  }
  const stepDesc = stepLabels[panchapadiStep] || stepLabels.any
  const prompt = `Generate ${count} engaging classroom activities for Class ${className} on topic "${topic}".
These activities should be suitable for the "${stepDesc}" phase of a Panchapadi lesson.

Requirements:
- Each activity has title, duration (e.g. "5-7 minutes"), materials list, step-by-step instructions, and learning goal.
- Make them interactive and culturally relevant to Odisha (use local examples, games, songs, stories).
- Output language: ${lang}.`
  return generateJSON({ prompt, schema: ACTIVITY_SCHEMA, temperature: 0.8 })
}


// =========== LO CODE AUTO-ASSIGNMENT ===========
// Given a lesson + the available LO codes for its class, ask Gemini to pick 2-4 best-matching codes.
export const LO_CODES_SCHEMA = {
  type: 'object',
  properties: {
    codes: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4, description: 'Selected LO code identifiers (exact codes from the provided list)' },
    rationale: { type: 'string', description: 'One short sentence explaining why these codes were chosen' },
  },
  required: ['codes'],
  propertyOrdering: ['codes', 'rationale'],
}

export async function suggestLoCodes({ className, bookName, chapterName, lessonTitle, lessonTopic, availableCodes }) {
  if (!Array.isArray(availableCodes) || availableCodes.length === 0) {
    throw new Error('No LO codes available for this class')
  }
  // Cap the list size to keep token usage low. Truncate descriptions.
  const list = availableCodes.slice(0, 120).map(c => `${c.code} (${c.subject || 'General'}): ${String(c.description || '').slice(0, 200)}`).join('\n')
  const prompt = `You are mapping a lesson to the most relevant Learning Outcome (LO) codes from the Odisha curriculum.

LESSON CONTEXT:
- Class: ${className || 'unknown'}
- Book / Subject: ${bookName || 'unknown'}
- Chapter: ${chapterName || 'unknown'}
- Period title: ${lessonTitle || lessonTopic || ''}
- Topic: ${lessonTopic || lessonTitle || ''}

AVAILABLE LO CODES (code + subject + description):
${list}

TASK: Pick the 2-4 LO codes that best match this lesson's learning intent.
Rules:
- Use EXACT codes from the list above (e.g., "M 301", "E 302"). Do NOT invent codes.
- Prefer codes whose subject aligns with the lesson's book/topic.
- Return JSON only, in EXACTLY this shape: {"codes": ["<code1>", "<code2>"], "rationale": "<one short sentence>"}.
- The key MUST be "codes" (an array of the chosen code strings).`
  const out = await generateJSON({ prompt, schema: LO_CODES_SCHEMA, temperature: 0.3 })
  // The model doesn't always honour the exact key name (responseSchema is not
  // enforced for gemini-3.x). Normalize any reasonable variant → { codes[] }.
  const raw = out?.codes ?? out?.selected_lo_codes ?? out?.lo_codes ?? out?.selectedCodes
    ?? out?.selected ?? out?.loCodes ?? out?.selected_codes ?? []
  const codes = (Array.isArray(raw) ? raw : [raw])
    .map(c => (typeof c === 'string' ? c : c?.code))
    .map(c => String(c || '').trim())
    .filter(Boolean)
  return { codes, rationale: out?.rationale || out?.reasoning || '' }
}


// ============================================================
//  CG + Competency selector — pick ONE curricular-goal + competency
//  pair from the official framework pool for a SUBJECT lesson.
//  Constrained to real codes (no invention).
// ============================================================
export const CG_COMP_SCHEMA = {
  type: 'object',
  properties: {
    cgCode: { type: 'string', description: 'Exact Curricular Goal code from the list, e.g. "CG-2"' },
    competencyCode: { type: 'string', description: 'Exact Competency code from the list, e.g. "C-2.13"' },
  },
  required: ['cgCode', 'competencyCode'],
  propertyOrdering: ['cgCode', 'competencyCode'],
}

export async function suggestCgCompetency({ className, subject, chapterName, lessonTitle, lessonTopic, loText, availablePairs }) {
  if (!Array.isArray(availablePairs) || availablePairs.length === 0) {
    throw new Error('No CG/Competency pairs available')
  }
  const list = availablePairs.slice(0, 120)
    .map(p => `${p.cg} → ${p.c}: ${String(p.cText || '').slice(0, 160)}`)
    .join('\n')
  const prompt = `You are mapping an Odisha (NEP 2020 / OCF-SE 2025) subject lesson to the single most relevant Curricular Goal (CG) + Competency (C) pair.

LESSON CONTEXT:
- Class: ${className || 'unknown'}
- Subject: ${subject || 'unknown'}
- Chapter: ${chapterName || 'unknown'}
- Topic: ${lessonTopic || lessonTitle || ''}
- Learning Outcome: ${String(loText || '').slice(0, 220)}

AVAILABLE CG → COMPETENCY PAIRS (code + description):
${list}

TASK: Pick EXACTLY ONE pair whose competency best matches this lesson's learning intent.
Rules:
- Use EXACT codes from the list above (e.g. cgCode "CG-2", competencyCode "C-2.13"). Do NOT invent codes.
- The competencyCode you return MUST belong to the cgCode you return.
- Return JSON only: {"cgCode":"CG-N","competencyCode":"C-N.N"}`
  return generateJSON({ prompt, schema: CG_COMP_SCHEMA, temperature: 0.2 })
}
