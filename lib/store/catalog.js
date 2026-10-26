// === STORE === catalog: categories, products (all types), pricing, previews.
import { v4 as uuidv4 } from 'uuid'
import { STORE_COLL } from '@/lib/store/security.js'

export const PRODUCT_TYPES = ['answer_key', 'assessment_paper', 'pdf', 'excel', 'html', 'zip', 'bundle', 'printed_order']

export function slugify(s) {
  return String(s || 'product').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'product'
}
export async function ensureUniqueSlug(db, base, excludeId = null) {
  let slug = slugify(base)
  const short = uuidv4().slice(0, 4)
  const q = { slug, ...(excludeId ? { id: { $ne: excludeId } } : {}) }
  const exists = await db.collection(STORE_COLL.products).findOne(q)
  if (exists) slug = `${slug}-${short}`
  return slug
}

// ---------------- Categories ----------------
export async function listCategories(db, { includeHidden = false } = {}) {
  const q = includeHidden ? {} : { active: { $ne: false } }
  return db.collection(STORE_COLL.categories).find(q).sort({ sortOrder: 1, createdAt: 1 }).toArray()
}
export async function upsertCategory(db, body) {
  const now = new Date()
  if (body.id) {
    const { id, ...rest } = body
    await db.collection(STORE_COLL.categories).updateOne({ id }, { $set: { ...rest, updatedAt: now } })
    return db.collection(STORE_COLL.categories).findOne({ id })
  }
  const doc = {
    id: uuidv4(), nameOdia: body.nameOdia || '', nameEnglish: body.nameEnglish || 'Category',
    slug: slugify(body.nameEnglish || 'category'), icon: body.icon || '📦', color: body.color || '#241a5e',
    sortOrder: Number(body.sortOrder) || 0, active: body.active !== false, createdAt: now, updatedAt: now,
  }
  await db.collection(STORE_COLL.categories).insertOne(doc)
  return doc
}
export async function seedCategories(db) {
  const seed = [
    { nameEnglish: 'Answer Keys', nameOdia: 'ଉତ୍ତର ସୂଚୀ', icon: '🔑', color: '#e8452c', sortOrder: 1 },
    { nameEnglish: 'Assessment Papers', nameOdia: 'ପରୀକ୍ଷା ପତ୍ର', icon: '📝', color: '#241a5e', sortOrder: 2 },
    { nameEnglish: 'Worksheets', nameOdia: 'ଓୟାର୍କସିଟ୍', icon: '✏️', color: '#1fa2d9', sortOrder: 3 },
    { nameEnglish: 'Registers & Excel Sheets', nameOdia: 'ରେଜିଷ୍ଟର', icon: '📊', color: '#2a9d5c', sortOrder: 4 },
    { nameEnglish: 'Teacher Resources', nameOdia: 'ଶିକ୍ଷକ ସମ்ବଳ', icon: '📚', color: '#f7b32b', sortOrder: 5 },
    { nameEnglish: 'Bundles & Combos', nameOdia: 'ବଣ்ଡଲ', icon: '🎁', color: '#d6336c', sortOrder: 6 },
  ]
  let created = 0
  for (const s of seed) {
    const ex = await db.collection(STORE_COLL.categories).findOne({ nameEnglish: s.nameEnglish })
    if (!ex) { await upsertCategory(db, s); created++ }
  }
  return created
}

// ---------------- Pricing ----------------
export function isPremiumUser(user) {
  const s = user?.subscription
  return !!s && s.status === 'active' && s.plan && !['free', 'none'].includes(s.plan) && (!s.expiryDate || new Date(s.expiryDate) > new Date())
}
export function effectivePrice(product, user) {
  const now = Date.now()
  const mrp = Math.max(0, Number(product.mrpInr) || 0)
  let sell = Math.max(0, Number(product.priceInr) || 0)
  let launchActive = false, launchEndsAt = null
  if (product.launchPriceInr != null && product.launchPriceInr !== '' &&
      product.launchStart && product.launchEnd &&
      new Date(product.launchStart).getTime() <= now && now <= new Date(product.launchEnd).getTime()) {
    sell = Math.max(0, Number(product.launchPriceInr) || 0); launchActive = true; launchEndsAt = product.launchEnd
  }
  let final = sell, premiumApplied = false
  if (isPremiumUser(user) && product.premiumPriceInr != null && product.premiumPriceInr !== '' && Number(product.premiumPriceInr) < sell) {
    final = Math.max(0, Number(product.premiumPriceInr)); premiumApplied = true
  }
  const savings = mrp > final ? mrp - final : 0
  const discountPct = mrp > 0 && mrp > final ? Math.round((savings / mrp) * 100) : 0
  return { mrp, price: final, sell, launchActive, launchEndsAt, premiumApplied, savings, discountPct, free: final === 0 }
}

// ---------------- Products ----------------
export async function createProduct(db, body, adminUser) {
  const now = new Date()
  const slug = await ensureUniqueSlug(db, body.slug || body.titleEnglish || 'product')
  const doc = {
    id: uuidv4(), slug,
    type: PRODUCT_TYPES.includes(body.type) ? body.type : 'pdf',
    categoryId: body.categoryId || null,
    titleOdia: body.titleOdia || '', titleEnglish: body.titleEnglish || 'Untitled',
    shortDesc: body.shortDesc || '', fullDesc: body.fullDesc || '', whatsInside: Array.isArray(body.whatsInside) ? body.whatsInside : [],
    classes: Array.isArray(body.classes) ? body.classes.map(String) : [], subject: body.subject || '', paper: body.paper || '', exam: body.exam || '',
    language: body.language || 'odia', tags: Array.isArray(body.tags) ? body.tags : [],
    coverUrl: body.coverUrl || null, coverAuto: body.coverAuto !== false,
    previewMode: ['blurred', 'sample', 'first_free'].includes(body.previewMode) ? body.previewMode : 'blurred',
    previewRefs: [],
    securityLevel: Math.min(4, Math.max(1, Number(body.securityLevel) || 2)),
    downloadLimit: Number(body.downloadLimit) || null, printAllowed: !!body.printAllowed,
    mrpInr: Number(body.mrpInr) || 0, priceInr: Number(body.priceInr) || 0,
    launchPriceInr: body.launchPriceInr === '' || body.launchPriceInr == null ? null : Number(body.launchPriceInr),
    launchStart: body.launchStart || null, launchEnd: body.launchEnd || null,
    premiumPriceInr: body.premiumPriceInr === '' || body.premiumPriceInr == null ? null : Number(body.premiumPriceInr),
    status: ['draft', 'published', 'scheduled', 'archived'].includes(body.status) ? body.status : 'draft',
    publishAt: body.publishAt || null,
    visibility: body.visibility === 'link_only' ? 'link_only' : 'public',
    featured: !!body.featured, sortOrder: Number(body.sortOrder) || 0,
    maxPerUser: Number(body.maxPerUser) || 1,
    bundleItems: Array.isArray(body.bundleItems) ? body.bundleItems : [],
    salesCount: 0, ratingAvg: 0, ratingCount: 0,
    createdAt: now, updatedAt: now, createdBy: adminUser?.id || null,
  }
  await db.collection(STORE_COLL.products).insertOne(doc)
  return doc
}

export async function updateProduct(db, id, body, adminUser) {
  const cur = await db.collection(STORE_COLL.products).findOne({ id })
  if (!cur) return null
  const set = { updatedAt: new Date() }
  const fields = ['type', 'categoryId', 'titleOdia', 'titleEnglish', 'shortDesc', 'fullDesc', 'whatsInside', 'classes', 'subject', 'paper', 'exam', 'language', 'tags', 'coverUrl', 'coverAuto', 'previewMode', 'securityLevel', 'downloadLimit', 'printAllowed', 'status', 'publishAt', 'visibility', 'featured', 'sortOrder', 'maxPerUser', 'bundleItems']
  for (const f of fields) if (body[f] !== undefined) set[f] = body[f]
  if (body.classes !== undefined) set.classes = (body.classes || []).map(String)
  if (body.securityLevel !== undefined) set.securityLevel = Math.min(4, Math.max(1, Number(body.securityLevel) || 2))
  // price changes -> history + saved on new orders only (orders keep their own copy)
  for (const pf of ['mrpInr', 'priceInr', 'launchPriceInr', 'premiumPriceInr']) {
    if (body[pf] !== undefined) {
      const newVal = body[pf] === '' || body[pf] == null ? null : Number(body[pf])
      if (newVal !== (cur[pf] ?? null)) {
        await logPriceChange(db, { productId: id, field: pf, oldValue: cur[pf] ?? null, newValue: newVal, adminId: adminUser?.id || null })
      }
      set[pf] = newVal
    }
  }
  for (const df of ['launchStart', 'launchEnd']) if (body[df] !== undefined) set[df] = body[df] || null
  await db.collection(STORE_COLL.products).updateOne({ id }, { $set: set })
  return db.collection(STORE_COLL.products).findOne({ id })
}

export async function logPriceChange(db, { productId, field, oldValue, newValue, adminId }) {
  await db.collection(STORE_COLL.priceHistory).insertOne({ id: uuidv4(), productId, field, oldValue, newValue, adminId, at: new Date() })
}

export async function getProductById(db, id) { return db.collection(STORE_COLL.products).findOne({ id }) }
export async function getProductBySlug(db, slug) { return db.collection(STORE_COLL.products).findOne({ slug }) }

// Published & visible for listing. Scheduled products become listable at publishAt.
function publishedMatch() {
  return { $or: [ { status: 'published' }, { status: 'scheduled', publishAt: { $lte: new Date() } } ] }
}
export function isLive(product) {
  if (!product) return false
  if (product.status === 'published') return true
  if (product.status === 'scheduled' && product.publishAt && new Date(product.publishAt) <= new Date()) return true
  return false
}

export async function listProducts(db, filters = {}) {
  const q = { ...publishedMatch(), visibility: 'public' }
  if (filters.categoryId) q.categoryId = filters.categoryId
  if (filters.type) q.type = filters.type
  if (filters.exam) q.exam = filters.exam
  if (filters.subject) q.subject = filters.subject
  if (filters.cls) q.classes = String(filters.cls)
  if (filters.featured) q.featured = true
  const and = []
  if (filters.q) {
    const rx = new RegExp(String(filters.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    and.push({ $or: [{ titleEnglish: rx }, { titleOdia: rx }, { subject: rx }, { exam: rx }, { tags: rx }] })
  }
  if (and.length) q.$and = and
  let cursor = db.collection(STORE_COLL.products).find(q)
  const sort = filters.sort === 'newest' ? { createdAt: -1 }
    : filters.sort === 'price_asc' ? { priceInr: 1 }
    : filters.sort === 'price_desc' ? { priceInr: -1 }
    : { salesCount: -1, createdAt: -1 } // popular
  cursor = cursor.sort(sort).limit(Math.min(200, Number(filters.limit) || 60))
  let rows = await cursor.toArray()
  // price-range / free filter (after effective price)
  if (filters.freeOnly || filters.priceMin != null || filters.priceMax != null) {
    rows = rows.filter(p => {
      const ep = effectivePrice(p, null)
      if (filters.freeOnly && !ep.free) return false
      if (filters.priceMin != null && ep.price < Number(filters.priceMin)) return false
      if (filters.priceMax != null && ep.price > Number(filters.priceMax)) return false
      return true
    })
  }
  return rows
}

// Marketing view — NEVER includes file publicIds / Cloudinary URLs.
export function publicProductView(product, user, { owned = false, fileMeta = [] } = {}) {
  const ep = effectivePrice(product, user)
  return {
    id: product.id, slug: product.slug, type: product.type, categoryId: product.categoryId,
    titleOdia: product.titleOdia, titleEnglish: product.titleEnglish,
    shortDesc: product.shortDesc, fullDesc: product.fullDesc, whatsInside: product.whatsInside,
    classes: product.classes, subject: product.subject, paper: product.paper, exam: product.exam,
    language: product.language, tags: product.tags, coverUrl: product.coverUrl,
    previewMode: product.previewMode, previewCount: (product.previewRefs || []).length,
    securityLevel: product.securityLevel, printAllowed: product.printAllowed,
    pricing: ep, bundleItems: product.bundleItems || [],
    featured: product.featured, visibility: product.visibility, maxPerUser: product.maxPerUser,
    salesCount: product.salesCount || 0, ratingAvg: product.ratingAvg || 0, ratingCount: product.ratingCount || 0,
    files: fileMeta, owned,
    coverUrl: product.coverCustomUrl || product.cover?.url || null,
    coverThumbUrl: product.coverCustomUrl || product.cover?.thumbUrl || product.cover?.url || null,
    coverOgUrl: product.coverCustomUrl || product.cover?.ogUrl || null,
    createdAt: product.createdAt,
  }
}

export async function computeBundleSavings(db, bundleItems, user) {
  let separately = 0
  const prods = await db.collection(STORE_COLL.products).find({ id: { $in: bundleItems || [] } }).toArray()
  for (const p of prods) separately += effectivePrice(p, user).price
  return { separately, count: prods.length, products: prods }
}
