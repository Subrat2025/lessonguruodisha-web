import fs from 'node:fs'

const BASE = 'http://localhost:3000/api'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  // 1. admin login
  let r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mobile: '9692604577', password: 'Subrat@909e' }) })
  const login = await r.json()
  const token = login.token
  console.log('login:', r.status, 'token?', !!token)
  const H = { Authorization: `Bearer ${token}` }

  const zipBuf = fs.readFileSync('/tmp/abp_src/src.zip')

  // 2. peek
  let fd = new FormData()
  fd.append('file', new Blob([zipBuf], { type: 'application/zip' }), 'Class4_Odia_Lesson_Plans_HTML.zip')
  r = await fetch(`${BASE}/abp/admin/import/peek`, { method: 'POST', headers: H, body: fd })
  const peek = await r.json()
  console.log('peek:', r.status, 'chapterFiles:', peek.chapterFiles?.length, 'yearFiles:', peek.yearFiles?.length, 'prefill:', JSON.stringify(peek.prefill))

  // 3. import
  fd = new FormData()
  fd.append('file', new Blob([zipBuf], { type: 'application/zip' }), 'Class4_Odia_Lesson_Plans_HTML.zip')
  fd.append('class', peek.prefill.class || '4')
  fd.append('subject', peek.prefill.subject || 'ଓଡ଼ିଆ')
  fd.append('book', peek.prefill.book || '')
  fd.append('mode', 'skip')
  r = await fetch(`${BASE}/abp/admin/import`, { method: 'POST', headers: H, body: fd })
  const imp = await r.json()
  console.log('import start:', r.status, JSON.stringify(imp))
  const jobId = imp.jobId

  // 4. poll
  let job
  for (let i = 0; i < 40; i++) {
    await sleep(1500)
    r = await fetch(`${BASE}/abp/admin/import/jobs/${jobId}`, { headers: H })
    const jr = await r.json(); job = jr.job
    process.stdout.write(`\rjob ${job.status} ${job.done}/${job.total}  `)
    if (job.status === 'done' || job.status === 'error') break
  }
  console.log('\nJOB FINAL:', job.status, 'done', job.done + '/' + job.total,
    '| imported', JSON.stringify(job.imported), '| expected', JSON.stringify(job.expected),
    '| errors', job.errors?.length, '| warnings', job.warnings?.length, '| yearPlan', JSON.stringify(job.yearPlan))
  if (job.errors?.length) console.log('ERRORS:', JSON.stringify(job.errors.slice(0, 3)))
  if (job.warnings?.length) console.log('WARN sample:', JSON.stringify(job.warnings.slice(0, 2)))

  // 5. admin chapter list
  r = await fetch(`${BASE}/abp/admin/chapters?class=4`, { headers: H })
  const cl = await r.json()
  console.log('admin chapters:', cl.chapters?.length, '| first:', cl.chapters?.[0] && `#${cl.chapters[0].number} ${cl.chapters[0].title} (${cl.chapters[0].genre}) ${cl.chapters[0].periodCount}p [${cl.chapters[0].status}]`)
  const totPeriods = (cl.chapters || []).reduce((a, c) => a + c.periodCount, 0)
  console.log('total periods across chapters:', totPeriods)

  // 6. publish the course
  const subj = cl.chapters?.[0]?.subject, book = cl.chapters?.[0]?.book
  r = await fetch(`${BASE}/abp/admin/courses/status`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ class: '4', subject: subj, book, status: 'published' }) })
  console.log('publish course:', r.status, JSON.stringify(await r.json()))

  // 7. public browse
  r = await fetch(`${BASE}/abp/classes`); console.log('public classes:', JSON.stringify(await r.json()))
  r = await fetch(`${BASE}/abp/courses?class=4`); const courses = await r.json(); console.log('public courses:', JSON.stringify(courses.courses))
  r = await fetch(`${BASE}/abp/chapters?class=4&subject=${encodeURIComponent(subj)}&book=${encodeURIComponent(book)}`); const chs = await r.json()
  console.log('public chapters:', chs.chapters?.length, 'hasYearPlan:', chs.hasYearPlan)
  const chId = chs.chapters?.[0]?.id

  // 8. single chapter as ANON (premium gating → only period 1 unlocked)
  r = await fetch(`${BASE}/abp/chapters/${chId}`); const full = await r.json()
  const locked = (full.periods || []).filter(p => p.locked).length
  console.log('chapter full (anon): periods', full.periods?.length, '| locked', locked, '| p1 locked?', full.periods?.[0]?.locked, '| download', JSON.stringify(full.download))
  console.log('p1 stages:', full.periods?.[0]?.stages?.map(s => `${s.en}:${s.activities?.length}`).join(','))

  // 9. single chapter as ADMIN (all unlocked)
  r = await fetch(`${BASE}/abp/chapters/${chId}`, { headers: H }); const fullA = await r.json()
  console.log('chapter full (admin): locked', (fullA.periods || []).filter(p => p.locked).length, '| download', JSON.stringify(fullA.download))

  // 10. year plan
  r = await fetch(`${BASE}/abp/yearplan?class=4&subject=${encodeURIComponent(subj)}&book=${encodeURIComponent(book)}`); const yp = await r.json()
  console.log('yearplan:', r.status, '| tables', yp.yearPlan?.tables?.length, '| stats', yp.yearPlan?.stats?.length)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })
