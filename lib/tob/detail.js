// === TOB === Teacher Observation — task/project DETAIL resolver.
// Re-parses the archived source HTML on demand to extract the rich body of a
// single task (Part A) or project (Part B), so detail pages can render the
// exact source (tables / word boxes / answer lines / step timeline / oral
// questions) without changing the parser or re-importing. Reads only `tob*`
// data. Pure-ish (one storage fetch); never mutates anything.
import * as cheerio from 'cheerio'
import { fetchAnyBytes } from '@/lib/store/storage.js'
import { configureCloudinary } from '@/lib/cloudinary.js'
import { TOB_COLL } from '@/lib/tob/store.js'
import { TOB_FRAMEWORK, frameworkFor } from '@/lib/tob/validate.js'
import { isCurrentlyActive } from '@/lib/plan-pricing.js'

const clean = (t) => String(t || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()

// ---------- slug helpers (readable, shareable URLs) ----------
export const SUBJECT_SLUGS = { OD: 'odia', E: 'english', H: 'hindi', S: 'sanskrit', MATH: 'math', EV: 'evs', SC: 'science', SS: 'social' }
const SLUG_TO_SUBJECT = Object.fromEntries(Object.entries(SUBJECT_SLUGS).map(([k, v]) => [v, k]))
export const subjectSlug = (id) => SUBJECT_SLUGS[String(id || '').toUpperCase()] || String(id || '').toLowerCase()
export const subjectFromSlug = (s) => SLUG_TO_SUBJECT[String(s || '').toLowerCase()] || String(s || '').toUpperCase()
export const classSlug = (c) => `class-${String(c || '').toLowerCase()}`
export const classFromSlug = (s) => String(s || '').replace(/^class-/i, '')
export const chapterSlug = (n) => `ch-${String(n).padStart(2, '0')}`
export const chapterFromSlug = (s) => parseInt(String(s || '').replace(/[^0-9]/g, ''), 10) || null
export const setSlug = (code) => `set-${String(code || '').toLowerCase()}`
export const setFromSlug = (s) => String(s || '').replace(/^set-/i, '').toUpperCase()
export const termFromSlug = (s) => (String(s || '').match(/([12])/) || [, 1])[1] * 1

// Parse the catch-all slug array → canonical params.
// [class-4, odia, ch-01, task, 1]
// [class-4, odia, set-a, term-1, project, 1]
export function parseSlug(parts = []) {
  const p = parts.map(x => String(x || '').toLowerCase())
  const out = { class: '', subject: '', chapterNo: null, setCode: null, term: null, part: null, pos: 1 }
  if (p[0]) out.class = classFromSlug(p[0])
  if (p[1]) out.subject = subjectFromSlug(p[1])
  let i = 2
  if (p[i] && p[i].startsWith('ch-')) { out.chapterNo = chapterFromSlug(p[i]); i++ }
  else if (p[i] && p[i].startsWith('set-')) { out.setCode = setFromSlug(p[i]); i++; if (p[i] && p[i].startsWith('term-')) { out.term = termFromSlug(p[i]); i++ } }
  if (p[i] === 'task' || p[i] === 'project') { out.part = p[i] === 'project' ? 'B' : 'A'; i++ }
  if (p[i]) out.pos = parseInt(p[i], 10) || 1
  if (out.chapterNo && !out.term) out.term = null // term derived from the item for chapters
  return out
}

// Build the canonical detail href for a card (used by the item list + prev/next).
export function detailHref({ class: cls, subject_id, type, chapterNo, setCode, term, part, pos }) {
  const base = `/teacher-observation/${classSlug(cls)}/${subjectSlug(subject_id)}`
  const kind = part === 'B' ? 'project' : 'task'
  if (type === 'set') return `${base}/${setSlug(setCode)}/term-${term || 1}/${kind}/${pos}`
  return `${base}/${chapterSlug(chapterNo)}/${kind}/${pos}`
}

// ---------- item lookup ----------
export async function resolveItem(db, { class: cls, subject, chapterNo, setCode }, { includeDraft = false } = {}) {
  const m = { class: String(cls), subject_id: String(subject).toUpperCase(), ...(includeDraft ? {} : { status: 'published' }) }
  if (setCode) { m.type = 'set'; m.setCode = String(setCode).toUpperCase() }
  else { m.type = 'chapter'; m.chapterNo = Number(chapterNo) }
  return db.collection(TOB_COLL.items).findOne(m)
}

// ---------- access ----------
// Header + LO strip + the task/project CARD are visible to everyone (shareable).
// Answers, teacher notes and downloads follow: admin / premium, else the free
// sample = first chapter OR Set A (unless the tool is set to "nobody").
export function canSeeFull(item, me, settings) {
  if (me?.role === 'admin') return true
  if (isCurrentlyActive(me)) return true
  if (settings?.viewAudience === 'nobody') return false
  if (item.type === 'chapter' && Number(item.chapterNo) === 1) return true
  if (item.type === 'set' && String(item.setCode).toUpperCase() === 'A') return true
  return false
}

// ---------- card body extraction ----------
const BLOCK_KEYS = [
  [/ନିର୍ଦ୍ଦେଶ/, 'instructions'],
  [/ଲିଖିତ କାର୍ଯ୍ୟ|କାର୍ଯ୍ୟ$/, 'task'],
  [/ଉତ୍ତର ଲେଖିବା|ଲେଖିବା ସ୍ଥାନ/, 'writing'],
  [/ଉତ୍ତର/, 'answer'],
  [/ପର୍ଯ୍ୟବେକ୍ଷଣ ତାଲିକା/, 'checklist'],
  [/ମନ୍ତବ୍ୟ/, 'teacherNote'],
  [/ଉଦ୍ଦେଶ୍ୟ/, 'objective'],
  [/ସାମଗ୍ରୀ/, 'materials'],
  [/ପ୍ରଣାଳୀ|ପଦ୍ଧତି|ପ୍ରକ୍ରିୟା/, 'process'],
  [/ଭୂମିକା/, 'roles'],
  [/ମୌଖିକ ପ୍ରଶ୍ନ/, 'oral'],
]
function keyFor(h) { for (const [re, k] of BLOCK_KEYS) if (re.test(h)) return k; return null }

function blockInner($, blk) { const $b = $(blk).clone(); $b.find('h4').first().remove(); return clean($.html($b)) }

function extractCard($, el, part) {
  const $c = $(el)
  const sourceNum = clean($c.find('.card-h .num').first().text())
  const title = clean($c.find('.card-h h3').first().text())
  const kind = clean($c.find('.card-h .kind').first().text())
  const tiles = []
  let cognitive = null
  $c.find('.meta > div').each((_, d) => {
    const $d = $(d); const label = clean($d.find('b').first().text())
    const lvl = $d.find('.lvl').first()
    const $v = $d.clone(); $v.find('b').remove(); $v.find('.lvl').remove()
    const value = clean($v.text()) || clean(lvl.text())
    if (lvl.length) { const cls = (lvl.attr('class') || '').match(/lvl\s+(\w)/)?.[1] || null; cognitive = { text: clean(lvl.text()), level: cls } }
    tiles.push({ label, value })
  })
  const blocks = {}
  $c.find('.card-b > .blk').each((_, blk) => {
    const h = clean($(blk).find('h4').first().text())
    const k = keyFor(h)
    if (k && !blocks[k]) blocks[k] = { heading: h, html: blockInner($, blk) }
  })
  return { sourceNum, title, kind, tiles, cognitive, blocks }
}

// term per card, following document order (set: term-1 group then term-2 group)
function termOf(els, $, itemType, itemTerm) {
  let t = 1, afterProject = false
  return els.map(el => {
    const part = $(el).hasClass('B') ? 'B' : 'A'
    if (part === 'A' && afterProject) { t = 2; afterProject = false }
    const term = itemType === 'set' ? t : (itemTerm || 1)
    if (part === 'B') afterProject = true
    return { el, part, term }
  })
}

// Short-lived cache of fetched source HTML (keyed by htmlRef) so repeated
// detail / og / share / prev-next / metadata requests don't re-download the
// whole archived file from Cloudinary each time. Memory-bounded + TTL.
const _htmlCache = new Map() // ref -> { at, html }
const _TTL = 10 * 60 * 1000
async function loadSourceHtml(ref) {
  const hit = _htmlCache.get(ref)
  if (hit && (Date.now() - hit.at) < _TTL) return hit.html
  try { configureCloudinary() } catch (_) {}
  const bytes = await fetchAnyBytes(ref)
  const html = Buffer.from(bytes).toString('utf-8')
  _htmlCache.set(ref, { at: Date.now(), html })
  if (_htmlCache.size > 24) { const k = _htmlCache.keys().next().value; _htmlCache.delete(k) }
  return html
}

// Returns the full detail payload for one task/project, or null if not found.
export async function getCardDetail(db, item, { part, term, pos }) {
  if (!item?.htmlRef) return null
  const html = await loadSourceHtml(item.htmlRef)
  const $ = cheerio.load(html)
  const els = $('article.card').toArray()
  const tagged = termOf(els, $, item.type, item.term)
  const wantTerm = item.type === 'set' ? (Number(term) || 1) : (item.term || 1)
  const group = tagged.filter(m => m.part === part && m.term === wantTerm)
  const _n = parseInt(pos, 10)
  const idx = (Number.isFinite(_n) ? _n : 1) - 1
  if (idx < 0) return null
  const target = group[idx]
  if (!target) return null
  const globalIdx = els.indexOf(target.el)
  const body = extractCard($, target.el, part)
  // prefer the master-corrected LO chips stored on the item
  const los = (item.cards?.[globalIdx]?.los) || []
  const fw = TOB_FRAMEWORK[item.stage] || {}
  const sfw = frameworkFor(item.stage, item.subject_id)
  const marksOut = sfw.kind === 'components'
    ? { components: true, parts: sfw.components.map(cc => ({ label: cc.label, marks: cc.marks })), performance: sfw.performance ?? null }
    : sfw.kind === 'unset' ? { frameworkUnset: true }
    : fw.marks ? { task: fw.written, project: fw.project, diary: fw.diary } : { none: true }
  return {
    type: item.type, class: item.class, subject_id: item.subject_id, subject_printed: item.subject_printed, stage: item.stage,
    chapterNo: item.chapterNo, setCode: item.setCode, term: wantTerm, chapterTitle: item.title,
    part, pos: idx + 1, count: group.length,
    prev: idx > 0 ? idx : null, next: idx < group.length - 1 ? idx + 2 : null,
    title: body.title, kind: body.kind, sourceNum: body.sourceNum, cognitive: body.cognitive, tiles: body.tiles,
    blocks: body.blocks, los,
    marks: marksOut,
  }
}
