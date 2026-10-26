#!/usr/bin/env node
/**
 * Import Balvatika / Sishuvatika LO Codes from the uploaded artifact HTML
 * into the `loCodes` collection with class=0 (Balvatika).
 *
 * Idempotent: deletes existing class=0 entries before re-inserting.
 *
 * Run:  node /app/scripts/import-balvatika-locodes.mjs
 */
import { MongoClient } from 'mongodb'
import { randomUUID } from 'crypto'

const HTML_URL  = 'https://customer-assets.emergentagent.com/job_odisha-learning-pro/artifacts/4f2r9wk4_gemini-code-1782055468111.html'
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017'
const DB_NAME   = process.env.DB_NAME   || 'edumaster_odisha'
const CLASS_NUM = 0  // Balvatika / Sishuvatika

const log = (...a) => console.log('[lo-import]', ...a)

// Subject grouping for CG codes (based on NCF Foundational Stage):
// CG-1 .. CG-3  → Physical Development & Health (EVS)
// CG-4 .. CG-5  → Social-Emotional & Ethical Development (EVS)
// CG-6 .. CG-7  → Cognitive Development / EVS
// CG-8          → Mathematics
// CG-9 ..CG-11  → Language (Odia / English)
// CG-12         → Arts
// CG-13         → Learning Habits / General
const CG_SUBJECT = {
  1: 'EVS', 2: 'EVS', 3: 'EVS', 4: 'EVS', 5: 'EVS', 6: 'EVS', 7: 'EVS',
  8: 'Mathematics',
  9: 'Odia', 10: 'Odia', 11: 'English',
  12: 'Arts',
  13: 'General',
}

// C-codes follow the same numeric chapter prefix → same subject as CG-N
function subjectForCCode(code) {
  // code formats: "C1.1", "C10.9", etc.  Take the integer before the dot.
  const m = code.match(/^C(\d+)/)
  if (!m) return 'General'
  const n = parseInt(m[1], 10)
  return CG_SUBJECT[n] || 'General'
}

async function main() {
  log('Downloading HTML…')
  const res = await fetch(HTML_URL)
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const html = await res.text()
  log('Downloaded', html.length, 'bytes')

  // Extract every <tr><td>CODE</td><td>DESC</td></tr> pair (skip section-title rows).
  // The HTML uses simple <tr><td>code</td><td>description [cite: x]</td></tr>.
  const rowRe = /<tr>\s*<td>([^<]+)<\/td>\s*<td>([\s\S]+?)<\/td>\s*<\/tr>/g
  const items = []
  let m
  while ((m = rowRe.exec(html)) !== null) {
    const code = m[1].trim()
    let desc = m[2].trim()
    // Strip "[cite: N]" markers
    desc = desc.replace(/\[cite:[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()
    // Skip header/section rows (no proper code, or HTML inside cell)
    if (!/^[A-Z]{1,3}-?\d+/.test(code) && !/^[A-Z]\d+/.test(code)) continue
    if (!desc) continue
    items.push({ code, description: desc })
  }
  log('Parsed', items.length, 'LO entries')
  if (items.length === 0) throw new Error('Parsing returned 0 entries')
  log('Samples:', items.slice(0, 3).map(x => x.code).join(', '), '...', items.slice(-3).map(x => x.code).join(', '))

  // Normalize codes: ensure consistent format
  // CG-N (already correct), C-N.M → input shows "C1.1", we'll standardize to "C-1.1" to match other classes' style
  const normalized = items.map(({ code, description }) => {
    let std = code
    if (/^C\d+\.\d+$/.test(code)) {
      // C1.1 → C-1.1
      std = code.replace(/^C(\d+\.\d+)$/, 'C-$1')
    }
    return {
      code: std,
      description,
      subject: code.startsWith('CG-')
        ? CG_SUBJECT[parseInt(code.slice(3), 10)] || 'General'
        : subjectForCCode(code),
    }
  })

  // ---- Mongo ----
  const client = new MongoClient(MONGO_URL)
  await client.connect()
  const db = client.db(DB_NAME)

  // Wipe existing Balvatika (class=0) LO codes for clean reimport
  const del = await db.collection('loCodes').deleteMany({ class: CLASS_NUM })
  log('Removed', del.deletedCount, 'existing class=0 entries (clean reimport)')

  // Insert
  const now = new Date()
  const docs = normalized.map(x => ({
    id: randomUUID(),
    code: x.code,
    class: CLASS_NUM,
    subject: x.subject,
    description: x.description,
    createdAt: now, updatedAt: now,
  }))
  if (docs.length) await db.collection('loCodes').insertMany(docs)
  log('✅ Inserted', docs.length, 'LO codes for Balvatika (class=0)')

  // Summary by subject
  const subjAgg = await db.collection('loCodes').aggregate([
    { $match: { class: CLASS_NUM } },
    { $group: { _id: '$subject', n: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray()
  log('By subject:', subjAgg.map(s => `${s._id}=${s.n}`).join(', '))

  const total = await db.collection('loCodes').countDocuments({ class: CLASS_NUM })
  log('Final count for class=0:', total)
  await client.close()
  log('Done.')
}

main().catch(e => { console.error('IMPORT FAILED:', e); process.exit(1) })
