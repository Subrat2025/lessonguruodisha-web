// Lesson Guru Odisha — Panchapadi HTML lesson plan parser
// Parses official Odisha "Lesson Plan Register" HTML files (cover page + multi-period).
// Returns ARRAY of period rows ready for /admin/bulk-import.
//
// HTML Structure expected:
//   div.cover-page → div.cover-details (contains Class, Book/Subject, Chapter)
//   div.page (one per Period) → table.header-table (Chapter, Period#, Topic, Class, Book)
//                              → div.info-box (Learning Outcomes)
//                              → div.info-box (TLM)
//                              → table.panchapadi (5 rows: ପ୍ରସ୍ତାବନା / ଅନ୍ୱେଷଣ / ଆଲୋଚନା / ପ୍ରୟୋଗ / ମୂଲ୍ୟାୟନ)
//
// Falls back gracefully to legacy single-lesson heuristic parsing for older formats.

// ============ Class-name detection (supports Odia + Hindi + English) ============
// Multi-script regex map so Hindi-medium uploads (Class 6-10 Hindi etc.) parse
// the same way as the Odia-medium register.  Each entry's regex covers Odia
// ordinal, Hindi ordinal, English "Class N", and the bare digit pattern
// "कक्षा 6 / कक्षा: 8 (आठवीं)" used in the Government Hindi templates.
const ODIA_CLASS_MAP = [
  { rx: /balvatika|ବାଳବାଟିକା|बालवाटिका/i,                                                       name: 'Balvatika' },
  { rx: /ପ୍ରଥମ|୧ମ|class\s*1\b|कक्षा\s*[:\-]?\s*\(?\s*1\b|पहली|प्रथम/i,                            name: 'Class 1' },
  { rx: /ଦ୍ୱିତୀୟ|୨ୟ|class\s*2\b|कक्षा\s*[:\-]?\s*\(?\s*2\b|दूसरी|द्वितीय/i,                       name: 'Class 2' },
  { rx: /ତୃତୀୟ|୩ୟ|class\s*3\b|कक्षा\s*[:\-]?\s*\(?\s*3\b|तीसरी|तृतीय/i,                          name: 'Class 3' },
  { rx: /ଚତୁର୍ଥ|୪ର୍ଥ|class\s*4\b|कक्षा\s*[:\-]?\s*\(?\s*4\b|चौथी|चतुर्थ/i,                        name: 'Class 4' },
  { rx: /ପଞ୍ଚମ|୫ମ|class\s*5\b|कक्षा\s*[:\-]?\s*\(?\s*5\b|पाँचवीं|पांचवीं|पंचम/i,                  name: 'Class 5' },
  { rx: /ଷଷ୍ଠ|୬ଷ୍ଠ|class\s*6\b|कक्षा\s*[:\-]?\s*\(?\s*6\b|छठी|षष्ठ/i,                            name: 'Class 6' },
  { rx: /ସପ୍ତମ|୭ମ|class\s*7\b|कक्षा\s*[:\-]?\s*\(?\s*7\b|सातवीं|सप्तम/i,                          name: 'Class 7' },
  { rx: /ଅଷ୍ଟମ|୮ମ|class\s*8\b|कक्षा\s*[:\-]?\s*\(?\s*8\b|आठवीं|अष्टम/i,                          name: 'Class 8' },
  { rx: /ନବମ|୯ମ|class\s*9\b|कक्षा\s*[:\-]?\s*\(?\s*9\b|नौवीं|नवम/i,                             name: 'Class 9' },
  { rx: /ଦଶମ|୧୦ମ|class\s*10\b|कक्षा\s*[:\-]?\s*\(?\s*10\b|दसवीं|दशम/i,                          name: 'Class 10' },
]

// Odia numerals → ASCII
const ODIA_DIGIT_MAP = { '୦':'0','୧':'1','୨':'2','୩':'3','୪':'4','୫':'5','୬':'6','୭':'7','୮':'8','୯':'9' }
function odiaToAsciiNum(str) {
  if (!str) return ''
  return String(str).replace(/[୦-୯]/g, ch => ODIA_DIGIT_MAP[ch] || ch)
}

function detectClassFromText(text) {
  if (!text) return ''
  for (const p of ODIA_CLASS_MAP) {
    if (p.rx.test(text)) return p.name
  }
  return ''
}

function txt(el) {
  if (!el) return ''
  return (el.textContent || '').replace(/\s+/g, ' ').trim()
}

// Extract "label : value" pattern from a chunk of text (Odia colon styles)
function pickAfterLabel(source, labelRx) {
  if (!source) return ''
  const lines = source.split(/<br\s*\/?>|\n/i)
  for (const line of lines) {
    if (labelRx.test(line)) {
      // Strip HTML and the label
      const plain = line.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
      const m = plain.match(new RegExp(labelRx.source + '\\s*[:：]?\\s*(.+?)(?:\\s*\\||$)', 'i'))
      if (m && m[1]) return m[1].trim().replace(/[|]+$/, '').trim()
    }
  }
  return ''
}

// Parse cover page details (Class, Book, Chapter)
function parseCoverPage(doc) {
  const cover = doc.querySelector('.cover-page, div.cover-page')
  if (!cover) return { className: '', bookName: '', chapterName: '' }
  const detailsEl = cover.querySelector('.cover-details') || cover
  const html = detailsEl.innerHTML || ''
  // Split by <br> & try labels
  const className = (() => {
    const v = pickAfterLabel(html, /ଶ୍ରେଣୀ|Class/) || txt(detailsEl)
    return detectClassFromText(v) || detectClassFromText(txt(cover))
  })()
  const bookName = pickAfterLabel(html, /ବିଷୟ|Subject|Book/)
  const chapterRaw = pickAfterLabel(html, /ଅଧ୍ୟାୟ|Chapter|Lesson/)
  return { className, bookName, chapterName: chapterRaw }
}

// Pull Odia number out of "ପିରିୟଡ୍ ନଂ : ୧ (ପ୍ରଥମ)" → 1
function extractPeriodNumber(s) {
  if (!s) return 0
  const ascii = odiaToAsciiNum(s)
  const m = ascii.match(/(\d{1,3})/)
  return m ? parseInt(m[1], 10) : 0
}

// Parse the period header table — supports THREE layouts:
//   • Format A (Odia, old):   table.header-table with `<td>` cells like "ଅଧ୍ୟାୟ : <span>...</span>"
//   • Format B (Odia, new):   table.meta-table with `<td>` cells like "<strong>ଅଧ୍ୟାୟ/ପାଠ:</strong> ..."
//   • Format C (Hindi/govt):  label and value in SEPARATE adjacent cells:
//                              <td class="label">कक्षा:</td><td>आठवीं (8)</td>
// Ignores school name (ବିଦ୍ୟାଳୟ / विद्यालय) entirely so it never reaches the database/UI.
function parsePeriodHeader(table) {
  const out = { chapter: '', period: 0, book: '', className: '', topic: '', learningOutcomes: [], tlm: [] }
  if (!table) return out
  const cells = Array.from(table.querySelectorAll('td'))
  // Helper: when a cell is a pure label (class="label" or text ends with ':' and has no extra
  // content after stripping the label keyword), the value is in the NEXT adjacent <td>.
  // Returns the resolved "label + value" combined string so the existing single-cell logic
  // below can keep working unchanged.
  const resolveCellText = (cell, idx) => {
    const isLabelCell = (cell.className || '').toLowerCase().includes('label')
    const raw = txt(cell)
    if (!raw) return raw
    if (isLabelCell || /^[^:：]*[:：]\s*$/.test(raw)) {
      // Pure label cell — look ahead one sibling for the value.
      const next = cells[idx + 1]
      const nextText = next ? txt(next) : ''
      if (nextText) return `${raw.replace(/[:：]\s*$/, '')}: ${nextText}`
    }
    return raw
  }

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    const t = resolveCellText(cell, i)
    if (!t) continue
    // Explicitly ignore school name cell (privacy — never shown on website)
    if (/ବିଦ୍ୟାଳୟ|विद्यालय|School/i.test(t)) continue
    // Date / Duration / Teacher name cells aren't useful — skip
    if (/^\s*(ତାରିଖ|दिनांक|तारीख|Date|ସମୟ|समय|ଶିକ୍ଷକଙ୍କ\s*ନାମ|शिक्षक\s*का\s*नाम|Teacher)/i.test(t)) continue

    if ((/ଅଧ୍ୟାୟ\s*[/／]?\s*ପାଠ|ଅଧ୍ୟାୟ|अध्याय|पाठ|Chapter|Lesson/i.test(t)) && !out.chapter) {
      out.chapter = t.replace(/^.*?(ଅଧ୍ୟାୟ\s*[/／]?\s*ପାଠ|ଅଧ୍ୟାୟ|अध्याय|पाठ|Chapter|Lesson)\s*[:：]?\s*/i, '').trim()
    } else if ((/ପିରିୟଡ୍|ପିରିଅଡ|Period|କାଳାଂଶ|कालांश|कालखंड/i.test(t)) && !out.period) {
      const v = t.replace(/^.*?(ପିରିୟଡ୍\s*ନଂ|ପିରିୟଡ୍|ପିରିଅଡ|कालांश|कालखंड|Period)\s*[:：]?\s*/i, '').trim()
      out.period = extractPeriodNumber(v)
    } else if (/ବିଷୟ|विषय|Subject|पुस्तक|Book/i.test(t) && !out.book) {
      out.book = t.replace(/^.*?(ବିଷୟ|विषय|Subject|पुस्तक|Book)\s*[:：]?\s*/i, '').trim()
    } else if (/ଶ୍ରେଣୀ|कक्षा|Class/i.test(t) && !out.className) {
      const v = t.replace(/^.*?(ଶ୍ରେଣୀ|कक्षा|Class)\s*[:：]?\s*/i, '').trim()
      out.className = detectClassFromText(v) || detectClassFromText(t)
    } else if ((/ଉପବିଷୟ|Topic|Sub.?Topic|ପ୍ରସଙ୍ଗ|ବିଷୟବସ୍ତୁ|प्रकरण|प्रसंग|विषयवस्तु/i.test(t)) && !out.topic) {
      // Strip any combination of label tokens
      out.topic = t
        .replace(/^.*?(ଉପବିଷୟ\s*\/?\s*Topic|ଉପବିଷୟ|Topic|Sub.?Topic|ପ୍ରସଙ୍ଗ\s*\/?\s*ବିଷୟବସ୍ତୁ|ପ୍ରସଙ୍ଗ|ବିଷୟବସ୍ତୁ|प्रकरण|प्रसंग|विषयवस्तु)\s*[:：]?\s*/i, '')
        .replace(/^[\/\\:：\s]+/, '')
        .trim()
    } else if (/LO\s*(कोड|विवरण|Code|Description)|ଶିକ୍ଷଣ\s*ଫଳାଫଳ|Learning\s*Outcomes?|शिक्षण\s*परिणाम|अधिगम\s*उपलब्धि/i.test(t)) {
      // Inline LO (new format): "LO कोड: HI201" or "LO विवरण: ..." or "ଶିକ୍ଷଣ ଫଳାଫଳ: OD201 (…)"
      const v = t.replace(/^.*?(LO\s*(?:कोड|विवरण|Code|Description)|ଶିକ୍ଷଣ\s*ଫଳାଫଳ|Learning\s*Outcomes?|शिक्षण\s*परिणाम|अधिगम\s*उपलब्धि)\s*[:：]?\s*/i, '').trim()
      if (v) {
        out.learningOutcomes = out.learningOutcomes && out.learningOutcomes.length
          ? [...out.learningOutcomes, v]
          : [v]
      }
    } else if (/^TLM|TLM\s*[:：]|Teaching\s*Learning|ଶିକ୍ଷଣ\s*ସାମଗ୍ରୀ|शिक्षण\s*सामग्री/i.test(t)) {
      const v = t.replace(/^.*?(TLM|Teaching\s*Learning|ଶିକ୍ଷଣ\s*ସାମଗ୍ରୀ|शिक्षण\s*सामग्री)\s*[:：]?\s*/i, '').trim()
      if (v) out.tlm = v.split(/[,।;]\s*/).map(s => s.trim()).filter(Boolean)
    }
  }
  return out
}

// Extract info-box text after the section-header
function extractInfoBox(box) {
  if (!box) return ''
  const header = box.querySelector('.section-header')
  if (!header) return txt(box)
  // Remove header text, keep rest
  const clone = box.cloneNode(true)
  const h = clone.querySelector('.section-header')
  if (h) h.remove()
  return txt(clone)
}

function extractInfoBoxList(box) {
  if (!box) return []
  const items = Array.from(box.querySelectorAll('li')).map(li => txt(li)).filter(Boolean)
  if (items.length) return items
  const t = extractInfoBox(box)
  if (!t) return []
  // Split on common Odia/English separators
  return t.split(/[।]|(?:^|\s)[•·▪]\s+|\s{2,}|;|\n/).map(s => s.trim()).filter(s => s.length > 1)
}

// Find an info-box by section-header text regex
function findInfoBox(page, headerRx) {
  const boxes = Array.from(page.querySelectorAll('.info-box, div.info-box'))
  for (const box of boxes) {
    const hdr = box.querySelector('.section-header')
    const hdrText = txt(hdr) || txt(box).slice(0, 60)
    if (headerRx.test(hdrText)) return box
  }
  return null
}

// Panchapadi step matchers — supports BOTH naming conventions in BOTH Odia AND Hindi:
//   Format A (Odia): ପ୍ରସ୍ତାବନା → ଅନ୍ୱେଷଣ → ଆଲୋଚନା → ପ୍ରୟୋଗ → ମୂଲ୍ୟାୟନ
//   Format B (Odia): ଅଧୀତି    → ବୋଧ     → ଅଭ୍ୟାସ  → ପ୍ରୟୋଗ → ପ୍ରସାର
//   Format C (Hindi): अधीति (प्रस्तावना) → बोध (प्रस्तुतीकरण) → अभ्यास → प्रयोग → प्रसार
// All variants are mapped to the SAME DB keys (prastabana/anweshana/alochana/prayoga/mulyayana)
// so existing code keeps working. The `stepLabel` field preserves the actual rendered name.
const PANCHAPADI_STEPS = [
  { key: 'prastabana', rx: /ପ୍ରସ୍ତାବନା|ଅଧୀତି|प्रस्तावना|अधीति|prastabana|adhiti|introduction/i,                                       label: '୧. ଅଧୀତି (Adhiti) — Introduction / Preparation' },
  { key: 'anweshana',  rx: /ଅନ୍ୱେଷଣ|ବୋଧ|बोध|प्रस्तुतीकरण|anweshana|bodha|exploration|comprehension/i,                                  label: '୨. ବୋଧ (Bodha) — Conceptual Understanding' },
  { key: 'alochana',   rx: /ଆଲୋଚନା|ଅଭ୍ୟାସ|अभ्यास|आलोचना|alochana|abhyasa|discussion|practice/i,                                       label: '୩. ଅଭ୍ୟାସ (Abhyasa) — Practice' },
  { key: 'prayoga',    rx: /ପ୍ରୟୋଗ|प्रयोग|prayoga|application/i,                                                                       label: '୪. ପ୍ରୟୋଗ (Prayoga) — Application' },
  { key: 'mulyayana',  rx: /ମୂଲ୍ୟାୟନ|ପ୍ରସାର|प्रसार|मूल्यांकन|mulyayana|prasara|evaluation|extension/i,                                  label: '୫. ପ୍ରସାର (Prasara) — Expansion / Extension' },
]

function matchPanchapadiStep(stepCellText) {
  for (const s of PANCHAPADI_STEPS) {
    if (s.rx.test(stepCellText)) return s
  }
  return null
}

// Returns innerHTML preserving <b> and basic tags (we keep plain text version too)
function cellHtml(cell) {
  if (!cell) return ''
  // Strip wrapper, keep inner
  let html = cell.innerHTML || ''
  // Clean up extra whitespace
  html = html.replace(/\s+/g, ' ').trim()
  return html
}

// Parse the panchapadi table → object {prastabana:{teacher,student,timing}, ...}
// Supports BOTH formats:
//   Format A (3 cols): [step+timing] | [teacher] | [student]
//   Format B (4 cols): [step] | [timing] | [teacher] | [student]
function parsePanchapadiTable(table) {
  const result = {}
  if (!table) return result
  const rows = Array.from(table.querySelectorAll('tbody tr'))
  for (const row of rows) {
    const tds = row.querySelectorAll('td')
    if (tds.length < 3) continue
    const stepText = txt(tds[0])
    const step = matchPanchapadiStep(stepText)
    if (!step) continue
    let timing = ''
    let teacherIdx = 1, studentIdx = 2
    if (tds.length >= 4) {
      // Format B — timing is its own column
      timing = txt(tds[1])
      teacherIdx = 2; studentIdx = 3
    } else {
      // Format A — timing embedded in step cell as "(୫ ମିନିଟ୍)"
      const timeMatch = stepText.match(/\(([^)]+)\)/)
      timing = timeMatch ? timeMatch[1].trim() : ''
    }
    result[step.key] = {
      stepLabel: step.label,
      stepRaw: stepText,
      timing,
      teacherActivity: cellHtml(tds[teacherIdx]),
      teacherActivityText: txt(tds[teacherIdx]),
      studentActivity: cellHtml(tds[studentIdx]),
      studentActivityText: txt(tds[studentIdx]),
    }
  }
  return result
}

// =================== MAIN PARSER ===================
export function parseLessonHTML(htmlString) {
  if (typeof DOMParser === 'undefined') {
    // Should not happen client-side; legacy fallback
    return { rows: [], _legacy: legacyParse(htmlString) }
  }
  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlString, 'text/html')

  // 1) Parse cover page
  const cover = parseCoverPage(doc)
  let globalClass = cover.className || ''
  let globalBook = cover.bookName || ''
  let globalChapter = cover.chapterName || ''

  // 2) Iterate per-period pages
  const pages = Array.from(doc.querySelectorAll('div.page')).filter(p => !p.classList.contains('cover-page'))

  const rows = []
  for (const page of pages) {
    // Find header table (Format A: table.header-table; Format B: table.meta-table)
    const headerTable = page.querySelector('table.header-table, table.meta-table')
    const header = parsePeriodHeader(headerTable)

    // Extract chapter name from the page's heading (h1/h2) if the header table didn't
    // give us one.  Hindi/Odia government registers commonly put the chapter title in
    // the page heading instead of the header-table — patterns like:
    //   "📘 पाठ योजना - एक टोकरी भर मिट्टी (कालांश 1)"
    //   "📖 ପାଠ ଯୋଜନା - ମୋ ଗାଁ (ପିରିୟଡ୍ ୨)"
    //   "Lesson Plan - My Family - Period 3"
    let headingChapter = ''
    const heading = page.querySelector('h1, h2, h3')
    if (heading) {
      const ht = txt(heading)
      // Try to strip the "Lesson Plan - <chapter> (period N)" envelope
      const m = ht.match(/(?:पाठ\s*योजना|ପାଠ\s*ଯୋଜନା|Lesson\s*Plan|Lesson)\s*[-–—:]\s*(.+?)(?:\s*[\(（\[][^)）\]]*[\)）\]])?\s*$/i)
      if (m && m[1]) headingChapter = m[1].trim()
      // Last fallback: if the heading is short enough, treat the whole heading as the chapter title
      // after removing common emojis and the "(कालांश N)" / "(ପିରିୟଡ୍ N)" / "(Period N)" suffix.
      if (!headingChapter && ht && ht.length < 120) {
        headingChapter = ht
          .replace(/^[\p{Extended_Pictographic}\s]+/u, '')
          .replace(/\s*[\(（\[][^)）\]]*(?:कालांश|ପିରିୟଡ୍|पीरियड|Period|कालखंड)[^)）\]]*[\)）\]]\s*$/i, '')
          .replace(/^(?:पाठ\s*योजना|ପାଠ\s*ଯୋଜନା|Lesson\s*Plan)\s*[-–—:]\s*/i, '')
          .trim()
      }
    }

    // Resolve fields with fallback to cover, then to heading-extracted chapter
    const className = header.className || globalClass
    const bookName = header.book || globalBook
    const chapterName = header.chapter || globalChapter || headingChapter
    const period = header.period || (rows.length + 1)
    const topic = header.topic || ''

    // Find panchapadi table — supports any variant: table.panchapadi, table.pancha-table,
    // table.panchapadi-table, table.main-table, or any table whose class starts with "pancha"
    let panchTable = page.querySelector('table.panchapadi, table.pancha-table, table.panchapadi-table, table.main-table')
    if (!panchTable) {
      // Fallback — any table with a class starting with "pancha"
      panchTable = Array.from(page.querySelectorAll('table')).find(t => /pancha/i.test(t.className || ''))
    }
    if (!panchTable) {
      // Last resort — any table whose first row's first cell mentions a known Panchapadi step
      panchTable = Array.from(page.querySelectorAll('table')).find(t => {
        const firstStepCell = t.querySelector('tbody tr td')
        return firstStepCell && matchPanchapadiStep(txt(firstStepCell))
      })
    }

    // Skip pages that don't have a header-table AND no panchapadi (likely not a period page)
    if (!headerTable && !panchTable) continue

    // Learning outcomes — prefer inline header data, fallback to info-box
    let learningOutcomes = header.learningOutcomes || []
    if (!learningOutcomes.length) {
      const loBox = findInfoBox(page, /ଶିକ୍ଷଣ\s*ଫଳାଫଳ|Learning\s*Outcomes?/i)
      learningOutcomes = extractInfoBoxList(loBox)
    }

    // TLM — prefer inline header data, fallback to info-box
    let tlmList = header.tlm || []
    if (!tlmList.length) {
      const tlmBox = findInfoBox(page, /^TLM|TLM\s*[:：]|Teaching\s*Learning|ଶିକ୍ଷଣ\s*ସାମଗ୍ରୀ/i)
      tlmList = extractInfoBoxList(tlmBox)
    }

    // Homework box — Odia format puts it in div.hw-box inside footer; fallback to info-box.
    // Hindi register puts it in a <p> labeled "गृहकार्य:".
    let homework = ''
    const hwBoxEl = page.querySelector('.hw-box, div.hw-box')
    if (hwBoxEl) {
      // Strip the "ଘରକାମ :" / "गृहकार्य:" / "Homework:" label prefix
      const raw = txt(hwBoxEl)
      homework = raw.replace(/^\s*(ଘରକାମ|ଗୃହକାର୍ଯ୍ୟ|ଗୃହ\s*କାର୍ଯ୍ୟ|ଘର\s*କାମ|ଅଭ୍ୟାସ|गृहकार्य|गृह\s*कार्य|घर\s*का\s*काम|Homework|Home\s*work|Assignment|Practice)\s*[:：\-]?\s*/i, '').trim()
    }
    if (!homework) {
      const hwBox = findInfoBox(page, /ଘରକାମ|ଗୃହକାର୍ଯ୍ୟ|ଗୃହ\s*କାର୍ଯ୍ୟ|ଘର\s*କାମ|गृहकार्य|गृह\s*कार्य|Home\s*work|Assignment/i)
      if (hwBox) homework = extractInfoBox(hwBox)
    }
    if (!homework) {
      // Last fallback: any <p> on the page containing the homework label
      const ps = Array.from(page.querySelectorAll('p'))
      const hwP = ps.find(p => /^\s*(ଘରକାମ|ଗୃହକାର୍ଯ୍ୟ|गृहकार्य|गृह\s*कार्य|Home\s*work|Assignment)\s*[:：]/i.test(txt(p)))
      if (hwP) homework = txt(hwP).replace(/^.*?(ଘରକାମ|ଗୃହକାର୍ଯ୍ୟ|गृहकार्य|गृह\s*कार्य|Home\s*work|Assignment)\s*[:：]\s*/i, '').trim()
    }

    // Panchapadi
    const panchapadi = parsePanchapadiTable(panchTable)

    // Title (use topic, else "Period N: chapter")
    const title = topic
      ? `Period ${period}: ${topic}`
      : `Period ${period}${chapterName ? ': ' + chapterName : ''}`

    // Build searchable plain-text content (used for /search index)
    const contentParts = []
    if (topic) contentParts.push(topic)
    if (learningOutcomes.length) contentParts.push(learningOutcomes.join(' '))
    if (tlmList.length) contentParts.push('TLM: ' + tlmList.join(', '))
    Object.values(panchapadi).forEach(p => {
      if (p?.teacherActivityText) contentParts.push(p.teacherActivityText)
      if (p?.studentActivityText) contentParts.push(p.studentActivityText)
    })
    const content = contentParts.join('\n\n')

    rows.push({
      className, bookName, chapterName,
      period, title, topic,
      learningOutcomes, tlm: tlmList, homework,
      panchapadi,         // structured object with 5 keys
      content,            // flattened searchable text
      panchapadiSopana: '', // legacy field unused now
      activities: [], loCodes: [], assessmentQuestions: [],
      worksheet: '', teacherNotes: '',
    })
  }

  // 3) If no period pages detected, fallback to legacy single-lesson parsing
  if (rows.length === 0) {
    const legacy = legacyParse(htmlString)
    if (legacy && legacy.className) {
      rows.push({
        className: legacy.className, bookName: legacy.bookName, chapterName: legacy.chapterName,
        period: legacy.period || 1, title: legacy.title || `Period ${legacy.period || 1}`,
        topic: '', content: legacy.content || '',
        learningOutcomes: legacy.learningOutcomes || [], tlm: legacy.tlm || [],
        homework: legacy.homework || '', panchapadi: {},
        panchapadiSopana: legacy.panchapadiSopana || '',
        activities: legacy.activities || [], loCodes: legacy.loCodes || [],
        assessmentQuestions: legacy.assessmentQuestions || [],
        worksheet: legacy.worksheet || '', teacherNotes: legacy.teacherNotes || '',
      })
    }
  }

  return {
    rows,
    summary: {
      className: globalClass,
      bookName: globalBook,
      chapterName: globalChapter,
      periodsFound: rows.length,
    },
  }
}

// ============ LEGACY SINGLE-LESSON PARSER (fallback) ============
function legacyParse(htmlString) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlString, 'text/html')
    const fullText = (doc.body?.textContent || htmlString || '').replace(/\s+/g, ' ')
    const className = detectClassFromText(fullText)
    let bookName = ''
    const bm = fullText.match(/(?:book|ବିଷୟ|subject)\s*[:：\-]\s*([^\n,;|]+)/i)
    if (bm) bookName = bm[1].trim().slice(0, 80)
    let chapterName = ''
    const cm = fullText.match(/(?:chapter|ଅଧ୍ୟାୟ|ପାଠ)\s*[:：\-]?\s*([^\n,;|]+)/i)
    if (cm) chapterName = cm[1].trim().slice(0, 100)
    let period = 1
    const pm = fullText.match(/(?:period|ପିରିୟଡ୍)\s*([0-9୦-୯]+)/i)
    if (pm) period = parseInt(odiaToAsciiNum(pm[1]), 10) || 1
    const titleEl = doc.querySelector('h1, h2, title')
    const title = (titleEl?.textContent || '').trim() || `Period ${period}`
    const content = (doc.body?.innerHTML || htmlString).trim().replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    return { className, bookName, chapterName, period, title, content,
      learningOutcomes: [], tlm: [], teacherNotes: '', panchapadiSopana: '',
      activities: [], worksheet: '', homework: '', loCodes: [], assessmentQuestions: [] }
  } catch {
    return null
  }
}

export { ODIA_CLASS_MAP, PANCHAPADI_STEPS, odiaToAsciiNum, detectClassFromText }
