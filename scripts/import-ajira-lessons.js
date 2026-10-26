// =============================================================================
//  📚 Ajira Pathya Jojana — Lesson Plan HTML → MongoDB importer
//  ---------------------------------------------------------------------------
//  Reads /app/tmp_lessons/class{1..5}.html and extracts each `<div class="page">`
//  block that starts with an <h3>ଦୈନିକ ପାଠ ଯୋଜନା … header, parses the daily
//  periods table into structured JSON, and upserts one document per
//  (classCode, dateISO) into the `ajira_lessons` collection.
//
//  Run:  node /app/scripts/import-ajira-lessons.js
// =============================================================================

import fs from 'node:fs/promises'
import path from 'node:path'
import { MongoClient } from 'mongodb'
import * as cheerio from 'cheerio'

// Load .env manually — dotenv isn't a runtime dep here.
try {
  const env = await fs.readFile('/app/.env', 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

const LESSONS_DIR = '/app/data/lesson-plans'
const CLASSES = [
  { code: 1, name: 'ଶ୍ରେଣୀ-୧ (Class 1)', file: 'class1.html' },
  { code: 2, name: 'ଶ୍ରେଣୀ-୨ (Class 2)', file: 'class2.html' },
  { code: 3, name: 'ଶ୍ରେଣୀ-୩ (Class 3)', file: 'class3.html' },
  { code: 4, name: 'ଶ୍ରେଣୀ-୪ (Class 4)', file: 'class4.html' },
  { code: 5, name: 'ଶ୍ରେଣୀ-୫ (Class 5)', file: 'class5.html' },
]

/** Convert "02.04.2026" → ISO "2026-04-02" (safe for indexing / <input type="date">). */
function toISO(dmY) {
  const m = dmY.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** Strip HTML tags and collapse whitespace. */
function clean($el) {
  if (!$el || !$el.length) return ''
  return $el.text().replace(/\s+/g, ' ').trim()
}

/** Extract the 5 Panchapadi steps from a `<td class="pancha">` cell. */
function extractPanchapadi($, $td) {
  const out = []
  $td.find('div').each((_, div) => {
    const t = cheerio.load(div).text().replace(/\s+/g, ' ').trim()
    if (t) out.push(t)
  })
  return out
}

/** Parse a single daily-plan <div class="page"> into structured data. */
function parseDayPlan($, $page) {
  const header = clean($page.find('h3').first())
  //   header ~ "ଦୈନିକ ପାଠ ଯୋଜନା · ଶିକ୍ଷାଦାନ ଦିବସ-1 · 02.04.2026 (ଗୁରୁବାର) · ସପ୍ତାହ-1 · ଶ୍ରେଣୀ-୧"
  const dateMatch = header.match(/(\d{1,2}\.\d{1,2}\.\d{4})/)
  const teachingDayMatch = header.match(/ଦିବସ[-\s]*(\d+)/)
  const weekMatch = header.match(/ସପ୍ତାହ[-\s]*(\d+)/)
  const dayNameMatch = header.match(/\(([^)]+)\)/)
  if (!dateMatch) return null

  const periods = []
  // Class 1/2 use `<table class="daytable">`, Class 3-5 use a plain `<table>`.
  // We take the first table inside this page since each daily plan has exactly
  // one periods table.
  $page.find('table').first().find('tbody tr').each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 5) return
    // Period + time
    const $p = $(tds[0])
    const periodNo = clean($p.find('b'))
    const timeText = $p.text().replace(periodNo, '').replace(/\s+/g, ' ').trim()

    // Subject + TLM
    const $s = $(tds[1])
    const subjectMain = clean($s.clone().children('span').remove().end())
    const tlm = clean($s.find('span.small')).replace(/^TLM:\s*/, '')

    // Lesson / topic / LO
    const $l = $(tds[2])
    const lessonLines = $l.html()?.split(/<br\s*\/?>/i).map(h => cheerio.load(h).text().trim()).filter(Boolean) || []
    // Last line usually contains LO/CG codes
    const codesLine = lessonLines.find(l => /LO:|CG-|CD-|LLD-|PD-|ACD-/i.test(l)) || ''
    const loMatch = codesLine.match(/LO:\s*([A-Za-z0-9.\-\/]+)/)
    const cgMatch = codesLine.match(/(CG-[A-Za-z0-9.\/]+|CD-[A-Za-z0-9.\/]+|LLD-[A-Za-z0-9.\/]+|PD-[A-Za-z0-9.\/]+|ACD-[A-Za-z0-9.\/]+)/g)

    const lessonTitleLines = lessonLines.filter(l => l !== codesLine)

    // Panchapadi
    const $panch = $(tds[3])
    const panchapadi = extractPanchapadi($, $panch)

    // Assessment + homework
    const $a = $(tds[4])
    const assessmentHtml = $a.html() || ''
    const parts = assessmentHtml.split(/<br\s*\/?>/i).map(h => cheerio.load(h).text().trim()).filter(Boolean)
    const homework = parts.find(p => p.startsWith('ଗୃହକାର୍ଯ୍ୟ')) || ''
    const assessment = parts.filter(p => !p.startsWith('ଗୃହକାର୍ଯ୍ୟ')).join(' ')

    periods.push({
      periodNo,
      time: timeText,
      subject: subjectMain,
      tlm,
      lessonLines: lessonTitleLines,
      loCode: loMatch?.[1] || '',
      cgCodes: cgMatch || [],
      panchapadi,
      assessment,
      homework: homework.replace(/^ଗୃହକାର୍ଯ୍ୟ:\s*/, ''),
    })
  })

  // Footer note (inclusive education etc.)
  const noteText = clean($page.find('div.note').first())

  return {
    header,
    date: dateMatch[1],
    dateISO: toISO(dateMatch[1]),
    dayName: dayNameMatch?.[1] || '',
    teachingDayNo: teachingDayMatch ? Number(teachingDayMatch[1]) : null,
    weekNo: weekMatch ? Number(weekMatch[1]) : null,
    periods,
    note: noteText,
  }
}

async function main() {
  const url = process.env.MONGO_URL
  if (!url) throw new Error('MONGO_URL not set in .env')
  const client = new MongoClient(url)
  await client.connect()
  const dbName = process.env.DB_NAME || new URL(url).pathname.replace(/^\//, '') || 'edumaster_odisha'
  const db = client.db(dbName)
  const coll = db.collection('ajira_lessons')

  // Idempotent (classCode, dateISO) index — safe to run multiple times
  await coll.createIndex({ classCode: 1, dateISO: 1 }, { unique: true })
  await coll.createIndex({ dateISO: 1 })

  let grandTotal = 0
  for (const cls of CLASSES) {
    const html = await fs.readFile(path.join(LESSONS_DIR, cls.file), 'utf8')
    const $ = cheerio.load(html)
    // Each daily plan lives inside a <div class="page"> whose <h3> starts with
    // "ଦୈନିକ ପାଠ ଯୋଜନା".  Match by that prefix so we don't pick up the cover/toc pages.
    const pages = $('div.page').filter((_, el) => {
      const h3 = $(el).find('h3').first().text()
      return /^ଦୈନିକ ପାଠ ଯୋଜନା/.test(h3)
    })
    console.log(`[class-${cls.code}] found ${pages.length} daily plans`)

    const ops = []
    pages.each((_, el) => {
      const parsed = parseDayPlan($, $(el))
      if (!parsed?.dateISO) return
      ops.push({
        updateOne: {
          filter: { classCode: cls.code, dateISO: parsed.dateISO },
          update: {
            $set: {
              classCode: cls.code,
              className: cls.name,
              dateISO: parsed.dateISO,
              dateText: parsed.date,
              dayName: parsed.dayName,
              teachingDayNo: parsed.teachingDayNo,
              weekNo: parsed.weekNo,
              header: parsed.header,
              periods: parsed.periods,
              note: parsed.note,
              updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date() },
          },
          upsert: true,
        },
      })
    })

    if (ops.length) {
      const r = await coll.bulkWrite(ops, { ordered: false })
      console.log(`  ✓ upserts=${r.upsertedCount} modified=${r.modifiedCount} matched=${r.matchedCount}`)
      grandTotal += ops.length
    }
  }

  console.log(`\n✅ Imported ${grandTotal} daily lesson plans across ${CLASSES.length} classes`)
  const total = await coll.countDocuments()
  console.log(`   collection ajira_lessons now has ${total} documents`)

  // Also emit a bundled JSON file so production can auto-seed on first boot
  // even without access to the source HTML files.
  const all = await coll.find({}, { projection: { _id: 0 } }).toArray()
  await fs.mkdir('/app/data', { recursive: true })
  await fs.writeFile('/app/data/ajira-lessons.json', JSON.stringify(all))
  console.log(`   → wrote /app/data/ajira-lessons.json (${(JSON.stringify(all).length / 1024).toFixed(1)} KB, ${all.length} docs)`)

  await client.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
