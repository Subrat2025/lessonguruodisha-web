// /app/lib/qbankParser.js
// Parses uploaded HTML files containing Question Bank items and returns a
// normalized array of question objects. Uses cheerio (already in package.json).
//
// Expected input structure (see /public/templates/qbank-import-template.html):
//   <div class="qb-question" data-class="Class 5" data-subject="Mathematics" ...>
//     <div class="qb-text">…</div>
//     <div class="qb-options">
//       <div class="qb-opt" data-correct="true|false">…</div>
//     </div>
//     <div class="qb-answer">…</div>
//     <div class="qb-explanation">…</div>
//   </div>
//
// Output element shape:
//   {
//     className: 'Class 5',
//     subjectName: 'Mathematics',
//     chapterName: 'Fractions',
//     topic: 'Adding Fractions',
//     loCode: 'M5.1.a',
//     questionType: 'MCQ',
//     difficulty: 'Easy',
//     marks: 1,
//     question: '<html>...</html>',
//     options: [{ id:'A', text:'1/6', isCorrect:false }, ...],
//     correctAnswer: '3/4',
//     explanation: '<html>...</html>',
//     tags: ['fractions','addition'],
//     images: [{ src, alt }],
//     rowIndex: 0,     // position in the file (1-based)
//     warnings: [],    // per-question soft warnings
//   }

import * as cheerio from 'cheerio'

const VALID_TYPES = ['MCQ', 'Fill', 'Short', 'Long', 'TrueFalse', 'Match', 'Numerical', 'VeryShort', 'Competency', 'Application']
const VALID_DIFFICULTIES = ['Easy', 'Medium', 'Hard']

function normType(v) {
  if (!v) return 'Short'
  const s = String(v).trim().toLowerCase().replace(/[\s_/-]/g, '')
  const map = {
    'mcq': 'MCQ', 'multiplechoice': 'MCQ', 'objective': 'MCQ',
    'fill': 'Fill', 'fillintheblank': 'Fill', 'fillintheblanks': 'Fill',
    'fillinblank': 'Fill', 'fillinblanks': 'Fill', 'fillblank': 'Fill', 'fillblanks': 'Fill', 'blank': 'Fill', 'blanks': 'Fill',
    'short': 'Short', 'shortanswer': 'Short',
    'veryshort': 'VeryShort', 'veryshortanswer': 'VeryShort', 'vsa': 'VeryShort',
    'long': 'Long', 'longanswer': 'Long', 'essay': 'Long',
    'truefalse': 'TrueFalse', 'true/false': 'TrueFalse', 'tf': 'TrueFalse',
    'match': 'Match', 'matching': 'Match', 'matchthefollowing': 'Match',
    'numerical': 'Numerical', 'num': 'Numerical', 'numeric': 'Numerical',
    'competency': 'Competency', 'competencybased': 'Competency', 'competencybasedquestion': 'Competency', 'competencybasedquestions': 'Competency',
    'application': 'Application', 'applicationbased': 'Application', 'applicationbasedquestion': 'Application', 'applicationbasedquestions': 'Application',
  }
  return map[s] || (VALID_TYPES.includes(v) ? v : 'Short')
}

function normDifficulty(v) {
  if (!v) return 'Medium'
  const s = String(v).trim().toLowerCase()
  if (['easy', 'e', 'low', 'basic'].includes(s)) return 'Easy'
  if (['hard', 'h', 'difficult', 'tough', 'high'].includes(s)) return 'Hard'
  if (['medium', 'm', 'mid', 'moderate'].includes(s)) return 'Medium'
  return VALID_DIFFICULTIES.includes(v) ? v : 'Medium'
}

function parseTags(raw) {
  if (!raw) return []
  return String(raw).split(/[,;|]/).map(t => t.trim()).filter(Boolean)
}

function extractImages($, el) {
  const imgs = []
  $(el).find('img').each((_, im) => {
    const src = $(im).attr('src') || ''
    const alt = $(im).attr('alt') || ''
    if (src) imgs.push({ src, alt })
  })
  return imgs
}

// Extract inner HTML but keep it clean (strip <script>, event handlers)
function safeInnerHtml($, el) {
  const $clone = $(el).clone()
  $clone.find('script,style').remove()
  // Strip on* event handlers
  $clone.find('*').each((_, node) => {
    const attribs = node.attribs || {}
    for (const k of Object.keys(attribs)) {
      if (k.toLowerCase().startsWith('on')) $(node).removeAttr(k)
    }
  })
  return $clone.html()?.trim() || ''
}
function safeText($, el) {
  return $(el).text().replace(/\s+/g, ' ').trim()
}

export function parseQBankHtml(htmlString) {
  const $ = cheerio.load(htmlString || '', { decodeEntities: false })
  const items = []
  const globalErrors = []

  // ---------------------------------------------------------------------
  // FORMAT DETECTION — support two schemas:
  //   (A) Legacy:  <div class="qb-question" data-class="..." data-subject="...">
  //   (B) Gemini:  <div class="header-banner"> with class/subject/chapter text,
  //                <details class="theme-*"> sections, and <div class="q-card">
  //                blocks with <span class="badge b-type|b-diff|b-marks|b-lo">.
  // ---------------------------------------------------------------------
  const $legacy = $('.qb-question')
  const $gemini = $('.q-card')
  if ($legacy.length === 0 && $gemini.length === 0) {
    globalErrors.push('No <div class="qb-question"> or <div class="q-card"> elements found. Please use the provided template.')
    return { items, errors: globalErrors, totalFound: 0 }
  }

  // ============ (A) LEGACY FORMAT ============
  $legacy.each((idx, el) => {
    const $q = $(el)
    const warnings = []
    const className   = ($q.attr('data-class')      || '').trim()
    const subjectName = ($q.attr('data-subject')    || '').trim()
    const chapterName = ($q.attr('data-chapter')    || '').trim()
    const topic       = ($q.attr('data-topic')      || '').trim()
    const loCode      = ($q.attr('data-lo-code')    || '').trim()
    const rawType     = ($q.attr('data-type')       || 'Short').trim()
    const rawDiff     = ($q.attr('data-difficulty') || 'Medium').trim()
    const marks       = parseInt($q.attr('data-marks') || '1', 10) || 1
    const tags        = parseTags($q.attr('data-tags'))
    if (!className)   warnings.push('Missing data-class')
    if (!subjectName) warnings.push('Missing data-subject')
    if (!chapterName) warnings.push('Missing data-chapter')
    const questionType = normType(rawType)
    const difficulty   = normDifficulty(rawDiff)
    const $text = $q.find('.qb-text').first()
    const question = safeInnerHtml($, $text) || safeInnerHtml($, $q)
    if (!question) warnings.push('Empty question text')
    const options = []
    let inferredAnswer = ''
    $q.find('.qb-options > .qb-opt, .qb-opt').each((oi, opt) => {
      const text = safeText($, opt)
      const isCorrect = String($(opt).attr('data-correct') || '').toLowerCase() === 'true'
      if (text) {
        options.push({ id: String.fromCharCode(65 + oi), text, isCorrect })
        if (isCorrect && !inferredAnswer) inferredAnswer = text
      }
    })
    const $ans = $q.find('.qb-answer').first()
    let correctAnswer = safeInnerHtml($, $ans)
    if (!correctAnswer && inferredAnswer) correctAnswer = inferredAnswer
    const $exp = $q.find('.qb-explanation').first()
    const explanation = safeInnerHtml($, $exp)
    const images = extractImages($, el)
    if (['MCQ', 'TrueFalse', 'Match'].includes(questionType) && options.length === 0) warnings.push(`Question type is ${questionType} but no options found`)
    items.push({
      className, subjectName, chapterName, topic, loCode,
      questionType, difficulty, marks,
      question, options, correctAnswer, explanation, tags, images,
      rowIndex: idx + 1, warnings,
    })
  })

  // ============ (B) GEMINI FORMAT ============
  if ($gemini.length > 0) {
    // Extract class/subject/chapter from <div class="header-banner">
    const $banner = $('.header-banner').first()
    const bannerText = safeText($, $banner)
    // Try patterns like: "Class: 6 | Subject: Odia | Chapter: ..."
    // Also handle Odia labels via loose regex.
    const pick = (labels) => {
      for (const label of labels) {
        const re = new RegExp(label + '\\s*[:\\-–]\\s*([^|•·\\n\\r]+)', 'i')
        const m = bannerText.match(re)
        if (m) return m[1].trim()
      }
      return ''
    }
    let bannerClass   = pick(['class', 'ଶ୍ରେଣୀ', 'कक्षा'])
    let bannerSubject = pick(['subject', 'ବିଷୟ', 'विषय'])
    let bannerChapter = pick(['chapter', 'ଅଧ୍ୟାୟ', 'अध्याय', 'lesson', 'ପାଠ'])

    // Fallback — <h1> often contains the chapter name
    if (!bannerChapter) {
      const h1 = safeText($, $banner.find('h1').first()) || safeText($, $('h1').first())
      if (h1) bannerChapter = h1
    }

    // Also support explicit data-* on the banner or html tag
    if (!bannerClass)   bannerClass   = ($('html').attr('data-class')   || $banner.attr('data-class')   || bannerClass).toString().trim()
    if (!bannerSubject) bannerSubject = ($('html').attr('data-subject') || $banner.attr('data-subject') || bannerSubject).toString().trim()
    if (!bannerChapter) bannerChapter = ($('html').attr('data-chapter') || $banner.attr('data-chapter') || bannerChapter).toString().trim()

    // "Class 6" or "6" → normalize to "Class 6"
    if (bannerClass && /^\d+$/.test(bannerClass.trim())) bannerClass = 'Class ' + bannerClass.trim()
    if (bannerClass && !/class/i.test(bannerClass) && /^\d/.test(bannerClass.trim())) bannerClass = 'Class ' + bannerClass.trim()

    // Map details theme class → question type (Gemini emits these on <details>)
    const THEME_TYPE_MAP = {
      'theme-mcq': 'MCQ',
      'theme-tf': 'TrueFalse',
      'theme-truefalse': 'TrueFalse',
      'theme-fill': 'Fill',
      'theme-match': 'Match',
      'theme-vsa': 'VeryShort',
      'theme-veryshort': 'VeryShort',
      'theme-sa': 'Short',
      'theme-short': 'Short',
      'theme-la': 'Long',
      'theme-long': 'Long',
      'theme-comp': 'Competency',
      'theme-competency': 'Competency',
      'theme-app': 'Application',
      'theme-application': 'Application',
      'theme-darkgreen': 'Application',
      'theme-numerical': 'Numerical',
    }
    // Also infer type from the section summary text
    const inferTypeFromSummary = (summ) => {
      const s = (summ || '').toLowerCase()
      if (/\b(mcq|multiple\s*choice)\b/.test(s)) return 'MCQ'
      if (/\btrue\s*[/\-]?\s*false\b/.test(s)) return 'TrueFalse'
      if (/\bfill\s*(in|the)?\s*blank/.test(s)) return 'Fill'
      if (/\bmatch/.test(s)) return 'Match'
      if (/\bvery\s*short/.test(s)) return 'VeryShort'
      if (/\bshort\s*answer\b/.test(s)) return 'Short'
      if (/\blong\s*answer\b/.test(s)) return 'Long'
      if (/\bcompetency/.test(s)) return 'Competency'
      if (/\bapplication/.test(s)) return 'Application'
      if (/\bnumerical/.test(s)) return 'Numerical'
      return null
    }

    // For each q-card, walk up to <details> to get section topic if not stated per-card
    $gemini.each((idx, el) => {
      const $q = $(el)
      const warnings = []

      // Badges
      const btype  = safeText($, $q.find('.badge.b-type').first())
      const bdiff  = safeText($, $q.find('.badge.b-diff').first()) || ($q.find('.badge.b-diff').first().attr('class') || '').replace(/.*b-diff\s+/, '').split(/\s+/)[0] || ''
      const bmarks = safeText($, $q.find('.badge.b-marks').first())
      const blo    = safeText($, $q.find('.badge.b-lo').first())

      // Section theme → topic + type fallback (from <details> ancestor)
      const $details = $q.parents('details').first()
      let topic = ''
      let typeFromTheme = null
      let typeFromSummary = null
      if ($details.length) {
        const summ = safeText($, $details.find('summary').first())
        topic = summ
          .replace(/^\s*[^\p{L}\p{N}]+/u, '')                      // leading emoji / punctuation
          .replace(/^section\s*\d+\s*[:\-]?\s*/i, '')               // "Section 1:"
          .replace(/\s*\(\s*\d+\s*\)\s*$/, '')                      // trailing "(12)"
          .replace(/\s*\d+\s*(questions?|प्रश्न|ପ୍ରଶ୍ନ)\s*$/i, '')  // trailing "12 Questions"
          .trim()

        typeFromSummary = inferTypeFromSummary(summ)
        const classes = ($details.attr('class') || '').split(/\s+/)
        for (const c of classes) {
          if (THEME_TYPE_MAP[c]) { typeFromTheme = THEME_TYPE_MAP[c]; break }
        }
      }

      // Priority: badge b-type > section summary text > details theme class > "Short"
      const questionType = normType(btype) !== 'Short'
        ? normType(btype)
        : (typeFromSummary || typeFromTheme || normType(btype || 'Short'))
      const difficulty   = normDifficulty(bdiff || 'Medium')
      const marksMatch   = String(bmarks).match(/\d+/)
      const marks        = marksMatch ? parseInt(marksMatch[0], 10) : 1
      const loCode       = (blo || '').replace(/^LO[:\-\s]*/i, '').trim()

      // Question text
      const $qtext = $q.find('.q-text').first()
      const question = safeInnerHtml($, $qtext)
      if (!question) warnings.push('Empty question text')

      // Options
      const options = []
      let inferredAnswer = ''
      $q.find('.options > .opt, .opt').each((oi, opt) => {
        const text = safeText($, opt)
        const isCorrect = String($(opt).attr('data-correct') || '').toLowerCase() === 'true'
        if (text) {
          options.push({ id: String.fromCharCode(65 + oi), text, isCorrect })
          if (isCorrect && !inferredAnswer) inferredAnswer = text
        }
      })

      // Answer + Explanation from answer-box (strip common label prefixes)
      const $box = $q.find('.answer-box').first()
      const $answerText = $box.find('.answer-text').first()
      const $explanation = $box.find('.explanation').first()
      const stripCite = s => (s || '').replace(/\[cite:[^\]]+\]/gi, '').replace(/^\s*(ଉତ୍ତର|Answer|Ans|उत्तर)\s*[:\-–]\s*/i, '').replace(/^\s*(ବ୍ୟାଖ୍ୟା|Explanation|Explain)\s*[:\-–]\s*/i, '').trim()
      const correctAnswerRaw = safeInnerHtml($, $answerText)
      const explanationRaw   = safeInnerHtml($, $explanation)
      let correctAnswer = stripCite(correctAnswerRaw)
      const explanation = stripCite(explanationRaw)
      if (!correctAnswer && inferredAnswer) correctAnswer = inferredAnswer

      // Match tables — keep the raw table HTML inside question, answer stays as pairs
      // (already covered because $qtext + $box preserve HTML)

      const images = extractImages($, el)

      if (['MCQ', 'TrueFalse', 'Match'].includes(questionType) && options.length === 0 && questionType !== 'Match') {
        warnings.push(`Question type is ${questionType} but no <div class="opt"> options found`)
      }

      items.push({
        className: bannerClass,
        subjectName: bannerSubject,
        chapterName: bannerChapter,
        topic,
        loCode,
        questionType,
        difficulty,
        marks,
        question,
        options,
        correctAnswer,
        explanation,
        tags: [],
        images,
        rowIndex: (items.length) + 1,
        warnings,
      })
    })
  }

  return { items, errors: globalErrors, totalFound: items.length }
}

// Group items into the Class → Subject → Chapter → Topic → Questions hierarchy
export function groupForPreview(items) {
  const tree = {}
  items.forEach((q, i) => {
    const c = q.className || '— Unknown Class —'
    const s = q.subjectName || '— Unknown Subject —'
    const ch = q.chapterName || '— Unknown Chapter —'
    const t = q.topic || '(no topic)'
    tree[c] = tree[c] || {}
    tree[c][s] = tree[c][s] || {}
    tree[c][s][ch] = tree[c][s][ch] || {}
    tree[c][s][ch][t] = tree[c][s][ch][t] || []
    tree[c][s][ch][t].push({ ...q, __idx: i })
  })
  return tree
}
