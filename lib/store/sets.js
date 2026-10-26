// === STORE · UNIT TEST SETS (Phase C) ===
// Shared, server-side logic for the "5 sets per chapter" feature:
//   • dynamic chapter-bundle price (bundle − credit for sets already paid)
//   • chapters-with-sets browse payload
//   • set product-page extras (siblings + bundle)
//   • cart resolver (dedup + dynamic pricing; client never sends prices)
//   • My Library tree (Class → Subject → Chapter → Sets)
// Additive only. Never edits orders, payments, users, lessons or Assessment Store.
import { STORE_COLL as SC } from '@/lib/store/security.js'
import { effectivePrice, isLive } from '@/lib/store/catalog.js'
import { ownsProductDoc } from '@/lib/store/entitlements.js'

const SET_PRICE_FALLBACK = 2

// ---------- ownership context (one cheap pass, reused everywhere) ----------
export async function ownershipCtx(db, user) {
  if (!user) return { directIds: new Set(), packScopes: [], paidPrice: {} }
  const ents = await db.collection(SC.entitlements).find({ userId: user.id, revokedAt: null }).project({ productId: 1 }).toArray()
  const eids = ents.map(e => e.productId)
  const directIds = new Set(eids)
  const packs = eids.length ? await db.collection(SC.products).find({ id: { $in: eids }, type: 'unit_test_pack' }).project({ packScope: 1 }).toArray() : []
  // amount ACTUALLY PAID per product (first paid order wins), for set credit.
  const orders = await db.collection(SC.orders).find({ userId: user.id, status: 'paid' }).project({ items: 1 }).toArray()
  const paidPrice = {}
  for (const o of orders) for (const it of (o.items || [])) { if (paidPrice[it.productId] == null) paidPrice[it.productId] = Number(it.price) || 0 }
  return { directIds, packScopes: packs.map(p => p.packScope).filter(Boolean), paidPrice }
}
function scopeCoversChapter(scope, chapter) {
  if (!scope || !chapter?.unitTest) return false
  if (String(scope.class) !== String(chapter.unitTest.class)) return false
  if (scope.kind === 'class') return true
  if (scope.kind === 'subject') return scope.subjectKey === chapter.unitTest.subjectKey
  return false
}
function chapterOwnedLocal(ctx, chapter) {
  return ctx.directIds.has(chapter.id) || ctx.packScopes.some(s => scopeCoversChapter(s, chapter))
}

// ---------- dynamic chapter-bundle price ----------
// price = max(1, min(bundle − creditForOwnedSets, remainingSets × setPrice)).
// Fully owned (directly / via bundle / via pack) → { fullyOwned:true, price:null }.
export function dynamicBundle(chapter, sets, ctx, chapterOwned) {
  const full = effectivePrice(chapter).price
  const mrp = effectivePrice(chapter).mrp
  const setP = sets.length ? (effectivePrice(sets[0]).price || SET_PRICE_FALLBACK) : SET_PRICE_FALLBACK
  if (chapterOwned) return { fullyOwned: true, price: null, mrp, full, ownedSetCount: sets.length, credit: full, remaining: 0 }
  const ownedDirect = sets.filter(s => ctx.directIds.has(s.id))
  const remaining = sets.filter(s => !ctx.directIds.has(s.id))
  if (remaining.length === 0) return { fullyOwned: true, price: null, mrp, full, ownedSetCount: sets.length, credit: full, remaining: 0 }
  let credit = 0
  for (const s of ownedDirect) credit += (ctx.paidPrice[s.id] != null ? ctx.paidPrice[s.id] : setP)
  const price = Math.max(1, Math.min(full - credit, remaining.length * setP))
  return { fullyOwned: false, price, mrp, full, ownedSetCount: ownedDirect.length, credit, remaining: remaining.length, setPrice: setP }
}

// ---------- chapters + sets (store browse) ----------
export async function chaptersWithSets(db, user, { cls, subjectKey, search }) {
  const qq = { type: 'unit_test', 'unitTest.class': String(cls), 'unitTest.subjectKey': subjectKey, status: 'published', visibility: 'public' }
  if (search) { const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); qq['unitTest.chapterTitle'] = rx }
  const chapters = await db.collection(SC.products).find(qq).sort({ sortOrder: 1, createdAt: 1 }).toArray()
  const chapterIds = chapters.map(c => c.id)
  const allSets = chapterIds.length ? await db.collection(SC.products).find({ type: 'unit_test_set', parentChapterId: { $in: chapterIds }, status: 'published', visibility: 'public' }).sort({ setNo: 1 }).toArray() : []
  const setsByParent = {}
  for (const s of allSets) (setsByParent[s.parentChapterId] ||= []).push(s)
  const ctx = await ownershipCtx(db, user)
  const out = chapters.map(c => {
    const sets = (setsByParent[c.id] || []).sort((a, b) => (a.setNo || 0) - (b.setNo || 0))
    const owned = chapterOwnedLocal(ctx, c)
    const bundle = dynamicBundle(c, sets, ctx, owned)
    return {
      id: c.id, slug: c.slug, chapterTitle: c.unitTest.chapterTitle, language: c.language,
      assessmentsCount: c.unitTest.assessmentsCount, fullMarks: c.unitTest.fullMarks,
      setCount: sets.length, owned,
      bundle, // { fullyOwned, price, mrp, full, ownedSetCount, credit, remaining }
      sets: sets.map(s => ({ id: s.id, slug: s.slug, setNo: s.setNo, pricing: effectivePrice(s), owned: owned || ctx.directIds.has(s.id) })),
    }
  })
  return out
}

// ---------- set product-page extras ----------
export async function setProductExtras(db, user, setProduct) {
  if (setProduct.type !== 'unit_test_set' || !setProduct.parentChapterId) return null
  const chapter = await db.collection(SC.products).findOne({ id: setProduct.parentChapterId })
  if (!chapter) return null
  const sets = await db.collection(SC.products).find({ type: 'unit_test_set', parentChapterId: chapter.id, status: 'published', visibility: 'public' }).sort({ setNo: 1 }).toArray()
  const ctx = await ownershipCtx(db, user)
  const chapterOwned = chapterOwnedLocal(ctx, chapter)
  const bundle = dynamicBundle(chapter, sets, ctx, chapterOwned)
  return {
    setNo: setProduct.setNo,
    chapter: { id: chapter.id, slug: chapter.slug, title: chapter.unitTest?.chapterTitle || chapter.titleEnglish, setCount: sets.length, owned: chapterOwned },
    bundle,
    siblings: sets.map(s => ({ id: s.id, slug: s.slug, setNo: s.setNo, pricing: effectivePrice(s), owned: chapterOwned || ctx.directIds.has(s.id), current: s.id === setProduct.id })),
  }
}

// ---------- cart resolver (dedup + dynamic pricing) ----------
// Returns { lines:[{productId,type,price,mrp,title,titleOdia,setNo,parentChapterId,bundleItems}],
//           groups:[{chapterId,title,setNos,price}], messages:[{text}], subtotal, mrpTotal, ownedChapterIds }
export async function resolveCart(db, user, productIds) {
  const ids = [...new Set((productIds || []).filter(Boolean))]
  const docs = ids.length ? await db.collection(SC.products).find({ id: { $in: ids } }).toArray() : []
  const byId = Object.fromEntries(docs.map(p => [p.id, p]))
  const messages = []
  let keep = docs.filter(p => isLive(p))

  // 1) already owned → drop
  if (user) {
    const kept = []
    for (const p of keep) {
      const owned = await ownsProductDoc(db, user.id, p)
      if (owned && (p.maxPerUser || 1) <= 1) { messages.push({ code: 'owned', productId: p.id, text: 'ଆପଣ ଏହା ଆଗରୁ କିଣିଛନ୍ତି, କାର୍ଟରୁ ହଟାଗଲା' }); continue }
      kept.push(p)
    }
    keep = kept
  }

  const keepIds = new Set(keep.map(p => p.id))
  const classPacks = keep.filter(p => p.type === 'unit_test_pack' && p.packScope?.kind === 'class')
  const subjectPacks = keep.filter(p => p.type === 'unit_test_pack' && p.packScope?.kind === 'subject')
  const chapterBundles = keep.filter(p => p.type === 'unit_test')
  const sets = keep.filter(p => p.type === 'unit_test_set')

  const classSet = new Set(classPacks.map(p => String(p.packScope.class)))
  const subjKeySet = new Set(subjectPacks.map(p => `${p.packScope.class}|${p.packScope.subjectKey}`))

  // 2) pack coverage (class pack beats subject pack; packs beat bundles & sets)
  const removeId = (p, text) => { if (keepIds.has(p.id)) { keepIds.delete(p.id); messages.push({ code: 'covered', productId: p.id, text }) } }
  for (const sp of subjectPacks) if (classSet.has(String(sp.packScope.class))) removeId(sp, 'ଶ୍ରେଣୀ ପ୍ୟାକ୍ ଅଛି — ବିଷୟ ପ୍ୟାକ୍ ହଟାଗଲା')
  for (const ch of chapterBundles) {
    const cls = String(ch.unitTest?.class); const sk = ch.unitTest?.subjectKey
    if (classSet.has(cls) || subjKeySet.has(`${cls}|${sk}`)) removeId(ch, 'ପ୍ୟାକ୍ ଭିତରେ ଅଛି — ଅଧ୍ୟାୟ ହଟାଗଲା')
  }
  // chapter bundles present (after pack cleanup) cover their own sets
  const liveBundleParentIds = new Set(chapterBundles.filter(c => keepIds.has(c.id)).map(c => c.id))
  for (const s of sets) {
    const cls = String(s.unitTest?.class); const sk = s.unitTest?.subjectKey
    if (classSet.has(cls) || subjKeySet.has(`${cls}|${sk}`)) { removeId(s, 'ପ୍ୟାକ୍ ଭିତରେ ଅଛି — ସେଟ୍ ହଟାଗଲା'); continue }
    if (liveBundleParentIds.has(s.parentChapterId)) removeId(s, 'ପୂରା ଅଧ୍ୟାୟ କାର୍ଟରେ ଅଛି — ସେଟ୍ ହଟାଗଲା')
  }

  const ctx = user ? await ownershipCtx(db, user) : { directIds: new Set(), packScopes: [], paidPrice: {} }

  // 3) all-N-sets of a chapter selected individually → switch to the bundle if cheaper/equal
  const setsStill = sets.filter(s => keepIds.has(s.id))
  const setsByParent = {}
  for (const s of setsStill) (setsByParent[s.parentChapterId] ||= []).push(s)
  const addedBundles = []
  for (const [parentId, grp] of Object.entries(setsByParent)) {
    if (liveBundleParentIds.has(parentId)) continue
    const chapter = await db.collection(SC.products).findOne({ id: parentId })
    if (!chapter) continue
    const allSets = await db.collection(SC.products).find({ type: 'unit_test_set', parentChapterId: parentId, status: 'published', visibility: 'public' }).toArray()
    if (allSets.length && grp.length === allSets.length) {
      const chapterOwned = chapterOwnedLocal(ctx, chapter)
      const bundle = dynamicBundle(chapter, allSets, ctx, chapterOwned)
      const sumSets = grp.reduce((a, s) => a + effectivePrice(s).price, 0)
      if (!bundle.fullyOwned && bundle.price <= sumSets) {
        for (const s of grp) keepIds.delete(s.id)
        addedBundles.push({ chapter, bundle })
        messages.push({ code: 'bundle', productId: chapter.id, text: 'ସବୁ ୫ଟି ସେଟ୍ ବଣ୍ଡଲ୍‌ରେ ବଦଳାଗଲା' })
      }
    }
  }

  // 4) price every surviving line
  const lines = []
  for (const p of keep) {
    if (!keepIds.has(p.id)) continue
    if (p.type === 'unit_test') {
      const allSets = await db.collection(SC.products).find({ type: 'unit_test_set', parentChapterId: p.id, status: 'published', visibility: 'public' }).toArray()
      const chapterOwned = chapterOwnedLocal(ctx, p)
      const bundle = dynamicBundle(p, allSets, ctx, chapterOwned)
      if (bundle.fullyOwned) { messages.push({ code: 'owned', productId: p.id, text: 'ଆପଣ ଏହା ଆଗରୁ କିଣିଛନ୍ତି, କାର୍ଟରୁ ହଟାଗଲା' }); continue }
      lines.push({ productId: p.id, slug: p.slug, type: p.type, title: p.titleEnglish, titleOdia: p.titleOdia, price: bundle.price, mrp: bundle.mrp, bundleItems: [], parentChapterId: p.id, isBundle: true, chapterTitle: p.unitTest?.chapterTitle })
    } else {
      const ep = effectivePrice(p)
      lines.push({ productId: p.id, slug: p.slug, type: p.type, title: p.titleEnglish, titleOdia: p.titleOdia, price: ep.price, mrp: ep.mrp, bundleItems: p.bundleItems || [], parentChapterId: p.parentChapterId || null, setNo: p.setNo || null, chapterTitle: p.unitTest?.chapterTitle })
    }
  }
  for (const { chapter, bundle } of addedBundles) {
    lines.push({ productId: chapter.id, slug: chapter.slug, type: 'unit_test', title: chapter.titleEnglish, titleOdia: chapter.titleOdia, price: bundle.price, mrp: bundle.mrp, bundleItems: [], parentChapterId: chapter.id, isBundle: true, chapterTitle: chapter.unitTest?.chapterTitle })
  }

  // 5) group set lines by chapter (for display)
  const groups = []
  const setLinesByParent = {}
  for (const l of lines) if (l.type === 'unit_test_set' && l.parentChapterId) (setLinesByParent[l.parentChapterId] ||= []).push(l)
  for (const [pid, grp] of Object.entries(setLinesByParent)) {
    if (grp.length < 2) continue
    groups.push({ chapterId: pid, chapterTitle: grp[0].chapterTitle, setNos: grp.map(g => g.setNo).sort((a, b) => a - b), price: grp.reduce((a, g) => a + g.price, 0) })
  }

  const subtotal = lines.reduce((a, l) => a + l.price, 0)
  const mrpTotal = lines.reduce((a, l) => a + (l.mrp || l.price), 0)
  return { lines, groups, messages, subtotal, mrpTotal }
}

// ---------- My Library tree ----------
export async function unitTestLibrary(db, user) {
  const ctx = await ownershipCtx(db, user)
  // Owned entitlements (with counters) for direct products
  const ents = await db.collection(SC.entitlements).find({ userId: user.id, revokedAt: null }).toArray()
  const entByProd = Object.fromEntries(ents.map(e => [e.productId, e]))

  // Which (class, subject) to show, and whether via pack
  const subjViaPack = {} // "cls|sk" -> true (owned via subject/class pack)
  for (const s of ctx.packScopes) {
    if (s.kind === 'class') {
      // mark all subjects of the class — resolved when we iterate chapters
      subjViaPack[`${s.class}|*`] = true
    } else if (s.kind === 'subject') subjViaPack[`${s.class}|${s.subjectKey}`] = true
  }

  // Gather candidate chapters: any chapter the user owns (direct), owns a set of, or covered by a pack.
  const ownedChapterIdsDirect = new Set()
  const ownedSetIdsDirect = new Set()
  if (ctx.directIds.size) {
    const dp = await db.collection(SC.products).find({ id: { $in: [...ctx.directIds] } }).project({ id: 1, type: 1, parentChapterId: 1, unitTest: 1 }).toArray()
    for (const p of dp) { if (p.type === 'unit_test') ownedChapterIdsDirect.add(p.id); if (p.type === 'unit_test_set') ownedSetIdsDirect.add(p.id) }
  }
  // set → parent map for directly owned sets
  const parentOfSet = {}
  if (ownedSetIdsDirect.size) {
    const sp = await db.collection(SC.products).find({ id: { $in: [...ownedSetIdsDirect] } }).project({ id: 1, parentChapterId: 1 }).toArray()
    for (const s of sp) parentOfSet[s.id] = s.parentChapterId
  }

  // Build the set of (class|subject) groups to display
  const groupKeys = new Set()
  const packClasses = ctx.packScopes.filter(s => s.kind === 'class').map(s => String(s.class))
  const packSubjects = ctx.packScopes.filter(s => s.kind === 'subject').map(s => `${s.class}|${s.subjectKey}`)
  // chapters owned via direct chapter or direct set
  const directChapterIds = new Set([...ownedChapterIdsDirect, ...Object.values(parentOfSet)])
  let directChapters = []
  if (directChapterIds.size) directChapters = await db.collection(SC.products).find({ id: { $in: [...directChapterIds] } }).toArray()
  for (const c of directChapters) groupKeys.add(`${c.unitTest?.class}|${c.unitTest?.subjectKey}`)
  for (const k of packSubjects) groupKeys.add(k)

  // For pack classes, add every subject that has chapters
  if (packClasses.length) {
    const subjRows = await db.collection(SC.products).aggregate([
      { $match: { type: 'unit_test', 'unitTest.class': { $in: packClasses }, status: { $ne: 'archived' } } },
      { $group: { _id: { cls: '$unitTest.class', sk: '$unitTest.subjectKey' } } },
    ]).toArray()
    for (const r of subjRows) groupKeys.add(`${r._id.cls}|${r._id.sk}`)
  }

  // Subject meta
  const subjDocs = await db.collection('storeUnitSubjects').find({}).toArray().catch(() => [])
  const subjMeta = {}
  for (const s of (subjDocs || [])) subjMeta[`${s.class}|${s.subjectKey}`] = s

  const limitFor = (p) => p.downloadLimit || ({ 1: 10, 2: 5, 3: 3 }[p.securityLevel]) || 5
  const byClass = {}
  for (const key of groupKeys) {
    const [cls, sk] = key.split('|')
    const viaPack = packClasses.includes(cls) || packSubjects.includes(key)
    // all chapters of this subject
    const chapters = await db.collection(SC.products).find({ type: 'unit_test', 'unitTest.class': cls, 'unitTest.subjectKey': sk, status: { $ne: 'archived' } }).sort({ sortOrder: 1, createdAt: 1 }).toArray()
    const chOut = []
    for (const ch of chapters) {
      const chapterOwned = chapterOwnedLocal(ctx, ch)
      const sets = await db.collection(SC.products).find({ type: 'unit_test_set', parentChapterId: ch.id, status: { $ne: 'archived' } }).sort({ setNo: 1 }).toArray()
      const anyOwned = chapterOwned || sets.some(s => ctx.directIds.has(s.id))
      if (!anyOwned) { if (!viaPack) continue } // only show chapters the user has something in (unless pack → show all)
      // chapter bundle file (original PDF)
      const chFiles = await db.collection(SC.files).find({ productId: ch.id }).toArray()
      const bundleFile = chFiles[0] || null
      const chEnt = entByProd[ch.id]
      const setsOut = []
      for (const s of sets) {
        const owned = chapterOwned || ctx.directIds.has(s.id)
        const files = owned ? await db.collection(SC.files).find({ productId: s.id }).toArray() : []
        const f = files[0] || null
        const ent = entByProd[s.id]
        const used = (ent?.downloadsUsed && f ? (ent.downloadsUsed[f.id] || 0) : 0)
        setsOut.push({ setNo: s.setNo, productId: s.id, slug: s.slug, owned, fileId: f?.id || null, left: owned ? Math.max(0, limitFor(s) - used) : null, limit: limitFor(s), pricing: owned ? null : effectivePrice(s) })
      }
      const bundle = dynamicBundle(ch, sets, ctx, chapterOwned)
      chOut.push({
        id: ch.id, slug: ch.slug, title: ch.unitTest?.chapterTitle || ch.titleEnglish,
        fullChapterOwned: chapterOwned, viaPack,
        bundleFileId: chapterOwned && bundleFile ? bundleFile.id : null,
        bundleDownloadsLeft: chapterOwned && bundleFile ? Math.max(0, limitFor(ch) - ((chEnt?.downloadsUsed?.[bundleFile.id]) || 0)) : null,
        bundleLimit: limitFor(ch),
        remaining: bundle.fullyOwned ? 0 : bundle.remaining, remainingPrice: bundle.fullyOwned ? null : bundle.price,
        sets: setsOut,
        createdAt: ch.createdAt,
      })
    }
    if (!chOut.length) continue
    const meta = subjMeta[key] || {}
    byClass[cls] ||= { class: cls, subjects: [] }
    byClass[cls].subjects.push({
      subjectKey: sk, odia: meta.nameOdia || sk, english: meta.nameEnglish || sk, icon: meta.icon || '📘', color: meta.color || null,
      viaPack, chapterCount: chOut.length, setCount: chOut.reduce((a, c) => a + c.sets.filter(s => s.owned).length, 0),
      chapters: chOut.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    })
  }
  const classes = Object.values(byClass).sort((a, b) => (parseInt(a.class) || 0) - (parseInt(b.class) || 0))
  for (const c of classes) c.subjects.sort((a, b) => String(a.odia).localeCompare(String(b.odia)))
  return { classes }
}
