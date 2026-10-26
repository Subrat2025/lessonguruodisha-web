// /app/lib/qaParser.js
// Parses a Q&A / Solved-Questions HTML file (student worksheet format).
// Expected structure:
//   <section class="page" id="pN">
//     <div class="page__eyebrow">…</div>
//     <h2>Page Heading</h2>
//     <div class="qa">
//       <p class="q">Question text</p>
//       <div class="ans">…</div>   or   <p class="a">…</p>
//       <ul class="tips">…</ul>       (options / list-style answer)
//       <div class="tbl"><table>…</table></div>
//       <div class="note">…</div>
//     </div>
//     …
//   </section>
//   <section class="remember">…</section>   (optional summary)
//
// Returns a normalised { title, pages, questionCount, summary } object.

import * as cheerio from 'cheerio'

function textOf($, node) {
  return $(node).text().replace(/\s+/g, ' ').trim()
}

function tableToRows($, tbl) {
  const rows = []
  $(tbl).find('tr').each((_, tr) => {
    const cells = []
    $(tr).find('th, td').each((__, td) => cells.push(textOf($, td)))
    if (cells.length) rows.push(cells)
  })
  return rows
}

function parseQaBlock($, node) {
  const question = textOf($, $(node).find('p.q').first())
  const answers = []
  $(node).children().each((_, child) => {
    const el = $(child)
    if (el.hasClass('ans')) {
      answers.push({ type: 'answer', text: textOf($, child) })
    } else if (el.is('p.a')) {
      answers.push({ type: 'paragraph', text: textOf($, child) })
    } else if (el.hasClass('tips') || el.is('ul.tips')) {
      const items = []
      el.find('li').each((__, li) => items.push(textOf($, li)))
      answers.push({ type: 'list', items })
    } else if (el.hasClass('tbl')) {
      const rows = tableToRows($, el.find('table').first())
      if (rows.length) answers.push({ type: 'table', rows })
    } else if (el.hasClass('note')) {
      answers.push({ type: 'note', text: textOf($, child) })
    }
  })
  return { question, answers }
}

function parseQaHtml(html) {
  const $ = cheerio.load(html)
  const title =
    textOf($, $('title').first()) ||
    textOf($, $('h1').first()) ||
    textOf($, $('.hero h1').first()) ||
    'Q&A Worksheet'

  // heroTag (e.g., "ଗଣିତ · ପ୍ରଶ୍ନ ଓ ଉତ୍ତର") if present
  const heroTag = textOf($, $('.hero__tag').first()) || ''
  const heroLead = textOf($, $('.hero p').first()) || ''

  const pages = []
  let questionCount = 0

  $('section.page').each((_, page) => {
    const pageNum = ($(page).attr('id') || '').replace(/[^0-9]/g, '') || String(pages.length + 1)
    const eyebrow = textOf($, $(page).find('.page__eyebrow').first())
    const heading = textOf($, $(page).find('h2').first())
    const intro = textOf($, $(page).find('p.intro').first())
    const qas = []
    $(page).find('.qa').each((__, qa) => {
      const block = parseQaBlock($, qa)
      if (block.question || (block.answers || []).length) {
        qas.push(block)
        questionCount += 1
      }
    })
    pages.push({ pageNum, eyebrow, heading, intro, qas })
  })

  // Optional summary
  let summary = null
  const rem = $('section.remember').first()
  if (rem.length) {
    const cards = []
    rem.find('.rcard').each((_, c) => {
      cards.push({
        key: textOf($, $(c).find('.k').first()),
        value: textOf($, $(c).find('.v').first()),
      })
    })
    summary = {
      heading: textOf($, rem.find('h2').first()) || 'ମନେ ରଖିବା ପାଇଁ',
      intro: textOf($, rem.find('p.intro').first()),
      cards,
    }
  }

  return { title, heroTag, heroLead, pages, questionCount, summary }
}

/**
 * Extract just the <body>…</body> inner HTML for storage.
 * Falls back to entire input if <body> not found.
 */
function extractBodyHtml(html) {
  const m = String(html || '').match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  return m ? m[1] : String(html || '')
}

export { parseQaHtml, extractBodyHtml }
