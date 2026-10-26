// === STORE === GST-ready PDF receipt generated from order receipt data.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export async function buildReceiptPdf(receipt) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842]) // A4
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const indigo = rgb(0.14, 0.1, 0.37), coral = rgb(0.91, 0.27, 0.17), gray = rgb(0.4, 0.4, 0.4)
  let y = 790
  const text = (s, x, size, f = font, color = rgb(0, 0, 0)) => page.drawText(String(s == null ? '' : s), { x, y, size, font: f, color })
  // header
  text('LessonGuru Odisha', 40, 22, bold, indigo)
  text('Payment Receipt', 40, 12, font, gray); y -= 8
  page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 1, color: rgb(0.9, 0.9, 0.9) }); y -= 26
  // seller / gst
  text('Seller: ' + (receipt.seller || 'LessonGuru Odisha'), 40, 10, font, gray); y -= 14
  if (receipt.gstLegalName) { text('Legal name: ' + receipt.gstLegalName, 40, 10, font, gray); y -= 14 }
  if (receipt.gstin) { text('GSTIN: ' + receipt.gstin, 40, 10, font, gray); y -= 14 }
  if (receipt.gstAddress) { text('Address: ' + receipt.gstAddress, 40, 10, font, gray); y -= 14 }
  y -= 6
  // order meta
  text('Order #' + String(receipt.orderId).slice(-8), 40, 12, bold); text('Date: ' + new Date(receipt.date).toLocaleString('en-IN'), 330, 10, font, gray); y -= 16
  text('Buyer: ' + (receipt.buyer?.name || ''), 40, 10, font, gray); y -= 22
  // table header
  page.drawRectangle({ x: 40, y: y - 4, width: 515, height: 20, color: rgb(0.96, 0.96, 0.98) })
  text('Item', 46, 10, bold, indigo); text('Amount', 500, 10, bold, indigo); y -= 22
  for (const it of receipt.items || []) {
    const title = (it.title || '').slice(0, 70)
    text(title, 46, 10); text('Rs ' + Number(it.price || 0), 500, 10); y -= 16
    if (y < 120) { y = 790 }
  }
  y -= 6; page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.6, color: rgb(0.9, 0.9, 0.9) }); y -= 18
  text('Subtotal', 400, 10, font, gray); text('Rs ' + Number(receipt.subtotal || 0), 500, 10); y -= 15
  if (receipt.discount > 0) { text('Discount' + (receipt.couponCode ? ' (' + receipt.couponCode + ')' : ''), 400, 10, font, gray); text('-Rs ' + Number(receipt.discount), 500, 10); y -= 15 }
  text('Total', 400, 13, bold, indigo); text('Rs ' + Number(receipt.total || 0), 500, 13, bold, coral); y -= 30
  text('Thank you for your purchase! For support, contact LessonGuru Odisha on WhatsApp.', 40, 9, font, gray)
  text('This is a computer-generated receipt.', 40, 8, font, gray)
  return Buffer.from(await doc.save())
}
