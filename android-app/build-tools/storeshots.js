// Google Play listing graphics: 1080x1920 phone screenshots with captions + 1024x500 feature graphic.
// Usage: node storeshots.js <android-app dir>
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const ROOT = process.argv[2]
const SHOTS = path.join(ROOT, 'dist/screenshots')
const OUT = path.join(ROOT, 'dist/store')
const FONTS = path.join(ROOT, 'src/main/assets/app/fonts')
const b64 = (f) => fs.readFileSync(f).toString('base64')
const img = (n) => `data:image/png;base64,${b64(path.join(SHOTS, n + '.png'))}`
const font = (name, file, w) => `@font-face{font-family:'${name}';font-weight:${w};src:url(data:font/woff2;base64,${b64(path.join(FONTS, file))}) format('woff2')}`
const FONTCSS = font('Poppins', 'poppins-latin-700-normal.woff2', 700) + font('Poppins', 'poppins-latin-800-normal.woff2', 800) + font('Poppins', 'poppins-latin-500-normal.woff2', 500) +
  font('NotoOriya', 'NotoSansOriya-700.woff2', 700) + font('NotoOriya', 'NotoSansOriya-600.woff2', 600)

const SLIDES = [
  ['05-home', 'Your day, planned<br>in seconds', 'ଆଜିର ଶିକ୍ଷଣ ଯୋଜନା, ଗୋଟିଏ ଟାପରେ', ['#FF8A00', '#FF2D78', '#7C3AED']],
  ['06-home-tools-streak', 'Panchapadi, papers<br>&amp; assessments', 'ପଞ୍ଚପଦୀ · ପ୍ରଶ୍ନପତ୍ର · ମୂଲ୍ୟାୟନ', ['#7C3AED', '#4F46E5', '#0EA5E9']],
  ['10-explore', '21 teaching tools<br>in one app', 'ସମସ୍ତ ସାଧନ ଗୋଟିଏ ଆପରେ', ['#0EA5E9', '#10B981', '#065F46']],
  ['20-cloud-library', 'Every PDF backed up<br>to your cloud', 'ପ୍ରତ୍ୟେକ PDF ସୁରକ୍ଷିତ, ଯେକୌଣସି ଫୋନରେ', ['#38BDF8', '#6366F1', '#312E81']],
  ['02-onboarding-1', 'Balvatika to Class 10,<br>NCF aligned', 'ବାଳବାଟିକା ରୁ ଶ୍ରେଣୀ ୧୦', ['#F43F5E', '#DB2777', '#7C3AED']],
  ['18-streak-milestone', 'Celebrate your<br>teaching streak', 'ପ୍ରତିଦିନ ଶିକ୍ଷଣ, ପ୍ରତିଦିନ ଉନ୍ନତି', ['#F59E0B', '#EA580C', '#BE185D']],
  ['13-my-plan-premium', 'Your Premium<br>works in the app', 'ଆପଣଙ୍କ Premium ଆପରେ ସକ୍ରିୟ', ['#B45309', '#4C1D95', '#1E0A4A']],
  ['25-web-home', 'The complete Lesson Guru<br>platform, in your pocket', 'ଓଡ଼ିଶାର ଶିକ୍ଷକଙ୍କ ପାଇଁ', ['#6D28D9', '#DB2777', '#F97316']],
]

const slideHtml = ([shot, title, od, g]) => `<!doctype html><html><head><style>${FONTCSS}
*{margin:0;box-sizing:border-box}body{width:1080px;height:1920px;overflow:hidden;font-family:Poppins,NotoOriya;color:#fff;
background:linear-gradient(160deg,${g[0]} 0%,${g[1]} 55%,${g[2]} 100%);position:relative}
.glow{position:absolute;border-radius:50%;filter:blur(60px);opacity:.45}
h1{position:absolute;top:120px;left:0;right:0;text-align:center;font-weight:800;font-size:76px;line-height:1.12;letter-spacing:-1px;text-shadow:0 6px 30px rgba(0,0,0,.25)}
p{position:absolute;top:330px;left:0;right:0;text-align:center;font-family:NotoOriya,Poppins;font-weight:600;font-size:42px;opacity:.95}
.phone{position:absolute;left:50%;top:470px;transform:translateX(-50%);width:700px;height:1555px;border-radius:84px;background:#0b0b14;padding:22px;
box-shadow:0 60px 120px -30px rgba(0,0,0,.55),0 0 0 3px rgba(255,255,255,.18) inset}
.phone img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:64px;display:block}
</style></head><body><div class="glow" style="width:520px;height:520px;background:#fff;top:-160px;left:-160px;opacity:.18"></div>
<div class="glow" style="width:600px;height:600px;background:${g[0]};bottom:-200px;right:-200px"></div>
<h1>${title}</h1><p>${od}</p><div class="phone"><img src="${img(shot)}"></div></body></html>`

const featureHtml = () => `<!doctype html><html><head><style>${FONTCSS}
*{margin:0;box-sizing:border-box}body{width:1024px;height:500px;overflow:hidden;font-family:Poppins,NotoOriya;color:#fff;
background:linear-gradient(120deg,#FF8A00 0%,#FF2D78 45%,#6D28D9 100%);position:relative}
.icon{position:absolute;left:64px;top:70px;width:128px;height:128px;border-radius:32px;box-shadow:0 20px 40px -12px rgba(0,0,0,.4)}
h1{position:absolute;left:64px;top:220px;font-weight:800;font-size:58px;line-height:1.05;letter-spacing:-1px}
h1 span{display:block;font-size:30px;letter-spacing:8px;color:#FFE27A;margin-top:6px}
p{position:absolute;left:64px;top:360px;font-weight:500;font-size:21px;opacity:.95;width:470px;line-height:1.45}
.od{font-family:NotoOriya;font-weight:600;font-size:21px}
.ph{position:absolute;width:250px;height:540px;border-radius:36px;background:#0b0b14;padding:9px;box-shadow:0 30px 60px -20px rgba(0,0,0,.6)}
.ph img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:28px}
</style></head><body>
<img class="icon" src="data:image/png;base64,${b64(path.join(OUT, 'play-store-icon-512.png'))}">
<h1>Lesson Guru<span>ODISHA</span></h1>
<p>Lesson plans · Panchapadi · Question papers · Cloud library<br><span class="od">ଓଡ଼ିଶାର ଶିକ୍ଷକଙ୍କ ପାଇଁ</span></p>
<div class="ph" style="left:560px;top:60px;transform:rotate(-6deg)"><img src="${img('05-home')}"></div>
<div class="ph" style="left:760px;top:20px;transform:rotate(5deg)"><img src="${img('20-cloud-library')}"></div>
</body></html>`

;(async () => {
  const b = await chromium.launch()
  const page = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })
  for (let i = 0; i < SLIDES.length; i++) {
    await page.setContent(slideHtml(SLIDES[i]), { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: path.join(OUT, 'phone', `play-${i + 1}-${SLIDES[i][0]}.png`), type: 'png', omitBackground: false })
  }
  await page.setViewportSize({ width: 1024, height: 500 })
  await page.setContent(featureHtml(), { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: path.join(OUT, 'feature-graphic-1024x500.png') })
  await b.close()
  console.log('store graphics written')
})()
