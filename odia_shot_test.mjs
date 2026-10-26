import { loadOdiaFontCSS } from '/app/lib/lesson-plan-security.js'
import puppeteer from 'puppeteer'
const odia = 'ଓଡ଼ିଆ ପାଠ ଯୋଜନା ଶିକ୍ଷକ'
const css = loadOdiaFontCSS()
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}\nbody{font-family:'Noto Sans Oriya Embedded','Inter',system-ui,sans-serif;color:#000;font-size:40pt;background:#fff;padding:20px;}</style></head><body><div>${odia}</div></body></html>`
const b = await puppeteer.launch({headless:'new',executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-setuid-sandbox','--font-render-hinting=none']})
const p = await b.newPage()
await p.setViewport({width:900,height:300})
await p.setContent(html,{waitUntil:'load'})
await p.evaluate(()=>document.fonts.ready)
// measure whether glyphs have real width (tofu boxes still have width, so also check fonts loaded)
const info = await p.evaluate(()=>{const fs=[];document.fonts.forEach(f=>fs.push(f.family+':'+f.status)); return {fonts:fs, txt:document.body.innerText}})
console.log(JSON.stringify(info))
await p.screenshot({path:'/tmp/odia_shot.png'})
await b.close()
