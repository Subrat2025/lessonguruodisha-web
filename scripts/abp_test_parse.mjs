import fs from 'node:fs'
import path from 'node:path'
import { parseChapterHtml, parseYearPlanHtml } from '../lib/abp/parse.js'

const dir = '/tmp/abp_src'
const files = fs.readdirSync(dir).filter(f => /^[0-9]+_.*\.html$/.test(f)).sort()
let totalPeriods = 0
const summary = []
for (const f of files) {
  const html = fs.readFileSync(path.join(dir, f), 'utf-8')
  const c = parseChapterHtml(html, { filename: f })
  totalPeriods += c.periodCount
  summary.push({ file: f, num: c.number, title: c.title, genre: c.genre, cls: c.class, subj: c.subject, meta: c.metaPeriods, pages: c.pageCount, periods: c.periods.length, warn: c.warnings.length })
}
console.log('=== CHAPTERS ===')
for (const s of summary) console.log(`#${String(s.num).padStart(2)} | ${s.file.slice(0,34).padEnd(34)} | genre=${(s.genre||'-').padEnd(6)} | cls=${s.cls} | meta=${s.meta} pages=${s.pages} periods=${s.periods} | warn=${s.warn} | ${s.title}`)
console.log('subject (ch1):', summary.length ? JSON.stringify(parseChapterHtml(fs.readFileSync(path.join(dir, files[0]),'utf-8'), {filename:files[0]}).subject) : '')
console.log('TOTAL chapters:', files.length, 'TOTAL periods:', totalPeriods, '(expected 256)')

// Deep-dump chapter 1 overview + period 1
const c1 = parseChapterHtml(fs.readFileSync(path.join(dir, files[0]), 'utf-8'), { filename: files[0] })
console.log('\n=== CH1 OVERVIEW ===')
console.log('title:', c1.title, '| full:', c1.titleFull)
console.log('genre:', c1.genre, '| class:', c1.class, '| classLabel:', c1.classLabel, '| subject:', c1.subject)
console.log('theme:', c1.theme)
console.log('mainCompetencies:', c1.mainCompetencies)
console.log('mainLOs:', c1.mainLearningOutcomes.slice(0, 80), '...')
console.log('planList len:', c1.planList.length, 'first:', JSON.stringify(c1.planList[0]))
console.log('loCodes len:', c1.loCodes.length, 'first:', JSON.stringify(c1.loCodes[0]))
const p1 = c1.periods[0]
console.log('\n=== CH1 PERIOD 1 ===')
console.log('number:', p1.number, '| title:', p1.title)
console.log('chapLine:', p1.chapLine)
console.log('curricularGoal:', JSON.stringify(p1.curricularGoal))
console.log('competencies:', JSON.stringify(p1.competencies))
console.log('learningOutcome:', p1.learningOutcome)
console.log('objective:', p1.objective, '| skillFocus:', p1.skillFocus)
console.log('loCodes:', JSON.stringify(p1.loCodes))
console.log('tlm:', p1.tlm)
console.log('stages:', p1.stages.map(s => `${s.num}${s.odia}(${s.en}):${s.activities.length}act`).join(' | '))
console.log('stage1 act1:', JSON.stringify(p1.stages[0].activities[0]))
console.log('assessment:', p1.assessment)
console.log('homework:', p1.homework)
console.log('period warnings:', p1.warnings)

// Year plan
const yf = fs.readdirSync(dir).find(f => /Chapterwise_Period/.test(f))
const yp = parseYearPlanHtml(fs.readFileSync(path.join(dir, yf), 'utf-8'))
console.log('\n=== YEAR PLAN ===')
console.log('title:', yp.title)
console.log('stats:', JSON.stringify(yp.stats))
console.log('tables:', yp.tables.length, '| first caption:', yp.tables[0]?.caption, '| headers:', JSON.stringify(yp.tables[0]?.headers), '| rows:', yp.tables[0]?.rows.length)
console.log('warnings:', yp.warnings)
