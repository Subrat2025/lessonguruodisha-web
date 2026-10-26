// Drives the native screens (pages.js + screens/*.js) against sample backend data, fails on any
// script error, and saves screenshots. Usage: node nativeshots.js <android-app dir>
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { handler, PREMIUM_USER, FREE_USER, NEW_USER } = require('./native-mocks')
const tools = require('./tool-mocks')

const ROOT = process.argv[2] || path.join(__dirname, '..')
const ASSETS = path.join(ROOT, 'src/main/assets/app')
const OUT = path.join(ROOT, 'dist/screenshots-native2')
const ORIGIN = 'https://lessonguruodisha.in'
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

const dl = async (page, sel, what) => {
  await page.evaluate(() => { window.__saved = '' })
  await top(page, sel).first().click(); await page.waitForTimeout(1200)
  const s = await page.evaluate(() => window.__saved || '')
  if (!/\.pdf$/i.test(s)) errors.push(what + ': download did not reach the phone (' + s + ')'); else console.log('  downloaded', what, '→', s)
}
const tap = async (page, sel, wait = 700) => { await top(page, sel).first().click(); await page.waitForTimeout(wait) }
const back = async (page, n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => LGHub.onBack()); await page.waitForTimeout(400) }
const sheetTap = async (page, sel) => { await page.locator('.sheet ' + sel).first().click(); await page.waitForTimeout(400) }

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  let x = await makePage(browser, PREMIUM_USER), p = x.page

  // ---- Panchapadi
  await open(p, '/panchapadi'); await shot(p, 't01-panchapadi')
  await tap(p, '[data-ci="0"]'); await tap(p, '[data-bi="0"]'); await shot(p, 't02-panchapadi-chapters', 300)
  await tap(p, '[data-chi="0"]'); await tap(p, '[data-pid="pp1"]', 1000); await shot(p, 't03-panchapadi-view', 300)
  await dl(p, '[data-pdf]', 'panchapadi pdf')
  await p.evaluate(() => LG.popAll())

  // ---- Question papers
  await open(p, '/question-papers'); await shot(p, 't04-qp-home')
  await tap(p, '.pg-body [data-new]')
  await tap(p, '[data-scope]', 500); await sheetTap(p, '[data-pick="c5"]'); await sheetTap(p, '[data-pick="b1"]'); await p.waitForTimeout(400)
  await tap(p, '[data-chs]', 500); await sheetTap(p, '[data-id="ch5"]'); await sheetTap(p, '[data-id="ch6"]'); await sheetTap(p, '[data-done]')
  await tap(p, '[data-inc="long"]', 200); await shot(p, 't05-qp-new', 300)
  await tap(p, '[data-gen]', 1200); await shot(p, 't06-qp-making', 200)
  await p.waitForTimeout(3300); await shot(p, 't07-qp-ready', 300)
  await p.locator('.pg.in').last().locator('#ans').check(); await p.waitForTimeout(300); await shot(p, 't08-qp-answers', 200)
  await dl(p, '[data-pdf="paper"]', 'question paper pdf')
  if (await p.evaluate(() => LG.stackDepth) !== 2) errors.push('question paper: unexpected screen stack ' + await p.evaluate(() => LG.stackDepth))
  await back(p); // back on the list: refresh must not double the handlers
  await tap(p, '.pg-body [data-new]', 700)
  if (await p.evaluate(() => LG.stackDepth) !== 2) errors.push('tapping "new paper" after a refresh opened ' + (await p.evaluate(() => LG.stackDepth) - 1) + ' screens')
  await p.evaluate(() => LG.popAll())

  // ---- Assessments
  await open(p, '/assessments'); await shot(p, 't09-assess-home')
  await tap(p, '[data-new]')
  await tap(p, '[data-scope]', 500); await sheetTap(p, '[data-pick="c5"]'); await sheetTap(p, '[data-pick="b1"]'); await p.waitForTimeout(400)
  await tap(p, '[data-chs]', 500); await sheetTap(p, '[data-all]'); await sheetTap(p, '[data-done]')
  await tap(p, '[data-w="hots"]', 300); await shot(p, 't10-assess-build', 300)
  await tap(p, '[data-build]', 1500); await shot(p, 't11-assess-view', 300)
  await dl(p, '[data-pdf="full"]', 'assessment pdf')
  await p.evaluate(() => LG.popAll())

  // ---- Question bank + LO codes
  await open(p, '/qbank'); await shot(p, 't12-qbank')
  await tap(p, '[data-qa="qb-ch5"]', 900); await shot(p, 't13-qbank-view', 200)
  await p.evaluate(() => LG.popAll())
  await open(p, '/learning-outcomes'); await p.waitForTimeout(900); await tap(p, '[data-c="5"]', 800); await shot(p, 't14-lo-codes', 200)
  await tap(p, '[data-s="Maths"]', 800)
  const loN = await p.locator('.pg.in').last().locator('.lo-card').count(); if (loN !== 1) errors.push('LO subject filter shows ' + loN)
  await p.evaluate(() => LG.popAll())

  // ---- Ajira, ABP
  await open(p, '/ajira-pathya-jojana'); await shot(p, 't15-ajira', 1200)
  await tap(p, '[data-acls="4"]', 800)
  await p.evaluate(() => LG.popAll())
  await open(p, '/abp'); await shot(p, 't16-abp')
  await tap(p, '[data-c="5"]'); await tap(p, '[data-i="0"]'); await shot(p, 't17-abp-chapters', 200)
  await tap(p, '[data-ch="ac1"]', 900); await shot(p, 't18-abp-chapter', 200)
  await dl(p, '[data-pdf]', 'abp chapter pdf')
  await tap(p, '[data-p="ap1"]', 900); await shot(p, 't19-abp-period', 200)
  await tap(p, '[data-taught]', 900)
  await back(p); if (!(await top(p, '.list').first().innerText()).includes('Taught')) errors.push('ABP: taught mark not shown after returning')
  await p.evaluate(() => LG.popAll())
  await open(p, '/abp'); await tap(p, '[data-c="5"]'); await tap(p, '[data-i="0"]'); await tap(p, '[data-yp]', 900); await shot(p, 't20-abp-yearplan', 200)
  await p.evaluate(() => LG.popAll())

  // ---- Multigrade, Instant
  await open(p, '/multigrade'); await p.waitForTimeout(500)
  await top(p, '#date').fill(nextWeekday())
  for (const i of [0, 1]) { await tap(p, `[data-set="${i}"]`, 500); for (const s of ['[data-pick="c5"]', '[data-pick="b1"]', '[data-pick="ch5"]', '[data-pick="l' + (i + 1) + '"]']) await sheetTap(p, s) }
  await shot(p, 't21-multigrade', 300)
  await tap(p, '[data-gen]', 1500); await shot(p, 't22-multigrade-plan', 300)
  await dl(p, '[data-pdf]', 'multigrade pdf')
  await p.evaluate(() => LG.popAll())
  await open(p, '/instant-plan'); await shot(p, 't23-instant', 1300)
  await tap(p, '[data-gen]', 1500); await shot(p, 't24-instant-plan', 300)
  await p.evaluate(() => LG.popAll())

  // ---- Wallet, resources, MCM, TOB, library
  await open(p, '/ai-wallet'); await shot(p, 't25-wallet', 1000)
  await p.evaluate(() => LG.popAll())
  await open(p, '/resources'); await shot(p, 't26-resources', 1000)
  await tap(p, '[data-t="chapter_assessments"]', 900); await tap(p, '[data-r]', 900); await shot(p, 't27-res-assessments', 200)
  await tap(p, '[data-a="2"]', 500); await p.locator('.sheet #sn').fill('Govt. UP School, Cuttack'); await p.evaluate(() => { window.__saved = '' })
  await sheetTap(p, '[data-ok]'); await p.waitForTimeout(1000)
  if (!/\.pdf$/.test(await p.evaluate(() => window.__saved || ''))) errors.push('chapter assessment download failed')
  await back(p); await tap(p, '[data-r]', 100); await back(p, 2)
  await tap(p, '[data-t="worksheet"]', 900); await tap(p, '[data-r]', 900); await shot(p, 't28-res-worksheet', 200)
  await p.evaluate(() => LG.popAll())
  await open(p, '/mcm-test'); await shot(p, 't29-mcm', 1000)
  await tap(p, '[data-start]', 500); await shot(p, 't30-mcm-question', 200)
  await tap(p, '[data-opt="1"]', 500); await tap(p, '[data-opt="0"]', 500)
  await tap(p, '[data-submit]', 500); await shot(p, 't31-mcm-confirm', 200)
  await p.locator('.sheet [data-act="yes"]').click(); await p.waitForTimeout(1200); await shot(p, 't32-mcm-result', 200)
  await tap(p, '[data-cert]', 800); await shot(p, 't33-mcm-certificate', 200)
  await p.evaluate(() => LG.popAll())
  await open(p, '/tob'); await shot(p, 't34-tob', 1000)
  await tap(p, '[data-cl]', 900); await shot(p, 't35-tob-course', 200)
  await tap(p, '[data-it="ti1"]', 900); await tap(p, '[data-card="A|1"]', 900); await shot(p, 't36-tob-task', 200)
  await dl(p, '[data-pdf="student"]', 'tob student copy')
  await back(p, 2); await tap(p, '[data-ttab="sets"]', 300); await tap(p, '[data-it="ti4"]', 900); await shot(p, 't37-tob-locked', 200)
  await p.evaluate(() => LG.popAll())
  await open(p, '/store/library'); await shot(p, 't38-library', 1000)
  await dl(p, '[data-o="0"]', 'library item')
  console.log('API calls:', [...new Set(p.calls)].length)
  await x.ctx.close()

  // ---- free teacher: locked states, no prices
  x = await makePage(browser, FREE_USER); p = x.page
  for (const [path, name] of [['/ajira-pathya-jojana', 't40-ajira-free'], ['/abp', null], ['/ai-wallet', null], ['/tob', null]]) {
    await open(p, path); await p.waitForTimeout(1100)
    if (name) await shot(p, name, 100)
    const txt = await p.evaluate(() => document.body.innerText)
    if (/₹|Buy |Upgrade|Subscribe|Renew/.test(txt)) errors.push('purchase text on ' + path)
    await p.evaluate(() => LG.popAll())
  }
  await open(p, '/multigrade'); await p.waitForTimeout(400)
  await top(p, '#date').fill(nextWeekday())
  for (const i of [0, 1]) { await tap(p, `[data-set="${i}"]`, 500); for (const s of ['[data-pick="c5"]', '[data-pick="b1"]', '[data-pick="ch5"]', '[data-pick="l1"]']) await sheetTap(p, s) }
  await tap(p, '[data-gen]', 1000)
  if (!/Premium/.test(await top(p, '.form-err').innerText())) errors.push('free teacher multigrade message missing')
  await x.ctx.close()

  await browser.close()
  if (errors.length) { console.log('\nERRORS:\n' + [...new Set(errors)].join('\n')); process.exit(1) }
  console.log('\nAll tool screens OK')
})()

function nextWeekday() { const d = new Date(); d.setDate(d.getDate() + 1); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }
