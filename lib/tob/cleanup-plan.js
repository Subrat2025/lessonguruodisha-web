// === TOB === Admin "Clean-up plan" — READ to propose, WRITE only on Apply.
// For a class+subject it groups published TOB items into CARDS:
//   • set cards     = one per (setCode, term)
//   • chapter cards = one per (chapterNo, term)
// Rule (as specified): keep ONE row per card = the NEWEST import; identical
// copies collapse to 1. Non-keepers are listed as:
//   • relation 'identical'  → recommend UNPUBLISH (auto-selected by default)
//   • relation 'different'  → recommend REVIEW  (NOT auto-selected; shown with a
//                              warning so real/different content is never
//                              discarded without a human decision)
// Apply = set status 'draft' (NEVER delete). Every apply is logged for one-click
// undo (restore the exact previous status).
import crypto from 'node:crypto'
import { buildDataReport } from '@/lib/tob/data-report.js'

const newest = (a, b) => new Date(b.importedAt || 0) - new Date(a.importedAt || 0)

// Reusable keeper picker (also used by the Phase-2 redesign card mapping):
// sets  → prefer the latest import (the 7-Oct English set cards win over older).
// chapters → latest import per chapter+term.
export function cardKeyOf(r) {
  if (r.kind === 'set' && r.set) return `set | ${r.set} | ${r.term || 'full'}`
  if (r.kind === 'chapter' && r.chapterNo != null) return `chapter | ch${r.chapterNo} | ${r.term || 'none'}`
  return null
}

export async function buildCleanupPlan(db, { class: cls, subject } = {}) {
  const rep = await buildDataReport(db, { class: cls, subject, withContent: true })
  // Only published TOB items are candidates (store/assess untouched).
  const rows = rep.rows.filter(r => r.source === 'tob' && r.status === 'published')

  const cardsMap = {}
  for (const r of rows) {
    const k = cardKeyOf(r)
    if (!k) continue
    ;(cardsMap[k] ||= { cardKey: k, kind: r.kind, set: r.set || null, chapterNo: r.chapterNo ?? null, term: r.term || null, items: [] }).items.push(r)
  }

  const cards = []
  const autoUnpublishIds = []
  const reviewIds = []
  for (const c of Object.values(cardsMap)) {
    const sorted = c.items.slice().sort(newest) // newest first
    const keep = sorted[0]
    const others = sorted.slice(1).map(o => {
      const identical = keep.contentHash && o.contentHash && keep.contentHash === o.contentHash
      const relation = identical ? 'identical' : 'different'
      if (identical) autoUnpublishIds.push(o.itemId); else reviewIds.push(o.itemId)
      return {
        itemId: o.itemId, title: o.title || o.titleEnglish || '', fileKey: o.fileKey,
        importedAt: o.importedAt, contentHash: o.contentHash || null,
        relation, recommend: identical ? 'unpublish' : 'review',
      }
    })
    cards.push({
      cardKey: c.cardKey, kind: c.kind, set: c.set, chapterNo: c.chapterNo, term: c.term,
      keep: { itemId: keep.itemId, title: keep.title || keep.titleEnglish || '', fileKey: keep.fileKey, importedAt: keep.importedAt, contentHash: keep.contentHash || null },
      others,
    })
  }
  cards.sort((a, b) => a.cardKey.localeCompare(b.cardKey))

  return {
    class: cls || null, subject: subject || null,
    cards,
    autoUnpublishIds, reviewIds,
    counts: {
      cards: cards.length,
      keep: cards.length,
      autoUnpublish: autoUnpublishIds.length,
      review: reviewIds.length,
    },
    contentNote: rep.summary.content,
  }
}

// WRITE: set status 'draft' for the given published tobItems. Logs a batch for undo.
export async function applyCleanup(db, { itemIds = [], by = null } = {}) {
  const ids = [...new Set((itemIds || []).map(String))].filter(Boolean)
  if (!ids.length) return { batchId: null, unpublished: 0, items: [] }
  const docs = await db.collection('tobItems').find({ id: { $in: ids }, status: 'published' }).project({ id: 1, status: 1 }).toArray()
  const items = docs.map(d => ({ id: d.id, prevStatus: d.status }))
  if (!items.length) return { batchId: null, unpublished: 0, items: [] }
  await db.collection('tobItems').updateMany({ id: { $in: items.map(i => i.id) } }, { $set: { status: 'draft', updatedAt: new Date() } })
  const batchId = crypto.randomUUID()
  await db.collection('tobCleanupLog').insertOne({ batchId, at: new Date(), by, action: 'unpublish', items, undone: false })
  return { batchId, unpublished: items.length, items }
}

// WRITE: undo a batch — restore each item to its previous status.
export async function undoCleanup(db, { batchId } = {}) {
  if (!batchId) return { restored: 0 }
  const log = await db.collection('tobCleanupLog').findOne({ batchId, undone: { $ne: true } })
  if (!log) return { restored: 0 }
  let restored = 0
  for (const it of log.items || []) {
    const r = await db.collection('tobItems').updateOne({ id: it.id }, { $set: { status: it.prevStatus || 'published', updatedAt: new Date() } })
    restored += r.modifiedCount
  }
  await db.collection('tobCleanupLog').updateOne({ batchId }, { $set: { undone: true, undoneAt: new Date() } })
  return { restored }
}

export async function recentCleanupBatches(db, limit = 10) {
  return db.collection('tobCleanupLog').find({}).project({ _id: 0 }).sort({ at: -1 }).limit(limit).toArray()
}
