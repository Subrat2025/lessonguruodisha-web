// ============================================================
//  curriculumTranslate.js
//  Translate SCERT-Odisha curriculum text (CG / Competency / LO
//  descriptions — stored in Odia) into the lesson's medium language
//  (currently: Hindi) so Hindi-subject lesson plans show these
//  DETAILS in Hindi instead of Odia.
//
//  • Values only — codes (CG-3, C-3.1, OD 611) are NEVER translated.
//  • AI-translated via Gemini, then CACHED in MongoDB collection
//    `loCodeI18n` keyed by (textHash + lang) so it is instant + free
//    on every subsequent request and shared across all plans.
// ============================================================
import crypto from 'crypto'
import { geminiEnabled, generateJSONGeminiOnly } from './gemini.js'

const LANG_LABEL = { hindi: 'Hindi (Devanagari / हिन्दी)', odia: 'Odia (ଓଡ଼ିଆ)', english: 'English' }

const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
const hashOf = (lang, text) => crypto.createHash('sha1').update(`${lang}::${text}`).digest('hex')

// Only translate strings that actually contain Odia script (skip strings that
// are already Latin/Devanagari, empty, or pure codes).
const hasOdia = (s) => /[\u0B00-\u0B7F]/.test(String(s || ''))

/**
 * Translate a batch of curriculum snippets into `targetLang`.
 * @param {import('mongodb').Db} db
 * @param {Array<{key:string,text:string}>} items
 * @param {string} targetLang  'hindi' (default) — only 'hindi' is enabled today
 * @returns {Promise<Record<string,string>>} map of key -> translated text
 *          (falls back to the ORIGINAL text on any miss / failure)
 */
export async function translateCurriculumTexts(db, items, targetLang = 'hindi') {
  const lang = String(targetLang || 'hindi').toLowerCase()
  const out = {}
  const list = (Array.isArray(items) ? items : []).map(it => ({ key: it.key, text: norm(it.text) }))
    .filter(it => it.key && it.text)
  if (!list.length) return out

  // Odia is the source language — asking for Odia is a no-op.
  if (lang === 'odia') { for (const it of list) out[it.key] = it.text; return out }

  // De-duplicate by text so identical CG/competency lines translate once.
  const byText = new Map() // text -> { hash, keys:[] }
  for (const it of list) {
    out[it.key] = it.text // default = original
    if (!hasOdia(it.text)) continue // nothing to translate
    const h = hashOf(lang, it.text)
    if (!byText.has(it.text)) byText.set(it.text, { hash: h, keys: [] })
    byText.get(it.text).keys.push(it.key)
  }
  if (!byText.size) return out

  // 1) Cache lookup.
  const hashes = [...byText.values()].map(v => v.hash)
  let cached = []
  try {
    cached = await db.collection('loCodeI18n')
      .find({ lang, hash: { $in: hashes } }, { projection: { _id: 0, hash: 1, translated: 1 } })
      .toArray()
  } catch { cached = [] }
  const cacheByHash = new Map(cached.map(c => [c.hash, c.translated]))

  const misses = [] // [{ text, hash, keys }]
  for (const [text, meta] of byText.entries()) {
    const hit = cacheByHash.get(meta.hash)
    if (hit) { for (const k of meta.keys) out[k] = hit }
    else misses.push({ text, hash: meta.hash, keys: meta.keys })
  }
  if (!misses.length) return out
  if (!geminiEnabled()) return out // no key → keep originals

  // 2) Translate the misses in ONE Gemini call → JSON array (index-aligned).
  const label = LANG_LABEL[lang] || lang
  const numbered = misses.map((m, i) => `${i}. ${m.text}`).join('\n')
  const prompt = `You are a precise education-domain translator for Odisha school curriculum.
Translate each numbered line below from Odia into ${label}.

STRICT RULES:
- Translate MEANING accurately using natural, formal school-curriculum ${label}.
- Keep any codes, numbers, punctuation and Latin abbreviations EXACTLY as-is
  (e.g. "CG-3", "C-3.1", "OD 611", "AN", "TLM" must NOT be translated or altered).
- Do NOT add notes, transliteration, or the original text. Output the translation only.
- Preserve the same count and ordering.

Return ONLY a JSON object of the form: { "items": ["<translation for 0>", "<translation for 1>", ...] }

LINES:
${numbered}`

  try {
    const res = await generateJSONGeminiOnly({ prompt, temperature: 0.2 })
    const arr = Array.isArray(res?.items) ? res.items
      : Array.isArray(res) ? res
      : null
    if (arr && arr.length) {
      const ops = []
      for (let i = 0; i < misses.length; i++) {
        const t = norm(arr[i])
        if (!t) continue
        for (const k of misses[i].keys) out[k] = t
        ops.push({
          updateOne: {
            filter: { lang, hash: misses[i].hash },
            update: { $set: { lang, hash: misses[i].hash, source: misses[i].text, translated: t, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
            upsert: true,
          },
        })
      }
      if (ops.length) { try { await db.collection('loCodeI18n').bulkWrite(ops, { ordered: false }) } catch {} }
    }
  } catch (e) {
    // On any AI failure keep the original Odia text (already set as default).
    console.warn('[curriculumTranslate] translation failed, keeping Odia:', String(e?.message || '').slice(0, 200))
  }
  return out
}
