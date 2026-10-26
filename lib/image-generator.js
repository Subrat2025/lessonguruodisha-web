// ============================================================================
//  Educational Image Generator — Gemini Imagen 3 → OpenAI gpt-image-1 → Cloudinary
//
//  Provider strategy (matches the app-wide policy set by the teacher):
//    1. Try Gemini `imagen-3.0-generate-002` first (preferred).
//    2. On ANY failure (rate limit, quota, safety, network, invalid response),
//       fall back to OpenAI `gpt-image-1` — same prompt, same style suffix.
//    3. Upload the resulting base64 image to Cloudinary in the shared bucket
//       and return the delivery URL + metadata.
//
//  Only if BOTH providers fail do we throw. This keeps assessment builds
//  resilient across quota events.
// ============================================================================
import { GoogleGenAI } from '@google/genai'
import { uploadToCloudinary, cloudinaryEnabled } from './cloudinary.js'

const IMAGEN_MODEL = 'imagen-3.0-generate-002'
const OPENAI_IMAGE_MODEL = 'gpt-image-1'
const OPENAI_IMAGES_ENDPOINT = 'https://api.openai.com/v1/images/generations'

// A single style prompt that is appended to every user concept. Optimized for
// primary-grade Odisha worksheets — flat, bold, high-contrast, print-safe.
const CHILD_STYLE = [
  'flat 2D vector-style educational illustration',
  'bright pastel colours',
  'thick clean outlines',
  'plain white background',
  'centered composition',
  'friendly cartoon style suitable for primary school children (ages 5-9)',
  'high-contrast, printable at A4 size',
  'no text, no letters, no numbers, no watermark',
  'safe-for-classroom',
].join(', ')

// A separate style for pedagogical diagrams (parts of plant, water cycle, etc).
// Slightly cleaner + labels ALLOWED but they should be very short if any.
const DIAGRAM_STYLE = [
  'clean educational diagram in flat vector style',
  'labelled parts with simple English or Odia labels',
  'bright pastel colours',
  'plain white background',
  'thick outlines',
  'suitable for a primary school science textbook',
  'high-contrast, printable at A4',
].join(', ')

export function imageGenEnabled() {
  // At least one text/image provider must be configured. Cloudinary is required for upload.
  return !!((process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) && cloudinaryEnabled())
}

// Map arbitrary aspect string → OpenAI-supported size (gpt-image-1 accepts 1024x1024, 1024x1536, 1536x1024).
function openaiSizeFor(aspectRatio) {
  const a = String(aspectRatio || '1:1')
  if (a === '4:3' || a === '3:2' || a === '16:9') return '1536x1024'
  if (a === '3:4' || a === '2:3' || a === '9:16') return '1024x1536'
  return '1024x1024'
}

// -----------------------------------------------------------------------------
// Provider adapters — each returns a base64 JPEG/PNG data URI on success.
// -----------------------------------------------------------------------------
async function tryImagen({ prompt, aspectRatio }) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not configured')
  const ai = new GoogleGenAI({ apiKey: key })
  const aiResp = await ai.models.generateImages({
    model: IMAGEN_MODEL,
    prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: aspectRatio || '1:1',
      outputMimeType: 'image/jpeg',
    },
  })
  const gens = aiResp?.generatedImages
  if (!gens || gens.length === 0) throw new Error('Imagen-3 returned no image (safety filter?)')
  const b64 = gens[0]?.image?.imageBytes
  if (!b64) throw new Error('Imagen-3 response missing imageBytes')
  return { dataUri: `data:image/jpeg;base64,${b64}`, provider: 'imagen-3' }
}

async function tryOpenAIImage({ prompt, aspectRatio }) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY not configured')
  const size = openaiSizeFor(aspectRatio)
  const resp = await fetch(OPENAI_IMAGES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      n: 1,
      size,
      // gpt-image-1 returns b64_json by default; we don't set response_format
    }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const msg = data?.error?.message || `HTTP ${resp.status}`
    throw new Error(`OpenAI images failed: ${msg}`)
  }
  const item = data?.data?.[0]
  const b64 = item?.b64_json
  if (!b64) throw new Error('OpenAI images response missing b64_json')
  return { dataUri: `data:image/png;base64,${b64}`, provider: 'gpt-image-1' }
}

/**
 * Generate a single educational image and upload it to Cloudinary.
 *
 * @param {Object} opts
 *   concept       string   short slug like "apple" or "cow" or "traffic-signal"
 *   description   string   longer prompt (optional). If missing, we build one from concept.
 *   mode          'illustration' | 'diagram'  default 'illustration'
 *   className     string   (metadata only, not in prompt) — used for Cloudinary tags
 *   aspectRatio   '1:1' | '4:3' | '3:4' | '16:9'   default '1:1'
 *
 * @returns { url, publicId, width, height, provider: 'imagen-3', concept, prompt }
 *          or throws on hard failure.
 */
export async function generateEducationalImage({
  concept,
  description,
  mode = 'illustration',
  className,
  aspectRatio = '1:1',
} = {}) {
  if (!imageGenEnabled()) throw new Error('Image generation is not configured (need Cloudinary + at least one of Gemini/OpenAI keys)')
  if (!concept) throw new Error('concept is required')

  const styleSuffix = mode === 'diagram' ? DIAGRAM_STYLE : CHILD_STYLE
  const promptCore = description && description.trim().length > 3
    ? description.trim()
    : `A simple illustration of "${concept}" for a primary school worksheet.`
  const prompt = `${promptCore}\n\nSTYLE: ${styleSuffix}`

  // Try Gemini first, then OpenAI. Skip Gemini path entirely if no key.
  const providers = []
  if (process.env.GEMINI_API_KEY) providers.push({ name: 'imagen-3', fn: tryImagen })
  if (process.env.OPENAI_API_KEY) providers.push({ name: 'gpt-image-1', fn: tryOpenAIImage })
  if (providers.length === 0) throw new Error('No image generation provider configured (need GEMINI_API_KEY or OPENAI_API_KEY)')

  let last = null
  let generated = null
  for (const p of providers) {
    try {
      generated = await p.fn({ prompt, aspectRatio })
      break
    } catch (err) {
      const msg = err?.message || String(err)
      console.warn(`[image-gen] ${p.name} failed for concept "${concept}": ${msg.slice(0, 200)}`)
      last = err
      // continue to next provider
    }
  }
  if (!generated) {
    throw new Error(`All image providers failed for "${concept}". Last error: ${last?.message || 'unknown'}`)
  }

  // Upload to Cloudinary
  const safeSlug = String(concept).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'concept'
  const up = await uploadToCloudinary({
    dataUri: generated.dataUri,
    folder: `lg-edu-library/${mode === 'diagram' ? 'diagrams' : 'illustrations'}`,
    tags: [
      'lg-edu',
      mode,
      `concept:${safeSlug}`,
      `provider:${generated.provider}`,
      className ? `class:${String(className).replace(/\s+/g, '-').toLowerCase()}` : null,
    ].filter(Boolean),
    context: {
      concept: safeSlug,
      mode,
      className: className || '',
      generator: generated.provider,
    },
  })

  return {
    url: up.url,
    rawUrl: up.rawUrl,
    publicId: up.publicId,
    width: up.width,
    height: up.height,
    provider: generated.provider,
    mode,
    concept: safeSlug,
    prompt,
    styleUsed: styleSuffix,
  }
}

/**
 * Convenience wrapper: generate a batch of concepts in parallel with a
 * concurrency limit (default 3 at a time so we don't hammer the API).
 *
 * @param {Array<{concept, description?, mode?}>} items
 * @param {Object} opts
 *   className, concurrency=3, aspectRatio, onEach?(item, result|err)
 *
 * @returns Array<{ concept, ok, image?, error? }>
 */
export async function generateEducationalImagesBatch(items = [], opts = {}) {
  const concurrency = Math.max(1, Math.min(6, opts.concurrency || 3))
  const results = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      const it = items[i]
      try {
        const img = await generateEducationalImage({
          concept: it.concept,
          description: it.description,
          mode: it.mode || 'illustration',
          className: opts.className,
          aspectRatio: opts.aspectRatio || '1:1',
        })
        results[i] = { concept: it.concept, ok: true, image: img }
        if (opts.onEach) try { opts.onEach(it, results[i]) } catch { /* ignore */ }
      } catch (e) {
        results[i] = { concept: it.concept, ok: false, error: e?.message || String(e) }
        if (opts.onEach) try { opts.onEach(it, results[i]) } catch { /* ignore */ }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results
}
