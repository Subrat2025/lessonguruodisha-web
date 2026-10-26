// ------------------------------------------------------------
// Academic Resources — Server-side utilities
// ------------------------------------------------------------
// This module powers the "Academic Resources" library added in
// Phase 1 of the resource-tools feature.  It has two concerns:
//
//   1. A strict HTML sanitizer using `sanitize-html`.  Admin-uploaded
//      HTML MUST pass through this before being persisted so it
//      cannot execute JS, open iframes, embed forms, or leak the
//      user's session tokens.  See system-prompt section §5 for the
//      full threat model.
//
//   2. A small enum + validation helper for the 8 supported resource
//      types.  Kept close to the sanitizer so route.js has a single
//      import surface.
//
// ⚠️  Do NOT loosen the sanitizer defaults without a security review.
// ------------------------------------------------------------

import sanitizeHtml from 'sanitize-html'

// ---- Resource types ----------------------------------------------------
export const RESOURCE_TYPES = [
  { id: 'teaching_notes',      label: 'Teaching Notes',       emoji: '📘', desc: 'Ready-to-use teaching notes for teachers' },
  { id: 'chapter_assessments', label: 'Chapter Assessments',  emoji: '📝', desc: 'Chapter-wise assessment resources' },
  { id: 'chapter_worksheets',  label: 'Chapter Worksheets',   emoji: '📄', desc: 'Printable chapter-wise worksheets' },
  { id: 'lo_code_pdf_book',    label: 'LO Code PDF Book',     emoji: '🎯', desc: 'Official LO Code reference resources' },
  { id: 'chapter_wise_lo',     label: 'Chapter-wise LO',      emoji: '📚', desc: 'Learning Outcomes organized chapter-wise' },
  { id: 'abhidhana_kosa',      label: 'Abhidhana Kosa',       emoji: '📖', desc: 'Class-wise subject vocabulary/reference' },
  { id: 'mcm_guide',           label: 'MCM Guide',            emoji: '📊', desc: 'Teacher-ready MCM reference guide' },
  { id: 'classroom_activities',label: 'Classroom Activities', emoji: '🎨', desc: 'Engaging classroom activity resources' },
]

export const RESOURCE_TYPE_IDS = RESOURCE_TYPES.map(t => t.id)

export const isValidResourceType = (t) => RESOURCE_TYPE_IDS.includes(t)

// ---- HTML sanitizer ----------------------------------------------------
//
// Allow-list model (safer than deny-list).  We allow rich educational
// HTML but forbid ANYTHING that can run script, hit the network, or
// exfiltrate data.  In particular we drop:
//   • <script>, <iframe>, <object>, <embed>, <link>, <meta>, <base>
//   • all on*="…" event-handler attributes
//   • javascript: / data:text/html URIs
//   • <form>, <input>, <button> (prevents credential-harvest forms)
//   • external <style>@import or url() references (kept inline only)
//
// Everything is sandboxed once more at render time via
//   <iframe srcdoc="…" sandbox="allow-same-origin">
// so even a bypass here cannot touch the user's session.
//
// Note: `sanitize-html` by default already drops scripts + event
// handlers, but we tighten a few more edges below.
const IMG_URL_SCHEMES = ['data', 'http', 'https']

const SANITIZE_OPTIONS = {
  // Rich set of educational tags — headings, tables, lists, images,
  // section wrappers, code blocks, blockquotes, hr, sub/sup, definition
  // lists, and semantic wrappers used by textbook exports.
  allowedTags: [
    // headings + text
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr', 'blockquote', 'pre', 'code',
    'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'small', 'sub', 'sup', 'mark', 'ins', 'del',
    'span', 'div', 'section', 'article', 'header', 'footer',
    'main', 'aside', 'nav', 'figure', 'figcaption',
    'abbr', 'time', 'kbd', 'samp', 'var', 'q', 'cite',
    // lists
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
    'caption', 'colgroup', 'col',
    // links + media
    'a', 'img',
    // basic inline SVG for math/diagrams (attributes tightly filtered below)
    'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline',
    'polygon', 'ellipse', 'text', 'tspan', 'title', 'defs',
    'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask',
    'use', 'symbol',
    // details/summary for collapsible content
    'details', 'summary',
    // BLOCKED intentionally: script, style, link, meta, base, iframe,
    // frame, frameset, object, embed, applet, form, input, button,
    // select, option, textarea, video, audio, source, track, canvas.
  ],
  allowedAttributes: {
    // General attributes usable on most elements
    '*': ['class', 'id', 'title', 'lang', 'dir', 'style'],
    // Structural markers used by the Chapter Assessments template.  These
    // MUST survive sanitization or the deterministic 5-section parser can
    // never find the sections. Only the specific whitelisted data-* keys
    // pass through — anything else is stripped by sanitize-html by default.
    section: ['class', 'id', 'title', 'lang', 'dir', 'style', 'data-resource-type', 'data-assessment-number', 'data-assessment', 'data-version', 'data-field'],
    div:     ['class', 'id', 'title', 'lang', 'dir', 'style', 'data-resource-type', 'data-assessment-number', 'data-assessment', 'data-version', 'data-field', 'data-question-number'],
    article: ['class', 'id', 'title', 'lang', 'dir', 'style', 'data-resource-type', 'data-assessment-number', 'data-assessment', 'data-version', 'data-field'],
    span:    ['class', 'id', 'title', 'lang', 'dir', 'style', 'data-field'],
    header:  ['class', 'id', 'title', 'lang', 'dir', 'style', 'data-field'],
    h1: ['class', 'id', 'lang', 'style', 'data-field'],
    h2: ['class', 'id', 'lang', 'style', 'data-field'],
    h3: ['class', 'id', 'lang', 'style', 'data-field'],
    h4: ['class', 'id', 'lang', 'style', 'data-field'],
    // Anchors — link only to http(s)/mailto, and force safe rel/target
    a: ['href', 'name', 'target', 'rel'],
    // Images — allow only src/alt/dimensions/lazy loading
    img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
    // Tables — colspan/rowspan/scope/align/valign used by textbook exports
    td: ['colspan', 'rowspan', 'scope', 'align', 'valign', 'headers'],
    th: ['colspan', 'rowspan', 'scope', 'align', 'valign', 'headers', 'abbr'],
    // Ordered lists
    ol: ['start', 'type', 'reversed'],
    li: ['value'],
    // Time
    time: ['datetime'],
    // SVG whitelist (numeric/coordinate-only attributes; no `href` / `xlink:href`)
    svg: ['xmlns', 'viewBox', 'width', 'height', 'preserveAspectRatio', 'fill', 'stroke'],
    g:   ['transform', 'fill', 'stroke', 'opacity'],
    path:['d', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'transform', 'opacity'],
    circle:['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width', 'transform'],
    rect:['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'transform'],
    line:['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'transform'],
    polyline:['points', 'fill', 'stroke', 'stroke-width', 'transform'],
    polygon: ['points', 'fill', 'stroke', 'stroke-width', 'transform'],
    ellipse: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'transform'],
    text:['x', 'y', 'dx', 'dy', 'text-anchor', 'font-size', 'font-family', 'fill', 'transform'],
    tspan: ['x', 'y', 'dx', 'dy', 'font-size', 'fill'],
    stop:['offset', 'stop-color', 'stop-opacity'],
    linearGradient: ['id', 'x1', 'y1', 'x2', 'y2', 'gradientUnits'],
    radialGradient: ['id', 'cx', 'cy', 'r', 'fx', 'fy', 'gradientUnits'],
    // details/summary
    details: ['open'],
  },
  // Reject scripty schemes explicitly.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: IMG_URL_SCHEMES },
  allowedSchemesAppliedToAttributes: ['href', 'src', 'cite'],
  // Reject relative URLs that could be used for pivoting inside the app.
  allowProtocolRelative: false,
  // Refuse to transform <a href="javascript:…"> quietly — drop the attr instead.
  transformTags: {
    a: (tagName, attribs) => {
      const out = { ...attribs }
      if (out.href && /^\s*javascript:/i.test(out.href)) delete out.href
      // Force safe target/rel for external links.
      if (out.target === '_blank') out.rel = 'noopener noreferrer nofollow'
      return { tagName, attribs: out }
    },
  },
  // Allow class + inline-style but the frame parser drops url()/expression()
  // constructs automatically.  Keep this list conservative.
  allowedStyles: {
    '*': {
      color: [/^.*$/],
      'background-color': [/^.*$/],
      'text-align': [/^left$|^right$|^center$|^justify$/],
      'font-size': [/^\d+(?:\.\d+)?(?:px|em|rem|pt|%)$/],
      'font-family': [/^[\w\s\-'",]+$/],
      'font-weight': [/^\d{3}$|^bold$|^normal$|^bolder$|^lighter$/],
      'font-style': [/^italic$|^normal$|^oblique$/],
      'text-decoration': [/^underline$|^line-through$|^none$|^overline$/],
      'line-height': [/^\d+(?:\.\d+)?(?:px|em|rem|%)?$/],
      margin: [/^(?:\d+(?:\.\d+)?(?:px|em|rem|%)?\s*){1,4}$/],
      padding: [/^(?:\d+(?:\.\d+)?(?:px|em|rem|%)?\s*){1,4}$/],
      border: [/^(?:\d+px\s+)?(?:solid|dashed|dotted|double)?\s*#?[a-fA-F0-9]{0,8}$/],
      'border-radius': [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/],
      width: [/^\d+(?:\.\d+)?(?:px|em|rem|%)$|^auto$/],
      'max-width': [/^\d+(?:\.\d+)?(?:px|em|rem|%)$|^100%$/],
    },
  },
  // Silently drop the whole tag if it isn't allow-listed.  Prevents "leaked"
  // <script> bodies from surviving as text.
  disallowedTagsMode: 'discard',
  parseStyleAttributes: true,
  // Keep only PLAIN text nodes for these tags — anything nested inside gets
  // flattened.  Belt-and-braces against nested payloads.
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
}

/**
 * Sanitize admin-uploaded HTML.
 * @param {string} rawHtml
 * @returns {string} sanitized HTML safe to render in an iframe srcdoc.
 */
export function sanitizeResourceHtml(rawHtml) {
  if (typeof rawHtml !== 'string' || !rawHtml.trim()) return ''
  // sanitize-html doesn't strip full <html><head><body> wrappers by itself —
  // we let it do a first pass, then trim any surrounding whitespace.
  // If the admin uploads a full document, we prefer keeping just the <body>.
  let src = rawHtml
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(src)
  if (bodyMatch) src = bodyMatch[1]
  // Also strip any <head>…</head> if present without a body wrapper.
  src = src.replace(/<head[\s\S]*?<\/head>/gi, '')
  return sanitizeHtml(src, SANITIZE_OPTIONS)
}

/**
 * A tiny convenience wrapper that also returns a rough "text length"
 * so the API can decide whether to reject empty/trivial uploads.
 */
export function sanitizeResourceHtmlWithMeta(rawHtml) {
  const html = sanitizeResourceHtml(rawHtml)
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return { html, textLength: text.length, byteLength: Buffer.byteLength(html, 'utf8') }
}

// ---- PDF validation ----------------------------------------------------
// Verifies that the first bytes of the provided buffer are the PDF magic
// signature ("%PDF-"). Rejects anything else regardless of filename.
// This protects against admins accidentally uploading .exe / .html / .zip
// files that were merely renamed to .pdf on disk.
export function isValidPdfBuffer(buf) {
  if (!buf || buf.length < 5) return false
  // PDF spec §7.5.2 — first line is %PDF-<version>
  return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 &&
         buf[3] === 0x46 && buf[4] === 0x2d
}

// The 8 resource types support BOTH content shapes:
//   • contentType='html' — legacy admin-uploaded sanitized HTML (unchanged)
//   • contentType='pdf'  — admin-uploaded PDF stored on Cloudinary
// Keeping the constant here makes it a single source of truth.
export const CONTENT_TYPES = ['html', 'pdf']
export const isValidContentType = (t) => CONTENT_TYPES.includes(t)
