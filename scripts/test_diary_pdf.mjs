// Quick test harness: renders the new Diary template + generates a PDF.
// Run with: cd /app && node scripts/test_diary_pdf.mjs
import fs from 'fs'
import path from 'path'
import { renderInstantPlanDiaryHTML } from '../lib/instantPlanHtml.js'
import { htmlToPDFBuffer } from '../lib/pdf.js'

const plan = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts', 'test_plan.json'), 'utf8')).plan

async function main() {
  console.log('Rendering Diary HTML for INSTANT mode…')
  const html = renderInstantPlanDiaryHTML({
    plan: { ...plan, schoolName: 'ଉ.ପ୍ର. ବିଦ୍ୟାଳୟ, ଭୁବନେଶ୍ୱର', teacherName: 'ସୁଭ୍ରତ ପାଣି' },
    showWatermark: true,
    teacherName: 'ସୁଭ୍ରତ ପାଣି',
    mode: 'instant',
  })
  fs.writeFileSync('/tmp/diary_test.html', html)
  console.log('HTML written to /tmp/diary_test.html   (', html.length, 'bytes)')

  console.log('Generating PDF via Puppeteer (landscape=true)…')
  const buf = await htmlToPDFBuffer(html, {
    landscape: true, format: 'A4',
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  })
  fs.writeFileSync('/tmp/diary_test.pdf', buf)
  console.log('PDF written to /tmp/diary_test.pdf     (', buf.length, 'bytes)')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
