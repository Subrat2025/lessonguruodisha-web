/* Captures real product screenshots for /lp landing page */
const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')
const http = require('http')

const OUT = '/app/public/lp-screens'
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

const APP = 'http://localhost:3000'
const MOBILE = '9999900001'
const PASSWORD = 'Test@1234'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function apiLogin() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ mobile: MOBILE, password: PASSWORD })
    const req = http.request(APP + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
    }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => {
        try { resolve(JSON.parse(d)) } catch (e) { reject(e) }
      })
    })
    req.on('error', reject); req.write(body); req.end()
  })
}

async function seedToken(page, token) {
  await page.goto(APP + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate((t) => {
    try {
      localStorage.setItem('em_token', t)
      // dismiss install banner
      localStorage.setItem('em_install_dismissed', '1')
      localStorage.setItem('em_a2hs_dismissed', '1')
      // dismiss referral modal for a long time
      localStorage.setItem('em_referral_snooze', String(Date.now() + 1000*60*60*24*30))
      localStorage.setItem('em_referral_seen', '1')
      localStorage.setItem('em_referral_lastShown', String(Date.now()))
      // dismiss any other onboarding modals
      localStorage.setItem('em_onboarding_done', '1')
      localStorage.setItem('em_offer_seen_all', '1')
    } catch (e) {}
  }, token)
}

async function dismissModals(page) {
  await page.evaluate(() => {
    // Click any close (X) buttons in visible modals
    const selectors = [
      'button[aria-label="Close"]',
      'button.close', '[data-dismiss]',
    ]
    selectors.forEach(s => document.querySelectorAll(s).forEach(b => { try { b.click() } catch (e) {} }))
    // Buttons with X text
    Array.from(document.querySelectorAll('button')).forEach(b => {
      const t = (b.innerText || b.textContent || '').trim()
      if (t === '×' || t === 'X' || /Maybe Later|ପରେ ଦେଖା|Close|Dismiss|Not now|Later/i.test(t)) {
        try { b.click() } catch (e) {}
      }
    })
  })
}

async function clickText(page, re) {
  const els = await page.$$('button, a, div[role="tab"], [role="button"]')
  for (const el of els) {
    const t = await page.evaluate((n) => (n.innerText || n.textContent || '').trim(), el)
    if (t && re.test(t)) { try { await el.click(); return { ok: true, text: t } } catch (e) {} }
  }
  return { ok: false }
}

async function shot(page, name, opts = {}) {
  await dismissModals(page)
  await wait(300)
  await dismissModals(page)
  await wait(200)
  const filePath = path.join(OUT, name + '.png')
  await page.screenshot({ path: filePath, fullPage: opts.fullPage || false, ...opts })
  console.log('  saved →', name + '.png')
}

;(async () => {
  const login = await apiLogin()
  if (!login?.token) { console.error('Login failed:', login); process.exit(1) }
  console.log('API login OK for', login.user?.mobile)

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/root/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  })

  try {
    // ============ DESKTOP shots ============
    const page = await browser.newPage()
    page.setDefaultTimeout(30000)
    await seedToken(page, login.token)

    async function go(url, name) {
      await page.goto(APP + url, { waitUntil: 'networkidle2' })
      await wait(3500)
      await shot(page, name)
    }

    // 1. Home / Dashboard
    await go('/', 'home-desktop')
    // 2. Instant Lesson Plan (Panchapadi)
    await go('/instant-plan', 'panchapadi-desktop')
    // 3. Question Paper Generator
    await go('/question-papers', 'question-paper-desktop')
    // 4. Ajira Pathya Jojana
    await go('/ajira-pathya-jojana', 'ajira-desktop')
    // 5. Assessment Builder
    await go('/assessments', 'assessment-desktop')
    // 6. Daily Lesson Plans
    await go('/daily-plan', 'daily-plan-desktop')
    // 7. Books Library
    await go('/lessons', 'lessons-desktop')
    // 8. Question Bank
    await go('/qbank', 'qbank-desktop')

    // ============ MOBILE shots ============
    const mob = await browser.newPage()
    await mob.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
    await seedToken(mob, login.token)

    async function mgo(url, name) {
      await mob.goto(APP + url, { waitUntil: 'networkidle2' })
      await wait(3500)
      await shot(mob, name)
    }

    await mgo('/', 'home-mobile')
    await mgo('/instant-plan', 'panchapadi-mobile')
    await mgo('/question-papers', 'question-paper-mobile')
    await mgo('/ajira-pathya-jojana', 'ajira-mobile')
    await mgo('/assessments', 'assessment-mobile')
    await mgo('/daily-plan', 'daily-plan-mobile')

    console.log('\nAll screenshots saved to', OUT)
  } catch (e) {
    console.error('ERR:', e.message)
  } finally {
    await browser.close()
  }
})()
