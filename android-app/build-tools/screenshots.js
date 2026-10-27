// Captures phone-sized screenshots of every hub screen.
// The hub is served at its real in-app origin (https://lessonguruodisha.com/__app/) via request
// interception; account/plan APIs are mocked with demo data.
// Usage: node screenshots.js <android-app dir> [nextBaseUrl]
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const ROOT = process.argv[2]
const NEXT = process.argv[3] || ''
const ASSETS = path.join(ROOT, 'src/main/assets/app')
const OUT = path.join(ROOT, 'dist/screenshots')
const ORIGIN = 'https://lessonguruodisha.com'
const VIEW = { width: 412, height: 915 }
const DPR = 2.625
const SAT = 32 // simulated status bar height (css px)

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.woff2': 'font/woff2' }

const now = Date.now()
const DEMO_USER = {
  id: 'demo', name: 'Sunita Mohanty', mobile: '9876543210', school: 'Govt. UP School, Cuttack', role: 'teacher',
  subscription: { plan: 'yearly', status: 'active', startDate: new Date(now - 151 * 864e5).toISOString(), expiryDate: new Date(now + 214 * 864e5).toISOString() },
}
const FREE_USER = { ...DEMO_USER, subscription: { plan: 'free', status: 'inactive' } }
const PLANS = [
  { id: 'monthly', name: 'Monthly', price: 99, originalPrice: 149, days: 30, emoji: '🌱', enabled: true, tagline: 'Try everything for a month' },
  { id: 'yearly', name: 'Yearly Premium', price: 199, originalPrice: 1188, days: 365, emoji: '🚀', popular: true, enabled: true, tagline: 'Best value · less than ₹17/month' },
  { id: 'lifetime', name: 'Lifetime', price: 2499, originalPrice: 4999, days: 36500, emoji: '👑', enabled: true, tagline: 'Pay once, use forever' },
]

const ago = (h) => new Date(now - h * 3600e3).toISOString()
const DEMO_FILES = [
  { id: 'f1', name: 'ପଞ୍ଚପଦୀ ଶିକ୍ଷଣ ଯୋଜନା - Class 5 Gamata Ch 4.pdf', ext: 'pdf', kind: 'pdf', mime: 'application/pdf', bytes: 1843200, source: 'app-auto', sourcePath: '/panchapadi', starred: true, createdAt: ago(2) },
  { id: 'f2', name: 'Question Paper - Class 8 Science (SA-1).pdf', ext: 'pdf', kind: 'pdf', mime: 'application/pdf', bytes: 642000, source: 'app-auto', sourcePath: '/question-papers', starred: false, createdAt: ago(26) },
  { id: 'f3', name: 'Daily Lesson Plan - 24 Oct.pdf', ext: 'pdf', kind: 'pdf', mime: 'application/pdf', bytes: 412000, source: 'app-auto', sourcePath: '/daily-plan', starred: false, createdAt: ago(50) },
  { id: 'f4', name: 'Unit Test 2 - Class 6 Odia.pdf', ext: 'pdf', kind: 'pdf', mime: 'application/pdf', bytes: 958000, source: 'app-auto', sourcePath: '/assessments', starred: true, createdAt: ago(80) },
  { id: 'f5', name: 'Annual Plan 2026-27 Class 3.docx', ext: 'docx', kind: 'doc', mime: 'application/msword', bytes: 221000, source: 'app-upload', starred: false, createdAt: ago(130) },
  { id: 'f6', name: 'TLM chart - Fractions.jpg', ext: 'jpg', kind: 'image', mime: 'image/jpeg', bytes: 1320000, source: 'app-upload', starred: false, createdAt: ago(200) },
  { id: 'f7', name: 'Ajira Pathya Jojana - Class 4.pdf', ext: 'pdf', kind: 'pdf', mime: 'application/pdf', bytes: 530000, source: 'app-auto', sourcePath: '/ajira-pathya-jojana', starred: false, createdAt: ago(260) },
]
function cloudList(user, u) {
  const files = DEMO_FILES.filter(f => !u.searchParams.get('starred') || f.starred).filter(f => !u.searchParams.get('kind') || f.kind === u.searchParams.get('kind'))
  const prem = user && user.subscription && user.subscription.status === 'active'
  const bytes = DEMO_FILES.reduce((a, f) => a + f.bytes, 0)
  return { files, total: files.length, usage: { bytes, count: DEMO_FILES.length, quotaBytes: (prem ? 2048 : 100) * 1048576, maxFileBytes: 25 * 1048576, plan: prem ? 'premium' : 'free', upgradeQuotaBytes: prem ? null : 2048 * 1048576 } }
}

function dayKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }

async function makePage(browser, { user, seed = {}, warm = true }) {
  const ctx = await browser.newContext({
    viewport: VIEW, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 LessonGuruApp/1.3.0 (Android)',
  })
  await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url())
    if (u.origin === ORIGIN && u.pathname.startsWith('/__app/')) {
      const f = path.join(ASSETS, u.pathname.slice('/__app/'.length) || 'index.html')
      if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' })
      return route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) })
    }
    if (u.origin === ORIGIN && u.pathname === '/api/auth/me') {
      return user ? route.fulfill({ json: { user } }) : route.fulfill({ status: 401, json: { error: 'unauthorized' } })
    }
    if (u.origin === ORIGIN && u.pathname === '/api/plans') return route.fulfill({ json: { plans: PLANS } })
    if (u.origin === ORIGIN && u.pathname === '/api/cloud/files') {
      return user ? route.fulfill({ json: cloudList(user, u) }) : route.fulfill({ status: 401, json: { code: 'UNAUTHORIZED' } })
    }
    if (u.origin === ORIGIN && NEXT) {
      try {
        const resp = await route.fetch({ url: NEXT + u.pathname + u.search })
        return route.fulfill({ response: resp })
      } catch (e) { return route.abort() }
    }
    return route.abort()
  })
  const today = new Date()
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7))
  const init = {
    lgapp_onboarded: '1',
    ...(user ? { em_token: 'demo-token' } : {}),
    ...seed,
  }
  await ctx.addInitScript(({ init, warm, sat }) => {
    if (location.pathname.startsWith('/__app/')) {
      for (const [k, v] of Object.entries(init)) if (k !== '__weekN') localStorage.setItem(k, v)
      if (init.__weekN) {
        const t = new Date()
        const ws = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7)).getTime()
        localStorage.setItem('lgapp_week', JSON.stringify({ ws, n: +init.__weekN }))
      }
      if (warm) sessionStorage.setItem('lgapp_warm', '1')
      // the native shell would provide these insets
      window.LGApp = {
        getInfo: () => JSON.stringify({ platform: 'android', version: '1.3.0', sat, sab: 0, online: true }),
        haptic() {}, share() {}, openExternal() {}, rateApp() {}, toast() {}, isOnline: () => true,
        saveFile() {}, print() {}, exitApp() {}, setStatusBarStyle() {},
      }
    }
  }, { init, warm, sat: SAT })
  const page = await ctx.newPage()
  page._monday = monday
  return { ctx, page }
}

async function statusBar(page, dark) {
  await page.evaluate(({ sat, dark }) => {
    const s = document.createElement('div')
    s.style.cssText = `position:fixed;left:0;right:0;top:0;height:${sat}px;z-index:9999;display:flex;align-items:center;justify-content:space-between;padding:0 22px 0 26px;font:600 14px Poppins,system-ui;color:${dark ? '#1E1B4B' : '#fff'};pointer-events:none`
    s.innerHTML = '<span>9:41</span><span style="display:flex;gap:6px;align-items:center"><svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="4.5" y="5.5" width="3" height="6.5" rx="1"/><rect x="9" y="3" width="3" height="9" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg><svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 2.5c2.3 0 4.4.9 6 2.4l1.3-1.4A10.5 10.5 0 0 0 8 .6 10.5 10.5 0 0 0 .7 3.5L2 4.9a8.6 8.6 0 0 1 6-2.4zm0 3.7c1.3 0 2.5.5 3.4 1.3l1.3-1.4A6.7 6.7 0 0 0 8 4.3a6.7 6.7 0 0 0-4.7 1.8l1.3 1.4C5.5 6.7 6.7 6.2 8 6.2zM8 12l2.3-2.5a3.3 3.3 0 0 0-4.6 0z"/></svg><svg width="26" height="13" viewBox="0 0 26 13"><rect x=".5" y=".5" width="22" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".5"/><rect x="2" y="2" width="16" height="9" rx="2" fill="currentColor"/><rect x="23.5" y="4.5" width="2" height="4" rx="1" fill="currentColor" opacity=".5"/></svg></span>'
    document.body.appendChild(s)
  }, { sat: SAT, dark: !!dark })
}

async function shot(page, name, opts = {}) {
  await page.waitForTimeout(opts.wait || 900)
  if (!opts.noBar) await statusBar(page, opts.darkBar)
  const file = path.join(OUT, name + '.png')
  await page.screenshot({ path: file, fullPage: !!opts.full })
  console.log('saved', name)
}

async function hub(browser, name, { user = DEMO_USER, seed, tab = 'home', scroll = 0, setup, full, warm = true, waitFor, darkBar, wait } = {}) {
  const { ctx, page } = await makePage(browser, { user, seed, warm })
  await page.goto(`${ORIGIN}/__app/index.html#${tab}`)
  await page.waitForLoadState('networkidle')
  if (waitFor) await page.waitForTimeout(waitFor)
  if (setup) await setup(page)
  if (scroll) { await page.evaluate(y => window.scrollTo(0, y), scroll); await page.waitForTimeout(400) }
  await shot(page, name, { full, darkBar, wait })
  await ctx.close()
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const today = new Date()
  const lastDays = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - i); return dayKey(d) }))
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7))
  const richSeed = {
    lgapp_days: lastDays(5),
    lgapp_milestones: JSON.stringify([3]),
    __weekN: '7',
    lgapp_fav_class: JSON.stringify('5'),
    lg_navState_v1: JSON.stringify({ ts: Date.now() - 2 * 3600e3, context: { class: { name: 'Class 5' }, book: { name: 'Gamata (Mathematics)' }, chapter: { name: 'ଭଗ୍ନାଂଶ (Fractions)' } } }),
  }

  // 01 splash (cold start)
  {
    const { ctx, page } = await makePage(browser, { user: DEMO_USER, seed: richSeed, warm: false })
    await page.goto(`${ORIGIN}/__app/index.html`)
    await page.waitForTimeout(1100)
    await statusBar(page)
    await page.screenshot({ path: path.join(OUT, '01-splash.png') })
    console.log('saved 01-splash')
    await ctx.close()
  }
  // 02-04 onboarding (first launch, logged out)
  for (let i = 0; i < 3; i++) {
    const { ctx, page } = await makePage(browser, { user: null, seed: { lgapp_onboarded: '' }, warm: true })
    await page.addInitScript(() => { localStorage.removeItem('lgapp_onboarded') })
    await page.goto(`${ORIGIN}/__app/index.html`)
    await page.waitForTimeout(500)
    for (let k = 0; k < i; k++) { await page.click('#obNext'); await page.waitForTimeout(550) }
    await shot(page, `0${2 + i}-onboarding-${i + 1}`, { darkBar: true, wait: 900 })
    await ctx.close()
  }
  // home (premium member)
  await hub(browser, '05-home', { seed: richSeed })
  await hub(browser, '06-home-tools-streak', { seed: richSeed, scroll: 330 })
  await hub(browser, '07-home-continue-classes', { seed: richSeed, scroll: 860 })
  await hub(browser, '08-home-tip-stats', { seed: richSeed, scroll: 5000, wait: 1500 })
  // home (free user): no promo, nothing to buy in the app
  await hub(browser, '09-home-free-user', { user: FREE_USER, seed: richSeed, scroll: 1180 })
  // explore
  await hub(browser, '10-explore', { seed: richSeed, tab: 'explore' })
  await hub(browser, '11-explore-assessment-filter', { seed: richSeed, tab: 'explore', setup: async (p) => { await p.click('[data-cat="assess"]') } })
  await hub(browser, '12-explore-search-odia', { seed: richSeed, tab: 'explore', setup: async (p) => { await p.fill('#exq', 'ପଞ୍ଚପଦୀ'); await p.dispatchEvent('#exq', 'input') } })
  // My Plan (status only — purchases happen on the website)
  await hub(browser, '13-my-plan-premium', { seed: richSeed, tab: 'premium' })
  await hub(browser, '14-my-plan-free-user', { user: FREE_USER, seed: richSeed, tab: 'premium' })
  // profile
  await hub(browser, '15-profile-member', { seed: richSeed, tab: 'profile' })
  await hub(browser, '16-profile-menu', { seed: richSeed, tab: 'profile', scroll: 600 })
  await hub(browser, '17-profile-guest', { user: null, seed: richSeed, tab: 'profile' })
  // streak milestone celebration (7 days)
  await hub(browser, '18-streak-milestone', { seed: { ...richSeed, lgapp_days: lastDays(7), lgapp_milestones: JSON.stringify([3]) }, wait: 1500 })
  // cloud library
  await hub(browser, '20-cloud-library', { seed: richSeed, tab: 'cloud', wait: 1200 })
  await hub(browser, '21-cloud-file-actions', { seed: richSeed, tab: 'cloud', setup: async (p) => { await p.waitForTimeout(800); await p.click('[data-cmore="f1"]') } })
  await hub(browser, '22-cloud-free-user-starred', { user: FREE_USER, seed: richSeed, tab: 'cloud', setup: async (p) => { await p.waitForTimeout(800); await p.click('[data-ckind="starred"]') } })
  await hub(browser, '23-cloud-guest', { user: null, seed: richSeed, tab: 'cloud' })
  await hub(browser, '24-home-cloud-card', { seed: richSeed, setup: async (p) => { await p.waitForTimeout(800); await p.evaluate(() => document.getElementById('homeCloud').scrollIntoView({ block: 'center' })) } })
  // offline screen
  {
    const { ctx, page } = await makePage(browser, { user: DEMO_USER })
    await page.goto(`${ORIGIN}/__app/offline.html?from=%2Flessons`)
    await shot(page, '19-offline', { darkBar: true })
    await ctx.close()
  }
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
