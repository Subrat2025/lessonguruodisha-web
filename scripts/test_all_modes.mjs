// Test all 3 modes: daily / instant / multigrade
import fs from 'fs'
import { renderInstantPlanDiaryHTML } from '../lib/instantPlanHtml.js'
import { htmlToPDFBuffer } from '../lib/pdf.js'

const base = JSON.parse(fs.readFileSync('/app/scripts/test_plan.json','utf8')).plan

async function save(name, plan, mode) {
  const html = renderInstantPlanDiaryHTML({ plan, mode, showWatermark: true, teacherName: 'ସୁଭ୍ରତ ପାଣି' })
  const buf = await htmlToPDFBuffer(html, {
    landscape: true, format: 'A4',
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  })
  fs.writeFileSync(`/tmp/${name}.pdf`, buf)
  console.log(`✔ ${name}.pdf   ${buf.length} bytes`)
}

// (1) Daily 7-period: 7 periods
const daily = { ...base, periods: Array.from({length:7}, (_,i)=>({ ...base.periods[0], periodNum: i+1 })) }

// (2) Multigrade: single period, top-level classes[]
const multi = {
  date: base.date, periodNumber: 3, time: '10:00-10:45',
  bookName: base.bookName, chapterName: base.chapterName,
  classes: [
    { ...base.periods[0], className: '୩ୟ' },
    { ...base.periods[0], className: '୪ର୍ଥ' },
    { ...base.periods[0], className: '୫ମ' },
  ],
}

await save('daily7', daily, 'daily')
await save('instant', base, 'instant')
await save('multigrade', multi, 'multigrade')
process.exit(0)
