// === TOB === Secure download: PDF-only (generated from stored HTML), per-teacher
// diagonal watermark (~9%), 24h private cache per teacher+item+answers-type,
// server-side purchase check, 10/item/day limit + 50/day admin alert, and a
// page-1 "SAMPLE" image. Signed 10-min links are handled in the route layer.
import crypto from 'node:crypto'
import { fetchAnyBytes, storeRawFile, deleteRaw } from '@/lib/store/storage.js'
import { configureCloudinary } from '@/lib/cloudinary.js'
import { renderHtmlToPdf, pdfAddWatermark, pdfEncrypt } from '@/lib/lesson-plan-security.js'
import { getSellConfig, isClassPaid, ownedSkus, isSetOwned, isChapterOwned, subjectPackSku, classPackSku } from '@/lib/tob/store-sell.js'

const DL = 'tobDownloads'
const ALERT = 'tobAlerts'
const PDF_CACHE = 'tobPdfCache'
const PER_ITEM_DAY = 10
const ALERT_AT = 50

export function skuForItem(it) {
  const S = String(it.subject_id).toUpperCase()
  if (it.type === 'set') return `set:${it.class}:${S}:${it.setCode}:${it.term === 'full' || it.term == null ? 'full' : it.term}`
  if (it.type === 'chapter') return `chapter:${it.class}:${S}:${it.chapterNo}`
  if (it.type === 'register') return `register:${it.class}:${S}`
  return null
}
const nameMax20 = (u) => { const n = String(u?.name || '').trim(); return (n ? n.slice(0, 20) : 'Teacher') }
const last4 = (m) => String(m || '').replace(/\D/g, '').slice(-4) || '0000'

// Remove <div class="answer">…</div> blocks (balanced), for "without answers".
export function removeAnswerBlocks(html) {
  const open = /<div\b[^>]*class=["'][^"']*\banswer\b[^"']*["'][^>]*>/i
  let out = String(html), guard = 0
  while (guard++ < 500) {
    const m = out.match(open); if (!m) break
    const start = m.index, afterOpen = start + m[0].length
    // find matching </div> by depth counting
    let depth = 1, i = afterOpen
    const tag = /<\/?div\b[^>]*>/ig; tag.lastIndex = afterOpen
    let t
    while ((t = tag.exec(out))) { depth += t[0][1] === '/' ? -1 : 1; if (depth === 0) { i = t.index + t[0].length; break } }
    out = out.slice(0, start) + out.slice(i)
  }
  return out
}

function prep(html, { answers }) {
  let out = answers === 'with' ? String(html) : removeAnswerBlocks(String(html))
  out = out.replace(/<\/head>/i, `<style>.toolbar,.print-bar,.dl-bar{display:none!important}</style></head>`)
  return out
}

// ---- 24h private cache (per teacher + item + answers + source version) ----
const CACHE = new Map()
const DAY = 24 * 60 * 60 * 1000
function cacheKey(userId, item, answers) { return `${userId}:${item.id}:${answers}:${new Date(item.updatedAt || 0).getTime()}` }

export async function buildItemPdf(db, item, user, { answers = 'with', orderIdLast6 = '' } = {}) {
  const key = cacheKey(user.id, item, answers)
  const hit = CACHE.get(key)
  if (hit && Date.now() - hit.at < DAY) return hit
  // L2: private R2-backed 24h cache (per teacher+item+answers+version) — survives
  // pod restarts/redeploys. On hit we return the SAME documentId (baked into the
  // PDF footer) so the download log stays consistent.
  try {
    const row = await db.collection(PDF_CACHE).findOne({ key })
    if (row?.ref && Date.now() - new Date(row.at).getTime() < DAY) {
      configureCloudinary()
      const buf = Buffer.from(await fetchAnyBytes(row.ref))
      const result = { buf, documentId: row.documentId, at: new Date(row.at).getTime() }
      CACHE.set(key, result)
      return result
    }
  } catch (_) { /* cache miss / unreadable → regenerate below */ }
  if (!item?.htmlRef) throw new Error('No source file stored for this item')
  configureCloudinary()
  const raw = Buffer.from(await fetchAnyBytes(item.htmlRef)).toString('utf-8')
  const html = prep(raw, { answers })
  const orientation = item.type === 'register' ? 'landscape' : 'portrait'
  const base = await renderHtmlToPdf(html, { orientation, margin: '8mm' })
  const documentId = `LG-TOB-${_ymd()}-${_rand(6)}`
  const caption = `Lesson Guru Odisha · ${nameMax20(user)} · ${last4(user?.mobile)} · ${new Date().toISOString().slice(0, 10)}`
  const footer = `Licensed to ${nameMax20(user)} — sharing not allowed · ${String(orderIdLast6 || documentId).slice(-6)}`
  let out = base
  try { out = await pdfAddWatermark(base, { caption, footerCaption: footer, brandOn: true, userOn: true }) } catch (_) {}
  try { out = await pdfEncrypt(out, { allowPrint: true }) } catch (_) {}
  const result = { buf: out, documentId, at: Date.now() }
  CACHE.set(key, result)
  if (CACHE.size > 60) { const o = [...CACHE.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (o) CACHE.delete(o[0]) }
  // Persist to private R2 (best-effort) so it survives redeploys.
  try {
    const ref = await storeRawFile(out, { folder: 'lg-tob/pdf-cache', format: 'pdf', tags: ['lg-tob', 'pdfcache', `class-${item.class}`] })
    if (ref) {
      const prev = await db.collection(PDF_CACHE).findOne({ key })
      if (prev?.ref && JSON.stringify(prev.ref) !== JSON.stringify(ref)) { try { await deleteRaw(prev.ref) } catch (_) {} }
      await db.collection(PDF_CACHE).updateOne({ key }, { $set: { key, ref, documentId, at: new Date(), itemId: item.id, userId: user.id, answers } }, { upsert: true })
    }
  } catch (_) { /* storage optional */ }
  return result
}

// Page-1 image (teaser — no purchase check) with TWO big diagonal watermarks:
// "SAMPLE" + "Lesson Guru Odisha". Rendered at LOWER resolution (readable on a
// phone, not print-quality) and NO teacher name. Uses the SAME HTML + chromium
// engine as the paid PDF so if PDFs render, the sample renders identically.
const SAMPLE_W = 760, SAMPLE_H = 1075, SAMPLE_SCALE = 0.9
export async function buildSampleImage(db, item) {
  if (!item?.htmlRef) throw new Error('No source file stored')
  configureCloudinary()
  const raw = Buffer.from(await fetchAnyBytes(item.htmlRef)).toString('utf-8')
  const overlay = `<style>.toolbar,.print-bar,.dl-bar{display:none!important}
    .lg-wm-sample{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;
      transform:rotate(-28deg);z-index:999999;pointer-events:none}
    .lg-wm-sample .a{font:900 118px 'Arial',sans-serif;color:rgba(201,58,34,.16);letter-spacing:10px}
    .lg-wm-sample .b{font:800 40px 'Arial',sans-serif;color:rgba(36,26,94,.16);letter-spacing:4px;white-space:nowrap}</style>`
  const mark = `<div class="lg-wm-sample" aria-hidden="true"><div class="a">SAMPLE</div><div class="b">Lesson Guru Odisha</div></div>`
  let html = raw.replace(/<\/head>/i, `${overlay}</head>`)
  html = /<body[^>]*>/i.test(html) ? html.replace(/(<body[^>]*>)/i, `$1${mark}`) : (html + mark)
  const puppeteer = (await import('puppeteer')).default
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || (await _chromium())
  const browser = await puppeteer.launch({ headless: 'new', executablePath, args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: SAMPLE_W, height: SAMPLE_H, deviceScaleFactor: SAMPLE_SCALE })
    page.setDefaultTimeout(60000)
    // networkidle0 waits for images/fonts/async content to settle so the page
    // isn't screenshotted mid-paint (the Set-A "blank sample" cause). Falls back
    // to a plain 'load' if the page keeps a connection open past the timeout.
    try { await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45000 }) }
    catch (_) { try { await page.setContent(html, { waitUntil: 'load', timeout: 20000 }) } catch (_) {} }
    try { await Promise.race([page.evaluate(() => document.fonts && document.fonts.ready), new Promise(r => setTimeout(r, 4000))]) } catch (_) {}
    // Wait until the page has actually painted real content (text-heavy sheets).
    try { await page.waitForFunction(() => { const b = document.body; return b && (b.innerText || '').replace(/\s+/g, '').length > 20 && b.scrollHeight > 200 }, { timeout: 8000 }) } catch (_) {}
    // Guard: never return/cache a blank render. If the page produced no visible
    // text, throw so getOrBuildSample records sampleError instead of caching blank.
    const textLen = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, '').length).catch(() => 0)
    // Compressed JPEG (~100–200 KB) so the popup loads fast on phones.
    const png = Buffer.from(await page.screenshot({ type: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: SAMPLE_W, height: SAMPLE_H } }))
    if (textLen < 20 || png.length < 3000) throw new Error(`Blank render (text=${textLen} chars, img=${png.length}B) — content did not paint`)
    return png
  } finally { try { await browser.close() } catch (_) {} }
}

// --- Private sample cache (R2/Cloudinary via storeRawFile; survives redeploys) ---
// Each item stores { sampleRef, sampleVersion, sampleAt } + { sampleError } on
// failure. Version = item.updatedAt epoch so a re-import invalidates the cache.
const sampleVer = (item) => new Date(item?.updatedAt || item?.createdAt || 0).getTime()

// Return cached PNG bytes if fresh, else build+store and return. force=true
// always re-renders. Throws on render/storage failure (after logging the error
// on the item so the admin Files tab can surface it).
export async function getOrBuildSample(db, item, { force = false } = {}) {
  const ver = sampleVer(item)
  if (!force && item?.sampleRef && item?.sampleVersion === ver) {
    try { return { buf: Buffer.from(await fetchAnyBytes(item.sampleRef)), cached: true } }
    catch (_) { /* stale/broken ref → rebuild below */ }
  }
  try {
    const buf = await buildSampleImage(db, item)
    let ref = null
    try { configureCloudinary(); ref = await storeRawFile(buf, { folder: 'lg-tob/sample', format: 'jpg', tags: ['lg-tob', 'sample', `class-${item.class}`] }) } catch (e) { /* storage optional */ }
    const set = { sampleVersion: ver, sampleAt: new Date(), sampleError: null }
    if (ref) {
      // delete the previous object (best-effort) before swapping the ref
      if (item.sampleRef && JSON.stringify(item.sampleRef) !== JSON.stringify(ref)) { try { await deleteRaw(item.sampleRef) } catch (_) {} }
      set.sampleRef = ref
    }
    await db.collection(TOB_ITEMS).updateOne({ id: item.id }, { $set: set })
    return { buf, cached: false, stored: !!ref }
  } catch (e) {
    const msg = String(e?.message || e)
    try { await db.collection(TOB_ITEMS).updateOne({ id: item.id }, { $set: { sampleError: msg, sampleErrorAt: new Date() } }) } catch (_) {}
    throw e
  }
}

const TOB_ITEMS = 'tobItems'

// === Background sample pre-generation ===================================
// A sample is "fresh" when its cached ref matches the item's current version.
export function isSampleFresh(item) {
  return !!(item?.sampleRef && item?.sampleVersion === sampleVer(item))
}
// Simple in-process queue (concurrency-limited) so imports never block on
// puppeteer and the server isn't overloaded. A cron sweep is the backstop that
// survives redeploys and catches anything still pending.
const _sampleQ = new Map()   // id -> item
let _draining = 0
const _SAMPLE_CONCURRENCY = 2
export function enqueueSamples(db, items = []) {
  for (const it of items) {
    if (!it || _sampleQ.has(it.id)) continue
    if (it.type !== 'set' && it.type !== 'chapter') continue
    if (isSampleFresh(it)) continue
    _sampleQ.set(it.id, it)
  }
  for (let i = _draining; i < _SAMPLE_CONCURRENCY; i++) _drainSamples(db)
  return { queued: _sampleQ.size }
}
async function _drainSamples(db) {
  _draining++
  try {
    while (_sampleQ.size) {
      const [id, it] = _sampleQ.entries().next().value
      _sampleQ.delete(id)
      try { await getOrBuildSample(db, it, { force: false }) } catch (_) { /* error already logged on item */ }
    }
  } finally { _draining-- }
}
// Find published set/chapter items whose sample is missing/stale (skipping ones
// that errored very recently) and enqueue a small batch. Used by the cron.
export async function sweepPendingSamples(db, { class: cls, subject, limit = 8 } = {}) {
  const q = { type: { $in: ['set', 'chapter'] }, status: 'published' }
  if (cls) q.class = String(cls)
  if (subject) q.subject_id = String(subject).toUpperCase()
  const rows = await db.collection(TOB_ITEMS).find(q, { projection: { id: 1, class: 1, subject_id: 1, type: 1, chapterNo: 1, setCode: 1, title: 1, htmlRef: 1, updatedAt: 1, createdAt: 1, sampleRef: 1, sampleVersion: 1, sampleError: 1, sampleErrorAt: 1 } }).toArray()
  const cutoff = Date.now() - 10 * 60 * 1000   // retry errored items after 10 min
  const pending = rows.filter(it => !isSampleFresh(it) && !(it.sampleError && it.sampleErrorAt && new Date(it.sampleErrorAt).getTime() > cutoff))
  const batch = pending.slice(0, limit)
  enqueueSamples(db, batch)
  return { scanned: rows.length, pending: pending.length, queued: batch.length }
}
// Admin progress for the Files view: "Samples: ready/total".
export async function sampleProgress(db, { class: cls, subject } = {}) {
  const q = { type: { $in: ['set', 'chapter'] }, status: 'published' }
  if (cls) q.class = String(cls)
  if (subject) q.subject_id = String(subject).toUpperCase()
  const rows = await db.collection(TOB_ITEMS).find(q, { projection: { updatedAt: 1, createdAt: 1, sampleRef: 1, sampleVersion: 1, sampleError: 1 } }).toArray()
  let ready = 0, failed = 0
  for (const it of rows) { if (isSampleFresh(it)) ready++; else if (it.sampleError) failed++ }
  const total = rows.length
  return { total, ready, failed, pending: total - ready - failed, building: _sampleQ.size }
}

// Regenerate samples for every published set/chapter in a class+subject.
// Time-budgeted (under the 60s proxy limit) so it never hangs an admin request
// and always returns a result. By default it is INCREMENTAL: items that already
// have a fresh non-blank sample return from cache instantly, so repeat clicks
// make cumulative progress (and blanks — which are never cached — get rebuilt).
// Pass force=true to re-render everything from scratch.
export async function regenerateSamples(db, { class: cls, subject, force = false, budgetMs = 55000 } = {}) {
  const S = String(subject || '').toUpperCase()
  const items = await db.collection(TOB_ITEMS).find({ class: String(cls), subject_id: S, type: { $in: ['set', 'chapter'] }, status: 'published' }).toArray()
  const started = Date.now()
  let ok = 0, failed = 0, skipped = 0
  const errors = []
  for (const it of items) {
    if (Date.now() - started > budgetMs) { skipped++; continue }
    try { await getOrBuildSample(db, it, { force }); ok++ }
    catch (e) { failed++; errors.push({ id: it.id, title: it.title, error: String(e?.message || e) }) }
  }
  return { class: String(cls), subject: S, total: items.length, ok, failed, skipped, errors }
}

// Admin "Health check" — make ONE sample + ONE PDF on the current server and
// report OK/error + timings + the resolved chromium path. Picks any published
// item (falls back to any item) for the given class+subject if provided.
export async function healthCheck(db, me, { class: cls, subject } = {}) {
  const S = subject ? String(subject).toUpperCase() : null
  const baseQ = { type: { $in: ['set', 'chapter'] }, htmlRef: { $ne: null }, status: { $ne: 'trashed' } }
  const q = { ...baseQ, ...(cls ? { class: String(cls) } : {}), ...(S ? { subject_id: S } : {}) }
  let item = await db.collection(TOB_ITEMS).findOne({ ...q, status: 'published' }) || await db.collection(TOB_ITEMS).findOne(q) || await db.collection(TOB_ITEMS).findOne(baseQ)
  const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || (await _chromium()) || '(puppeteer default)'
  const out = { chromiumPath, item: item ? { id: item.id, title: item.title, class: item.class, subject_id: item.subject_id } : null, sample: null, pdf: null }
  if (!item) { out.sample = { ok: false, error: 'No item with a stored source file found' }; out.pdf = { ok: false, error: 'No item found' }; return out }
  // sample
  let t = Date.now()
  try { const buf = await buildSampleImage(db, item); out.sample = { ok: true, ms: Date.now() - t, bytes: buf.length } }
  catch (e) { out.sample = { ok: false, ms: Date.now() - t, error: String(e?.message || e) } }
  // pdf (use admin as the "user")
  t = Date.now()
  try { const { buf } = await buildItemPdf(db, item, { id: me?.id || 'health', name: me?.name || 'Admin', mobile: me?.mobile || '' }, { answers: 'with' }); out.pdf = { ok: true, ms: Date.now() - t, bytes: buf.length } }
  catch (e) { out.pdf = { ok: false, ms: Date.now() - t, error: String(e?.message || e) } }
  return out
}

// Does this teacher own the item? (direct sku, subject pack, or class pack)
export async function userOwnsItem(db, userId, item) {
  if (!userId) return false
  const owned = await ownedSkus(db, userId)
  const S = String(item.subject_id).toUpperCase()
  if (owned.has(subjectPackSku(item.class, S)) || owned.has(classPackSku(item.class))) return true
  if (item.type === 'set') return isSetOwned(owned, item.class, S, item.setCode, item.term)
  if (item.type === 'chapter') return isChapterOwned(owned, item.class, S, item.chapterNo)
  if (item.type === 'register') return owned.has(subjectPackSku(item.class, S)) || owned.has(classPackSku(item.class))
  return false
}

// Can this teacher download? Admin & free-class → yes (still watermark+log).
export async function canDownload(db, user, item) {
  if (user?.role === 'admin') return { ok: true, reason: 'admin' }
  const cfg = await getSellConfig(db)
  if (!isClassPaid(cfg, item.class)) return { ok: true, reason: 'free' } // paid OFF/keep-free: still watermark+log
  const owns = await userOwnsItem(db, user.id, item)
  return owns ? { ok: true, reason: 'owned' } : { ok: false, reason: 'not-purchased' }
}

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
// 10 downloads/item/teacher/day. Returns {ok, count}.
export async function checkRateLimit(db, userId, sku) {
  const count = await db.collection(DL).countDocuments({ userId, sku, at: { $gte: startOfToday() } })
  return { ok: count < PER_ITEM_DAY, count, limit: PER_ITEM_DAY }
}

export async function logDownload(db, { user, item, sku, answers, ip, documentId }) {
  await db.collection(DL).insertOne({ id: _rand(16), userId: user.id, teacher: user.name || '', sku, class: String(item.class), subject_id: String(item.subject_id).toUpperCase(), itemId: item.id, answers, documentId, ip: ip || '', at: new Date() })
  // 50/day admin alert (once per teacher per day)
  const today = await db.collection(DL).countDocuments({ userId: user.id, at: { $gte: startOfToday() } })
  if (today >= ALERT_AT) {
    const ymd = new Date().toISOString().slice(0, 10)
    await db.collection(ALERT).updateOne({ type: 'high-downloads', userId: user.id, ymd }, { $set: { type: 'high-downloads', userId: user.id, teacher: user.name || '', ymd, count: today, at: new Date() } }, { upsert: true })
  }
}

export async function adminAlerts(db, limit = 50) {
  return db.collection(ALERT).find({}).sort({ at: -1 }).limit(limit).toArray()
}

function _ymd() { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` }
function _rand(n) { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const b = crypto.randomBytes(n); let s = ''; for (let i = 0; i < n; i++) s += a[b[i] % a.length]; return s }
async function _chromium() { const fs = await import('node:fs/promises'); for (const p of ['/root/bin/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome']) { try { await fs.access(p); return p } catch (_) {} } return undefined }
