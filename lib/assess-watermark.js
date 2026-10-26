// ============================================================================
//  lib/assess-watermark.js — reproduce the Cloudinary per-page watermark with
//  sharp, EXACTLY matching assessPageImageUrl():
//    tiled diagonal text · Arial bold 30px · #3b82f6 · opacity 12% · angle 40°
//  Buyer-specific text → applied ON THE FLY at serve time over a clean render.
// ============================================================================
import sharp from 'sharp'

// Same sanitiser as lib/cloudinary.js (_wmSafe).
export function wmSafe(s) {
  return String(s || '').replace(/\*/g, 'x').replace(/[,/\\%#]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}
const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Build a full-page SVG with a rotated, tiled, low-opacity text pattern.
// Cloudinary's `tiled` flag (with NO explicit padding) repeats the TRIMMED text
// bounding box edge-to-edge. We replicate that: cell width ≈ rendered text
// advance, cell height ≈ the text's line box — no extra gap — so the number of
// repeats per page matches Cloudinary's density (not weaker).
function watermarkSvg(width, height, text, { fontSize = 30, color = '#3b82f6', opacity = 0.12 } = {}) {
  // Matched to Cloudinary's `fl_tiled` text density by measuring the repeat
  // period of its real output (white-canvas autocorrelation): for Arial-bold
  // font_size 30 the tile is ≈ 350×180 → vertical/horizontal periods 225/268px
  // vs Cloudinary's 230/268px (~2% error, i.e. same number of repeats/page).
  const approxTextW = Math.max(60, Math.round(text.length * fontSize * 0.61)) // Arial-bold advance ≈0.61em
  const cellW = approxTextW                  // edge-to-edge along the baseline (no gap)
  const cellH = Math.round(fontSize * 6.0)   // inter-line spacing that matches Cloudinary
  const baseline = Math.round(fontSize * 0.82)
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="wm" width="${cellW}" height="${cellH}" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
      <text x="0" y="${baseline}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${color}" fill-opacity="${opacity}">${escapeXml(text)}</text>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#wm)"/>
</svg>`
}

// Exported for the density-comparison tooling (lets callers crank opacity/colour).
export function watermarkSvgExport(width, height, text, opts = {}) {
  return watermarkSvg(width, height, wmSafe(text), opts)
}

// Apply the tiled diagonal watermark to a clean page image buffer.
// Returns a JPEG buffer. If `text` is empty, returns a re-encoded clean JPEG.
export async function applyPageWatermark(cleanImageBuffer, rawText, { maxWidth = 1200, quality = 82 } = {}) {
  let img = sharp(cleanImageBuffer, { failOn: 'none' }).rotate()
  const meta = await img.metadata()
  if (meta.width && meta.width > maxWidth) { img = img.resize({ width: maxWidth }) }
  const base = await img.jpeg({ quality }).toBuffer()
  const text = wmSafe(rawText)
  if (!text) return base
  const m2 = await sharp(base).metadata()
  const svg = watermarkSvg(m2.width, m2.height, text)
  return sharp(base).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality }).toBuffer()
}
