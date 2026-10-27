// Drives the native screens (pages.js + screens/*.js) against sample backend data, fails on any
// script error, and saves screenshots. Usage: node nativeshots.js <android-app dir>
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { handler, PREMIUM_USER, FREE_USER, NEW_USER } = require('./native-mocks')

const ROOT = process.argv[2] || path.join(__dirname, '..')
const ASSETS = path.join(ROOT, 'src/main/assets/app')
const OUT = path.join(ROOT, 'dist/screenshots-native')
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
      const r = h(req.method(), p, Object.fromEntries(u.searchParams), body || {})
      if (r) return route.fulfill({ status: r[0], json: r[1] })
      return route.fulfill({ status: 200, json: {} })
    }
    return route.abort()
  })
  await ctx.addInitScript(({ user, sat, seed }) => {
    if (!location.pathname.startsWith('/__app/')) return
    localStorage.setItem('lgapp_onboarded', '1')
    if (user) localStorage.setItem('em_token', 'demo-token')
    for (const [k, v] of Object.entries(seed || {})) localStorage.setItem(k, v)
    sessionStorage.setItem('lgapp_warm', '1')
    window.__printed = 0
    window.LGApp = {
      getInfo: () => JSON.stringify({ platform: 'android', version: '1.4.0', sat, sab: 0, online: true }),
      haptic() {}, share() {}, openExternal() {}, rateApp() {}, toast() {}, isOnline: () => true, cloudStatus() {},
      saveFile() {}, openFile(d, n) { window.__saved = n }, print() { window.__printed++ }, exitApp() {}, setStatusBarStyle() {}, purchaseBlocked() {},
    }
  }, { user: !!user, sat: SAT, seed: opts.seed })
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

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  let x

  // ---- auth
  x = await makePage(browser, null)
  await open(x.page, '/login'); await shot(x.page, 'n01-login')
  await top(x.page, '#mob').fill('98765'); await top(x.page, '[data-login]').click(); await shot(x.page, 'n02-login-error', 500)
  await top(x.page, '[data-wa-login]').click(); await x.page.waitForTimeout(500)
  await top(x.page, '#mob').fill('9876543210'); await top(x.page, '[data-send]').click()
  await shot(x.page, 'n03-otp-code')
  await top(x.page, '[data-otp="0"]').fill('123456'); await x.page.waitForTimeout(800)
  await shot(x.page, 'n04-new-teacher-profile')
  await x.page.evaluate(() => { LG.popAll() }); await x.page.waitForTimeout(400)
  await open(x.page, '/register'); await shot(x.page, 'n05-register')
  await open(x.page, '/forgot-password'); await shot(x.page, 'n06-forgot-password')
  await open(x.page, '/lesson?id=l1'); await shot(x.page, 'n07-lesson-logged-out')
  await x.ctx.close()

  // password login → security setup for a teacher who hasn't done it
  x = await makePage(browser, null, { loginUser: NEW_USER })
  await open(x.page, '/login'); await x.page.waitForTimeout(400)
  await top(x.page, '#mob').fill('9876543210'); await top(x.page, '#pw').fill('secret1'); await top(x.page, '[data-login]').click()
  await x.page.waitForTimeout(1200)
  if (!(await x.page.evaluate(() => !!document.querySelector('.pg.in [data-save]')))) errors.push('security setup did not open after login')
  await shot(x.page, 'n08-security-setup')
  await x.ctx.close()

  // ---- browsing as a Premium teacher
  x = await makePage(browser, PREMIUM_USER)
  await open(x.page, '/lessons'); await shot(x.page, 'n10-classes')
  await top(x.page, '[data-cid="c5"]').click(); await shot(x.page, 'n11-books')
  await top(x.page, '[data-bid="b1"]').click(); await shot(x.page, 'n12-chapters')
  await top(x.page, '[data-chid="ch5"]').click(); await shot(x.page, 'n13-periods')
  await top(x.page, '[data-lid="l1"]').click(); await shot(x.page, 'n14-lesson', 1300)
  await top(x.page, '.pg-body').evaluate(b => { b.scrollTop = 1100 }); await shot(x.page, 'n15-lesson-steps', 500)
  await top(x.page, '.pg-body').evaluate(b => { b.scrollTop = b.scrollHeight }); await shot(x.page, 'n16-lesson-end', 500)
  await top(x.page, '[data-dl="pdf"]').click(); await x.page.waitForTimeout(1200)
  const saved = await x.page.evaluate(() => window.__saved || '')
  if (!/\.pdf$/.test(saved)) errors.push('PDF download did not reach the phone: ' + saved); else console.log('downloaded:', saved)
  // back navigation unwinds the stack
  for (let i = 0; i < 5; i++) await x.page.evaluate(() => LGHub.onBack())
  await x.page.waitForTimeout(500)
  if (await x.page.evaluate(() => LG.stackDepth) !== 0) errors.push('back did not close all screens')
  // home "class" tile jumps straight to that class
  await x.page.evaluate(() => document.querySelector('[data-cls]') && document.querySelector('[data-cls="5"]').click())
  await x.page.waitForTimeout(900)
  if (!(await x.page.evaluate(() => !!document.querySelector('.pg.in:last-child [data-bid]')))) errors.push('class tile did not open the books of that class')
  await x.page.evaluate(() => LG.popAll())
  await open(x.page, '/search'); await x.page.waitForTimeout(400)
  await top(x.page, '#q').fill('ଭଗ୍ନାଂଶ'); await shot(x.page, 'n17-search', 1000)
  await open(x.page, '/dashboard'); await shot(x.page, 'n18-dashboard', 1200)
  await open(x.page, '/favorites'); await shot(x.page, 'n19-favourites')
  await open(x.page, '/history'); await shot(x.page, 'n20-history')
  await x.page.evaluate(() => LG.popAll())
  await open(x.page, '/daily-plan'); await x.page.waitForTimeout(500)
  await top(x.page, '#school').fill('Govt. UP School, Cuttack')
  await top(x.page, '#date').fill(nextWeekday())
  await shot(x.page, 'n21-daily-plan-form')
  await top(x.page, '[data-ct="double"]').click(); await x.page.waitForTimeout(300)
  await top(x.page, '[data-add]').click(); await x.page.waitForTimeout(500)
  for (const sel of ['[data-pick="c5"]', '[data-pick="b1"]', '[data-pick="ch5"]', '[data-pick="l1"]']) { await x.page.locator('.sheet ' + sel).click(); await x.page.waitForTimeout(350) }
  await top(x.page, '[data-add]').click(); await x.page.waitForTimeout(500)
  await shot(x.page, 'n22-daily-plan-picker', 300)
  for (const sel of ['[data-pick="c5"]', '[data-pick="b1"]', '[data-pick="ch5"]', '[data-pick="l2"]']) { await x.page.locator('.sheet ' + sel).click(); await x.page.waitForTimeout(350) }
  await top(x.page, '[data-gen]').click(); await shot(x.page, 'n23-daily-plan-result', 1300)
  await top(x.page, '.dock [data-print]').click()
  if (await x.page.evaluate(() => window.__printed) !== 1) errors.push('print was not called')
  console.log('API calls:', [...new Set(x.page.calls)].join(', '))
  await x.ctx.close()

  // ---- free teacher sees the lock, no prices
  x = await makePage(browser, FREE_USER)
  await open(x.page, '/lesson?id=l1'); await shot(x.page, 'n30-lesson-locked-free', 1300)
  const txt = await x.page.evaluate(() => document.body.innerText)
  if (/₹|Buy|Upgrade|Subscribe/.test(txt)) errors.push('purchase text visible to free user in native screen')
  await x.page.evaluate(() => LG.popAll())
  await open(x.page, '/daily-plan'); await x.page.waitForTimeout(400)
  await x.ctx.close()

  await browser.close()
  if (errors.length) { console.log('\nERRORS:\n' + [...new Set(errors)].join('\n')); process.exit(1) }
  console.log('\nAll native screens OK')
})()

function nextWeekday() { const d = new Date(); d.setDate(d.getDate() + 1); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }
