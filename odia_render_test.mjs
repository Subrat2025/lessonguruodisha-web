import { loadOdiaFontCSS, renderHtmlToPdf } from '/app/lib/lesson-plan-security.js'
import { writeFileSync } from 'node:fs'
const odia = 'ଓଡ଼ିଆ ପାଠ ଯୋଜନା ଶିକ୍ଷକ'
const css = loadOdiaFontCSS()
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}\n@page{size:A4 landscape;margin:8mm;} body{font-family:'Noto Sans Oriya Embedded','Inter','Noto Sans Oriya UI','Noto Sans Oriya','Kalinga','Lohit Odia','Nirmala UI',system-ui,sans-serif;color:#000;font-size:24pt;}</style></head><body><h1>${odia}</h1><p>${odia}</p></body></html>`
try {
  const pdf = await renderHtmlToPdf(html, { orientation:'landscape', margin:'8mm' })
  writeFileSync('/tmp/odia_test.pdf', pdf)
  console.log('PDF bytes:', pdf.length)
} catch(e){ console.error('RENDER ERR', e && e.stack || e) }
