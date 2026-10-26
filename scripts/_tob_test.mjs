import fs from 'node:fs'
import path from 'node:path'
import { parseChapterPack, parseSet, parseRegister, classifyFile } from './_tob_parse.mjs'

const root = '/tmp/tobs'
const folders = fs.readdirSync(root).filter(f => fs.statSync(path.join(root, f)).isDirectory())
let chapters = [], sets = [], registers = [], skipped = []
for (const folder of folders) {
  const files = fs.readdirSync(path.join(root, folder)).filter(f => /\.html?$/i.test(f))
  for (const file of files) {
    const type = classifyFile(file.toLowerCase(), folder.toLowerCase())
    if (!type) { skipped.push(`${folder}/${file}`); continue }
    const html = fs.readFileSync(path.join(root, folder, file), 'utf-8')
    if (type === 'chapter') chapters.push(parseChapterPack(html, { filename: file, folder }))
    else if (type === 'set') sets.push(parseSet(html, { filename: file }))
    else if (type === 'register') registers.push(parseRegister(html, { filename: file }))
  }
}
chapters.sort((a, b) => a.chapterNo - b.chapterNo)
sets.sort((a, b) => a.setCode.localeCompare(b.setCode))
console.log('=== CHAPTERS ===', chapters.length)
for (const c of chapters) console.log(`Ch${String(c.chapterNo).padStart(2)} term${c.term} | cls${c.class} ${c.subject_id} ${c.stage} | A=${c.partACount} B=${c.partBCount} | cov=${c.coverageCodes.length}/20 | marks ${c.marks.total}/${c.marks.written}/${c.marks.project} ${c.marks.weightage} partC=${c.marks.hasPartC} diary=${c.marks.hasDiary} | ${c.title}`)
console.log('\n=== SETS ===', sets.length)
for (const s of sets) console.log(`Set ${s.setCode} | cls${s.class} ${s.subject_id} | A=${s.partACount} B=${s.partBCount} | cov=${s.coverageCodes.length}/20 | marks ${s.marks.total} partC=${s.marks.hasPartC} diary=${s.marks.hasDiary}`)
console.log('\n=== REGISTERS ===', registers.length)
for (const r of registers) console.log(`${r.title} | cls${r.class} ${r.subject_id} | forms=${r.forms.length} | codes=${[...new Set(r.forms.map(f => f.code).filter(Boolean))].join(',')}`)
console.log('\n=== SKIPPED (folder 05) ===', skipped)
console.log('\nCh01 coverage codes:', chapters[0]?.coverageCodes.join(', '))
console.log('Ch01 first card los:', JSON.stringify(chapters[0]?.cards[0]?.los))
