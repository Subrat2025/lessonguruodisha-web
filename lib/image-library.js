// ============================================================================
//  Educational Image Library — cache-first lookup for illustrations & diagrams.
//
//  Collection: `educational_images`
//    {
//      id (uuid), concept (slug), aliases[], description,
//      mode: 'illustration' | 'diagram',
//      classHints[], subjectHints[], style,
//      url (Cloudinary delivery), publicId, width, height,
//      provider ('imagen-3' | 'admin-upload'), approved: boolean,
//      generatedFor, createdBy, createdAt, updatedAt, usageCount
//    }
//
//  Lookup logic (findByConcept):
//    1. exact concept match on the normalized slug
//    2. alias match (any alias slug === input slug)
//    3. text search on concept + aliases + description
//    4. only returns `approved: true` OR provider === 'imagen-3' items
//  If nothing found, caller should generate a new one.
// ============================================================================
import { v4 as uuidv4 } from 'uuid'
import { generateEducationalImage } from './image-generator.js'

const COL = 'educational_images'

// Deterministic slug for keys/aliases.
export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')      // strip accents (English side)
    .replace(/[^a-z0-9\u0900-\u0DFF]+/gi, '-')  // keep Odia unicode range
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

// A concept → aliases dictionary of common Odia↔English pairs. This is NOT the
// only source of aliases (admin can add more via UI) but it lets the library
// find matches out of the box for common Balvatika/Class-1 topics.
const BUILTIN_ALIASES = {
  apple: ['ଆପଲ', 'seb', 'ଆମ୍ବ୍ର', 'ਸੇਬ'],
  mango: ['ଆମ୍ବ', 'aam'],
  banana: ['କଦଳୀ', 'kela'],
  orange: ['କମଳା', 'santra'],
  grapes: ['ଅଙ୍ଗୁର'],
  cow: ['ଗାଈ', 'gai'],
  buffalo: ['ମଇଁଷି', 'ମଇଁଷ'],
  goat: ['ଛେଳି', 'chheli'],
  dog: ['କୁକୁର', 'kutta'],
  cat: ['ବିଲେଇ', 'billi'],
  horse: ['ଘୋଡ଼ା', 'ghoda'],
  elephant: ['ହାତୀ', 'hathi'],
  tiger: ['ବାଘ', 'bagh'],
  lion: ['ସିଂହ', 'singh'],
  monkey: ['ମାଙ୍କଡ଼', 'bandar'],
  rabbit: ['ଠେକୁଆ', 'khargosh'],
  fish: ['ମାଛ', 'machh'],
  bird: ['ପକ୍ଷୀ', 'chidiya'],
  parrot: ['ଶୁକ', 'ଶୁଆ'],
  peacock: ['ମୟୂର'],
  crow: ['କାଉ'],
  butterfly: ['ପ୍ରଜାପତି'],
  bee: ['ମହୁମାଛି'],
  ant: ['ପିମ୍ପୁଡ଼ି'],
  tree: ['ଗଛ'],
  flower: ['ଫୁଲ'],
  rose: ['ଗୋଲାପ'],
  lotus: ['ପଦ୍ମ'],
  sun: ['ସୂର୍ଯ୍ୟ', 'suraj'],
  moon: ['ଚନ୍ଦ୍ର', 'chand'],
  star: ['ତାରା'],
  cloud: ['ମେଘ'],
  rain: ['ବର୍ଷା'],
  rainbow: ['ଇନ୍ଦ୍ରଧନୁ'],
  water: ['ଜଳ', 'ପାଣି'],
  fire: ['ଅଗ୍ନି', 'ନିଆଁ'],
  book: ['ପୁସ୍ତକ', 'ବହି'],
  pen: ['କଲମ'],
  pencil: ['ପେନ୍ସିଲ'],
  bag: ['ବ୍ୟାଗ'],
  school: ['ବିଦ୍ୟାଳୟ', 'ସ୍କୁଲ'],
  house: ['ଘର'],
  car: ['ଗାଡ଼ି', 'କାର'],
  bus: ['ବସ୍'],
  train: ['ଟ୍ରେନ'],
  bicycle: ['ସାଇକେଲ୍'],
  boat: ['ନାଆ', 'ନୌକା'],
  eye: ['ଆଖି'],
  ear: ['କାନ'],
  nose: ['ନାକ'],
  mouth: ['ମୁଁହ'],
  hand: ['ହାତ'],
  leg: ['ଗୋଡ଼'],
  head: ['ମୁଣ୍ଡ'],
  circle: ['ବୃତ୍ତ'],
  square: ['ବର୍ଗ'],
  triangle: ['ତ୍ରିଭୁଜ'],
  rectangle: ['ଆୟତ'],
  red: ['ଲାଲ'],
  green: ['ସବୁଜ'],
  blue: ['ନୀଳ'],
  yellow: ['ହଳଦିଆ'],
  black: ['କଳା'],
  white: ['ଧଳା'],
  'traffic-signal': ['ଟ୍ରାଫିକ୍ ସିଗନାଲ୍', 'traffic-light', 'signal'],
  clock: ['ଘଣ୍ଟା'],
  calendar: ['କ୍ୟାଲେଣ୍ଡର'],
  'water-cycle': ['ଜଳଚକ୍ର'],
  'food-chain': ['ଖାଦ୍ୟ-ଶୃଙ୍ଖଳ'],
  'plant-parts': ['ଉଦ୍ଭିଦ-ଅଙ୍ଗ'],
  'human-body': ['ମାନବ-ଶରୀର'],
  'life-cycle': ['ଜୀବନ-ଚକ୍ର'],
  'family-tree': ['ପରିବାର-ବୃକ୍ଷ'],
}

export async function ensureIndexes(db) {
  const col = db.collection(COL)
  await Promise.all([
    col.createIndex({ concept: 1 }),
    col.createIndex({ aliases: 1 }),
    col.createIndex({ mode: 1, approved: 1 }),
    col.createIndex({ tags: 1 }),
  ])
}

/**
 * Look up an image in the library by concept.
 * Returns the DB record or null.
 */
export async function findImageByConcept(db, rawConcept, { mode = 'illustration' } = {}) {
  const concept = slugify(rawConcept)
  if (!concept) return null

  const col = db.collection(COL)
  // 1) Direct concept slug match
  let doc = await col.findOne({ concept, mode })
  if (doc) return doc

  // 2) Alias match — the input might BE an alias (e.g. Odia word)
  doc = await col.findOne({ aliases: concept, mode })
  if (doc) return doc

  // 3) Builtin-aliases: check if the raw input maps to a known English concept
  for (const [eng, aliases] of Object.entries(BUILTIN_ALIASES)) {
    const aliasSlugs = aliases.map(slugify)
    if (aliasSlugs.includes(concept) || eng === concept) {
      doc = await col.findOne({ concept: eng, mode })
      if (doc) return doc
    }
  }

  return null
}

/**
 * Save a new image record to the library.
 * If the same concept+mode already exists, we update usage stats instead of duplicating.
 */
export async function saveImageToLibrary(db, {
  concept, mode = 'illustration', description, image,
  aliases = [], classHints = [], subjectHints = [], tags = [],
  approved = true, createdBy = 'system',
}) {
  const col = db.collection(COL)
  const cSlug = slugify(concept)
  if (!cSlug) throw new Error('concept required')

  const existing = await col.findOne({ concept: cSlug, mode })
  if (existing) {
    await col.updateOne({ id: existing.id }, {
      $inc: { usageCount: 1 },
      $set: { lastUsedAt: new Date() },
    })
    return existing
  }

  const rec = {
    id: uuidv4(),
    concept: cSlug,
    description: description || null,
    aliases: Array.from(new Set([...aliases, ...(BUILTIN_ALIASES[cSlug] || [])].map(slugify).filter(Boolean))),
    mode,
    classHints: classHints || [],
    subjectHints: subjectHints || [],
    tags: tags || [],
    url: image?.url,
    publicId: image?.publicId,
    width: image?.width,
    height: image?.height,
    provider: image?.provider || 'imagen-3',
    approved: !!approved,
    createdBy,
    createdAt: new Date(),
    updatedAt: new Date(),
    usageCount: 1,
    lastUsedAt: new Date(),
  }
  await col.insertOne(rec)
  return rec
}

/**
 * findOrGenerate — the primary API for assessment builder.
 * Returns { image, cached: bool }. Never throws; on error returns null.
 */
export async function findOrGenerateImage(db, {
  concept, description, mode = 'illustration',
  className, subjectHints = [], aspectRatio = '1:1',
  forceRegenerate = false,
}) {
  try {
    if (!concept) return null
    if (!forceRegenerate) {
      const cached = await findImageByConcept(db, concept, { mode })
      if (cached && cached.url) {
        // Bump usage
        await db.collection(COL).updateOne({ id: cached.id }, { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } })
        return { image: cached, cached: true }
      }
    }
    // Generate new
    const image = await generateEducationalImage({
      concept, description, mode, className, aspectRatio,
    })
    const rec = await saveImageToLibrary(db, {
      concept, mode, description, image,
      classHints: className ? [className] : [],
      subjectHints,
      createdBy: 'auto',
    })
    return { image: rec, cached: false }
  } catch (e) {
    console.warn('[image-library] findOrGenerate failed for', concept, '·', e?.message)
    return null
  }
}

// Batch helper — generate/lookup many concepts in parallel with concurrency cap.
export async function findOrGenerateBatch(db, items = [], opts = {}) {
  const concurrency = Math.max(1, Math.min(6, opts.concurrency || 3))
  const results = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      const it = items[i]
      const r = await findOrGenerateImage(db, {
        concept: it.concept,
        description: it.description,
        mode: it.mode || 'illustration',
        className: opts.className,
        subjectHints: opts.subjectHints || [],
        aspectRatio: opts.aspectRatio || '1:1',
        forceRegenerate: !!opts.forceRegenerate,
      })
      results[i] = r
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results
}
