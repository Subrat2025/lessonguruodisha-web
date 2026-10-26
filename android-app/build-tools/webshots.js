// Screenshots of live-site pages as they appear inside the app: Android status bar + native
// gradient header (same look as MainActivity's header) + the page rendered at the remaining height.
// Usage: node webshots.js <android-app dir> <siteBaseUrl e.g. http://127.0.0.1:3000>
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const ROOT = process.argv[2]
const SITE = process.argv[3]
const OUT = path.join(ROOT, 'dist/screenshots')
const W = 412, H = 915, DPR = 2.625, SAT = 32, BAR = 56
const ORIGIN = 'https://lessonguruodisha.in'
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 LessonGuruApp/1.3.0 (Android)'

const PAGES = [
  ['25-web-home', '/', 'Lesson Guru Odisha'],
  ['26-web-login', '/login', 'Login'],
  ['27-web-register', '/register', 'Create Account'],
  ['28-web-my-plan', '/my-plan', 'My Plan', true],
  ['29-web-about', '/about', 'About Us'],
  ['30-web-delete-account', '/delete-account', 'Delete Account'],
  ['31-web-delete-account-confirm', '/delete-account', 'Delete Account', true],
]

const icon = (d) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
const HEADER = (title) => `<!doctype html><html><body style="margin:0">
<div style="height:${SAT + BAR}px;background:linear-gradient(135deg,#4C1D95,#6D28D9 50%,#FF2D78);box-shadow:0 2px 8px rgba(0,0,0,.25);font-family:Roboto,'Noto Sans',system-ui;color:#fff">
 <div style="height:${SAT}px;display:flex;align-items:center;justify-content:space-between;padding:0 22px 0 26px;font:600 14px Roboto,system-ui"><span>9:41</span><span style="display:flex;gap:6px;align-items:center"><svg width="17" height="12" viewBox="0 0 17 12" fill="#fff"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="4.5" y="5.5" width="3" height="6.5" rx="1"/><rect x="9" y="3" width="3" height="9" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg><svg width="16" height="12" viewBox="0 0 16 12" fill="#fff"><path d="M8 2.5c2.3 0 4.4.9 6 2.4l1.3-1.4A10.5 10.5 0 0 0 8 .6 10.5 10.5 0 0 0 .7 3.5L2 4.9a8.6 8.6 0 0 1 6-2.4zm0 3.7c1.3 0 2.5.5 3.4 1.3l1.3-1.4A6.7 6.7 0 0 0 8 4.3a6.7 6.7 0 0 0-4.7 1.8l1.3 1.4C5.5 6.7 6.7 6.2 8 6.2zM8 12l2.3-2.5a3.3 3.3 0 0 0-4.6 0z"/></svg><svg width="26" height="13" viewBox="0 0 26 13"><rect x=".5" y=".5" width="22" height="12" rx="3.5" fill="none" stroke="#fff" opacity=".5"/><rect x="2" y="2" width="16" height="9" rx="2" fill="#fff"/><rect x="23.5" y="4.5" width="2" height="4" rx="1" fill="#fff" opacity=".5"/></svg></span></div>
 <div style="height:${BAR}px;display:flex;align-items:center;padding:0 4px">
  <div style="width:46px;display:grid;place-items:center">${icon('<path d="M15 5l-7 7 7 7"/>')}</div>
  <div style="flex:1;font-weight:700;font-size:17px;padding:0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
  <div style="width:46px;display:grid;place-items:center">${icon('<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M15.5 3.5l3.3 2.7-3.4 2.4"/>')}</div>
  <div style="width:46px;display:grid;place-items:center">${icon('<circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="M8.3 10.8l7.4-4.1M8.3 13.2l7.4 4.1"/>')}</div>
  <div style="width:46px;display:grid;place-items:center">${icon('<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5.5h4V20"/>')}</div>
 </div></div></body></html>`

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: W, height: H - SAT - BAR }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, userAgent: UA, locale: 'en-IN' })
  await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url())
    if (u.origin === ORIGIN && u.pathname === '/api/auth/me') return route.fulfill({ json: { user: { id: 'demo', name: 'Sunita Mohanty', mobile: '9876543210', role: 'teacher', securitySetupCompleted: true, subscription: { plan: 'yearly', status: 'active', expiryDate: new Date(Date.now() + 86400000 * 212).toISOString() } }, active: true } })
    if (u.origin === ORIGIN && u.pathname === '/api/account/deletion') return route.fulfill({ json: { request: null, slaDays: 30 } })
    if (u.origin === ORIGIN) {
      try { return route.fulfill({ response: await route.fetch({ url: SITE + u.pathname + u.search, timeout: 300000 }) }) } catch (e) { return route.abort() }
    }
    if (/fonts\.(googleapis|gstatic)\.com/.test(u.host)) return route.continue().catch(() => route.abort())
    return route.abort()
  })
  await ctx.addInitScript(() => {
    try { localStorage.setItem('em_install_dismissed', '1'); localStorage.setItem('em_ref_prompt_at', String(Date.now())) } catch (e) {}
    window.__LG_APP__ = true
  })
  const hdr = await browser.newContext({ viewport: { width: W, height: SAT + BAR }, deviceScaleFactor: DPR })
  const hp = await hdr.newPage()
  const page = await ctx.newPage()
  for (const [name, p, title, loggedIn] of PAGES.filter(x => !process.env.ONLY || x[0] === process.env.ONLY)) {
    try {
      await page.goto(ORIGIN + '/privacy', { waitUntil: 'load', timeout: 300000 })
      await page.evaluate((on) => { on ? localStorage.setItem('em_token', 'demo') : localStorage.removeItem('em_token') }, !!loggedIn)
      await page.goto(ORIGIN + p, { waitUntil: 'load', timeout: 300000 })
      if (loggedIn && p === '/delete-account') { await page.waitForTimeout(2500); await page.fill('input.font-mono', 'DELETE'); await page.evaluate(() => document.querySelector('form').scrollIntoView({ block: 'center' })) }
      await page.waitForTimeout(4500)
      await page.screenshot({ path: path.join(OUT, '_body.png') })
      await hp.setContent(HEADER(title))
      await hp.screenshot({ path: path.join(OUT, '_head.png') })
      // stitch with python (PIL) afterwards
      fs.renameSync(path.join(OUT, '_body.png'), path.join(OUT, name + '.body.png'))
      fs.renameSync(path.join(OUT, '_head.png'), path.join(OUT, name + '.head.png'))
      console.log('captured', name)
    } catch (e) { console.log('FAILED', name, e.message.split('\n')[0]) }
  }
  await browser.close()
})()
