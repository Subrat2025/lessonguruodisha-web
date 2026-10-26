/* Re-capture only affected screenshots (question-paper, assessment, daily-plan) */
const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')
const http = require('http')

const OUT = '/app/public/lp-screens'
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
    }, (res) => { let d=''; res.on('data',(c)=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){reject(e)}}) })
    req.on('error', reject); req.write(body); req.end()
  })
}

async function seedToken(page, token) {
  await page.goto(APP + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate((t) => {
    try {
      localStorage.setItem('em_token', t)
      localStorage.setItem('em_install_dismissed', '1')
      localStorage.setItem('em_a2hs_dismissed', '1')
      localStorage.setItem('em_referral_snooze', String(Date.now() + 1000*60*60*24*30))
      localStorage.setItem('em_referral_seen', '1')
      localStorage.setItem('em_referral_lastShown', String(Date.now()))
      localStorage.setItem('em_onboarding_done', '1')
      localStorage.setItem('em_offer_seen_all', '1')
    } catch (e) {}
  }, token)
}

async function dismissModals(page) {
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button')).forEach(b => {
      const t = (b.innerText || b.textContent || '').trim()
      if (t === '×' || t === 'X' || /Maybe Later|ପରେ ଦେଖା|Close|Dismiss|Not now|Later/i.test(t)) {
        try { b.click() } catch (e) {}
      }
    })
  })
}

;(async () => {
  const login = await apiLogin()
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/root/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  })
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(30000)
    await seedToken(page, login.token)

    async function go(url, name) {
      await page.goto(APP + url, { waitUntil: 'networkidle2' })
      await wait(3500)
      await dismissModals(page); await wait(500)
      await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false })
      console.log('  desktop →', name)
    }
    await go('/question-papers', 'question-paper-desktop')
    await go('/assessments', 'assessment-desktop')
    await go('/daily-plan', 'daily-plan-desktop')

    const mob = await browser.newPage()
    await mob.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
    await seedToken(mob, login.token)
    async function mgo(url, name) {
      await mob.goto(APP + url, { waitUntil: 'networkidle2' })
      await wait(3500)
      await dismissModals(mob); await wait(500)
      await mob.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false })
      console.log('  mobile →', name)
    }
    await mgo('/question-papers', 'question-paper-mobile')
    await mgo('/assessments', 'assessment-mobile')
    await mgo('/daily-plan', 'daily-plan-mobile')
  } finally { await browser.close() }
})()
