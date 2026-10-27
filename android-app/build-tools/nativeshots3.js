// Drives the native screens (pages.js + screens/*.js) against sample backend data, fails on any
// script error, and saves screenshots. Usage: node nativeshots.js <android-app dir>
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { handler, PREMIUM_USER, FREE_USER, NEW_USER } = require('./native-mocks')
const tools = require('./tool-mocks')

const ROOT = process.argv[2] || path.join(__dirname, '..')
const ASSETS = path.join(ROOT, 'src/main/assets/app')
const OUT = path.join(ROOT, 'dist/screenshots-native3')
const ORIGIN = 'https://lessonguruodisha.com'
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webp': 'image/webp', '.json': 'application/json' }
const VIEW = { width: 412, height: 915 }, SAT = 32
const errors = []

async function makePage(browser, user, opts = {}) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, locale: 'en-IN', timezoneId: 'Asia/Kolkata',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 LessonGuruApp/1.4.0 (Android)' })
  const h = handler(user, opts)
  const calls = []
  await ctx.route('**/*', async (route) => {
    const req = route.request(), u = new URL(req.url())
    if (u.origin === ORIGIN && u.pathname.startsWith('/__app/')) {
      const f = path.join(ASSETS, u.pathname.slice('/__app/'.length) || 'index.html')
      if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' })
      return route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) })
    }
    if (u.origin === ORIGIN && u.pathname.startsWith('/api/')) {
      const p = u.pathname.slice(4)
      if (p === '/lesson-plans/secure-download') { const b = req.postDataJSON(); if (!b.innerHtml || b.innerHtml.length < 20 || !b.lesson || !b.lesson.title) return route.fulfill({ status: 400, json: { error: 'bad body' } }); return route.fulfill({ json: { documentId: 'd1', downloadUrl: '/api/lesson-plans/documents/d1/download?format=' + b.format + '&token=x', format: b.format } }) }
      if (p === '/lesson-plans/documents/d1/download') return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4 demo') })
      let body = null; try { body = req.postDataJSON() } catch (e) {}
      calls.push(req.method() + ' ' + p)
      const qq = Object.fromEntries(u.searchParams)
      const r = h(req.method(), p, qq, body || {}) || tools(req.method(), p, qq, body || {}, { premium: !!(user && user.subscription && user.subscription.status === 'active') })
      if (r && r[0] === 'PDF') return route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'content-disposition': "attachment; filename*=UTF-8''LessonGuru-" + p.split('/').filter(Boolean).slice(0, 2).join('-') + ".pdf" }, body: Buffer.from('%PDF-1.4 demo') })
      if (r && r[0] === 'HTML') return route.fulfill({ status: 200, contentType: 'text/html', body: r[1] })
      if (r) return route.fulfill({ status: r[0], json: r[1] })
      return route.fulfill({ status: 200, json: {} })
    }
    return route.abort()
  })
  await ctx.addInitScript(({ user, sat, seed }) => {
    if (!location.pathname.startsWith('/__app/')) return
    localStorage.setItem('lgapp_onboarded', '1')
    if (user) localStorage.setItem('em_token', 'demo-token')
    for (const [k, v] of Object.entries(seed || {})) if (k !== '__direct') localStorage.setItem(k, v)
    sessionStorage.setItem('lgapp_warm', '1')
    window.__printed = 0
    window.LGApp = {
      getInfo: () => JSON.stringify({ platform: 'android', version: '1.6.0', sat, sab: 0, online: true, direct: !!seed.__direct }),
      haptic() {}, share() {}, openExternal() {}, rateApp() {}, toast() {}, isOnline: () => true, cloudStatus() {},
      saveFile() {}, openFile(d, n) { window.__saved = n }, print() { window.__printed++ }, exitApp() {}, setStatusBarStyle() {}, purchaseBlocked() {},
    }
  }, { user: !!user, sat: SAT, seed: opts.seed || {} })
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()) })
  await page.goto(ORIGIN + '/__app/index.html#home')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  page.calls = calls
  return { ctx, page }
}

async function statusBar(page) {
  await page.evaluate((sat) => {
    const s = document.createElement('div')
    s.style.cssText = `position:fixed;left:0;right:0;top:0;height:${sat}px;z-index:9999;display:flex;align-items:center;justify-content:space-between;padding:0 22px 0 26px;font:600 14px Poppins,system-ui;color:#fff;pointer-events:none`
    s.innerHTML = '<span>9:41</span><span>▂▄▆ ▮</span>'
    document.body.appendChild(s)
  }, SAT)
}
async function shot(page, name, wait = 900) {
  await page.waitForTimeout(wait)
  await statusBar(page)
  await page.screenshot({ path: path.join(OUT, name + '.png') })
  console.log('saved', name)
}
const open = (page, p) => page.evaluate((p) => LG.open(p), p)
const top = (page, sel) => page.locator('.pg.in').last().locator(sel)


const tap = async (page, sel, wait = 700) => { await top(page, sel).first().click(); await page.waitForTimeout(wait) }
const depth = (p) => p.evaluate(() => LG.stackDepth)
;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  let x = await makePage(browser, PREMIUM_USER), p = x.page
  const bodies = []
  p.on('request', r => { if (/secure-download|instant-plan\/html/.test(r.url())) bodies.push(r.url() + ' ' + (r.postData() || '')) })

  // 1) bottom bar: Lesson Plans opens the hub with every planning tool
  await p.locator('#nav [data-navgo="/lessons"]').click(); await p.waitForTimeout(900)
  const tools = await top(p, '.ptool').count()
  if (tools < 6) errors.push('Lesson Plans hub shows only ' + tools + ' planning tools')
  await shot(p, 'u01-lesson-plans-hub', 300)
  // the bar is visible and tappable on top of the screen
  const navOnTop = await p.evaluate(() => { const r = document.querySelector('#nav .nav-in').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width * 0.9, r.top + r.height / 2); return !!(el && el.closest('#nav')) })
  if (!navOnTop) errors.push('bottom bar is hidden behind the screen')
  if (!(await p.evaluate(() => document.querySelector('#nav [data-nav="lessons"]').classList.contains('on')))) errors.push('Lesson Plans tab not highlighted')
  // go deep, then jump with the bar
  await tap(p, '[data-cid="c5"]'); await tap(p, '[data-bid="b1"]'); await tap(p, '[data-chid="ch5"]'); await tap(p, '[data-lid="l1"]', 1200)
  await shot(p, 'u02-lesson-with-nav', 200)
  await p.locator('#nav [data-tab="explore"]').click(); await p.waitForTimeout(700)
  if (await depth(p) !== 0) errors.push('bottom bar did not close the open screens')
  const groups = await p.locator('#s-explore .tgroup h3').allInnerTexts()
  if (!groups.length || !/Lesson Plans/.test(groups[0])) errors.push('All Tools not grouped (first: ' + groups[0] + ')')
  await shot(p, 'u03-all-tools', 300)
  // 2) menu on every screen
  await p.evaluate(() => LG.open('/qbank')); await p.waitForTimeout(800)
  await tap(p, '[data-pg-menu]', 600)
  await shot(p, 'u04-all-pages-menu', 200)
  const items = await p.locator('.sheet .mitem').count()
  if (items < 20) errors.push('All pages menu lists only ' + items)
  await p.locator('.sheet .mitem', { hasText: 'Question Papers' }).click(); await p.waitForTimeout(900)
  if (await depth(p) !== 1 || !/Question Papers/.test(await top(p, '.pg-tt b').innerText())) errors.push('menu did not open Question Papers as the only screen')
  await p.evaluate(() => LG.popAll())
  // 3) lesson PDF carries both signatures; one-page print with signatures
  await p.evaluate(() => LG.open('/lesson?id=l1')); await p.waitForTimeout(1300)
  await tap(p, '[data-dl="pdf"]', 1200)
  const sd = bodies.find(b => b.includes('secure-download')) || ''
  if (!sd.includes('ପ୍ରଧାନ ଶିକ୍ଷକଙ୍କ ସ୍ୱାକ୍ଷର') || !sd.includes('ଶିକ୍ଷକଙ୍କ ସ୍ୱାକ୍ଷର')) errors.push('lesson PDF without teacher/headmaster signatures')
  await p.evaluate(() => LG.popAll())
  await p.evaluate(() => LG.open('/abp')); await p.waitForTimeout(800)
  await tap(p, '[data-c="5"]'); await tap(p, '[data-i="0"]'); await tap(p, '[data-ch="ac1"]', 900); await tap(p, '[data-p="ap1"]', 900)
  await top(p, '[data-print]').first().click(); await p.waitForTimeout(300)
  const pr = await p.evaluate(() => { const a = document.querySelectorAll('.pg.in'); const area = a[a.length - 1].querySelector('.print-area'); return { printed: window.__printed, sig: !!area.querySelector('.print-sig'), zoom: area.style.zoom, cls: document.body.classList.contains('printing') } })
  if (pr.printed !== 1 || !pr.sig || !pr.zoom || !pr.cls) errors.push('lesson print not fitted/signed: ' + JSON.stringify(pr))
  await p.emulateMedia({ media: 'print' }); await p.screenshot({ path: path.join(OUT, 'u05-print-preview.png') }); await p.emulateMedia({ media: 'screen' })
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await p.waitForTimeout(700)
  if (await p.evaluate(() => document.body.classList.contains('printing') || !!document.querySelector('.pg.in:last-child .print-sig'))) errors.push('print state not restored after the print dialog')
  await p.evaluate(() => LG.popAll())
  // 4) daily plan opens the official one-page diary (server PDF with signatures)
  await p.locator('#nav .fab').click(); await p.waitForTimeout(700)
  await top(p, '#school').fill('Govt. UP School'); await top(p, '#date').fill(nextWeekday())
  await tap(p, '[data-add]', 500); for (const s of ['[data-pick="c5"]', '[data-pick="b1"]', '[data-pick="ch5"]', '[data-pick="l1"]']) { await p.locator('.sheet ' + s).click(); await p.waitForTimeout(350) }
  await tap(p, '[data-gen]', 1600)
  const ip = bodies.find(b => b.includes('instant-plan/html')) || ''
  if (!/"mode":"daily"/.test(ip)) errors.push('daily plan did not open the diary PDF view')
  await shot(p, 'u06-daily-diary', 200)
  await x.ctx.close()

  // 5) Play version, free teacher: no buying anywhere
  x = await makePage(browser, FREE_USER); p = x.page
  await p.evaluate(() => LG.open('/lesson?id=l1')); await p.waitForTimeout(1300)
  if (await p.locator('[data-web="/plans"]').count()) errors.push('Play version shows a Get Premium button')
  await p.evaluate(() => { LG.popAll(); LG.setTab('premium') }); await p.waitForTimeout(500)
  if (/Get Premium|₹/.test(await p.evaluate(() => document.body.innerText))) errors.push('Play version My Plan offers buying')
  await x.ctx.close()
  // 6) Direct version, free teacher: Get Premium leads to the website checkout
  x = await makePage(browser, FREE_USER, { seed: { __direct: '1' } }); p = x.page
  await p.evaluate(() => LG.open('/lesson?id=l1')); await p.waitForTimeout(1300)
  if (!(await p.locator('.pg.in [data-web="/plans"]').count())) errors.push('Direct version: no Get Premium on a locked lesson')
  await shot(p, 'u07-direct-locked-lesson', 200)
  await p.evaluate(() => { LG.popAll(); LG.setTab('premium') }); await p.waitForTimeout(500)
  if (!(await p.locator('#s-premium [data-web="/plans"]').count())) errors.push('Direct version: no Get Premium on My Plan')
  await shot(p, 'u08-direct-my-plan', 200)
  const req = p.waitForRequest(r => new URL(r.url()).pathname === '/plans' && r.isNavigationRequest(), { timeout: 5000 }).catch(() => null)
  await p.locator('#s-premium [data-web="/plans"]').click()
  if (!(await req)) errors.push('Direct: Get Premium did not open the plans page')
  await x.ctx.close()

  await browser.close()
  if (errors.length) { console.log('\nERRORS:\n' + [...new Set(errors)].join('\n')); process.exit(1) }
  console.log('\nAll navigation, PDF and payment checks OK')
})()
function nextWeekday() { const d = new Date(); d.setDate(d.getDate() + 1); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }
