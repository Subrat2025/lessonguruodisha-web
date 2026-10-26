/* Injected into every page of the live site by the Android shell (idempotent).
 *  - blob:/data: downloads (html2pdf, jsPDF, FileSaver, a[download]) -> saved on the phone
 *  - every saved document is also backed up to the teacher's Cloud Library
 *  - window.open(blob:) previews -> saved (WebView can't render PDFs)
 *  - window.print() -> Android print framework
 *  - Razorpay checkout -> blocked (consumption-only app, Google Play Payments policy)
 *  - hides the PWA "Install app" banner inside the app
 */
(function () {
  if (window.__lgPatched) return
  window.__lgPatched = true
  window.__LG_APP__ = true
  try { localStorage.setItem('em_install_dismissed', '1') } catch (e) {}

  var EXT = {
    'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'application/zip': '.zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'text/html': '.html', 'text/csv': '.csv'
  }
  var CLOUD_OK = /\.(pdf|png|jpe?g|docx|xlsx|pptx|zip)$/i

  function token() { try { return localStorage.getItem('em_token') } catch (e) { return null } }
  function autoBackup() { try { return localStorage.getItem('lgapp_cloud_auto') !== '0' } catch (e) { return true } }

  function backup(blob, name) {
    if (!token() || !autoBackup() || !CLOUD_OK.test(name)) return
    var fd = new FormData()
    fd.append('file', blob, name)
    fd.append('name', name)
    fd.append('source', 'app-auto')
    fd.append('sourcePath', location.pathname)
    fetch('/api/cloud/files', { method: 'POST', headers: { Authorization: 'Bearer ' + token() }, body: fd })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j } }) })
      .then(function (x) {
        if (x.ok) LGApp.cloudStatus(x.j.duplicate ? 'duplicate' : 'ok', name)
        else LGApp.cloudStatus(x.j && x.j.code === 'QUOTA_EXCEEDED' ? 'quota' : 'error', (x.j && x.j.error) || '')
      })
      .catch(function () { LGApp.cloudStatus('error', 'offline') })
  }

  function saveBlob(blob, name) {
    name = name || ('LessonGuru-' + Date.now() + (EXT[blob.type] || ''))
    var fr = new FileReader()
    fr.onloadend = function () { LGApp.saveFile(fr.result, name, blob.type || '') }
    fr.readAsDataURL(blob)
    backup(blob, name)
  }

  function save(href, name) {
    if (window.LGApp && LGApp.haptic) LGApp.haptic('tap')
    fetch(href).then(function (r) { return r.blob() }).then(function (b) { saveBlob(b, name) })
      .catch(function (e) { LGApp.toast('Download failed: ' + e.message) })
  }

  function filenameFrom(cd) {
    if (!cd) return ''
    var m = cd.match(/filename\*=UTF-8''([^;]+)/i)
    if (m) { try { return decodeURIComponent(m[1].replace(/"/g, '')) } catch (e) {} }
    m = cd.match(/filename="?([^";]+)"?/i)
    return m ? m[1] : ''
  }

  // Same-origin http(s) downloads: fetch with the teacher's session so they can be backed up too.
  window.__lgDownload = function (url, guess) {
    var h = token() ? { Authorization: 'Bearer ' + token() } : {}
    fetch(url, { headers: h, credentials: 'include' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status)
      var name = filenameFrom(r.headers.get('content-disposition')) || guess
      return r.blob().then(function (b) { saveBlob(b, name) })
    }).catch(function () { LGApp.nativeDownload(url) })
  }
  window.__lgSave = save

  function handle(a) {
    var h = a.href || ''
    if (!/^(blob:|data:)/.test(h)) return false
    save(h, a.getAttribute('download'))
    return true
  }
  var oc = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download') && handle(this)) return
    return oc.apply(this, arguments)
  }
  var od = EventTarget.prototype.dispatchEvent
  EventTarget.prototype.dispatchEvent = function (ev) {
    if (this instanceof HTMLAnchorElement && ev && ev.type === 'click' && this.hasAttribute('download') && handle(this)) return true
    return od.apply(this, arguments)
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[download]')
    if (a && handle(a)) { e.preventDefault(); e.stopPropagation() }
  }, true)
  var ow = window.open
  window.open = function (u) {
    if (typeof u === 'string' && /^(blob:|data:)/.test(u)) { save(u, ''); return null }
    return ow.apply(window, arguments)
  }
  window.print = function () { LGApp.print(document.title || 'Lesson Guru') }

  // The app is consumption-only (Google Play Payments policy): nothing can be bought in it.
  // The website already hides purchase buttons in the app; this is the safety net — any
  // checkout that still gets opened shows a neutral notice instead of Razorpay.
  function blocked(R) {
    if (typeof R !== 'function' || R.__lgBlocked) return R
    function Razorpay() { this.on = function () { return this }; this.close = function () {} }
    Razorpay.prototype.open = function () { if (window.LGApp && LGApp.purchaseBlocked) LGApp.purchaseBlocked() }
    Razorpay.__lgBlocked = true
    return Razorpay
  }
  // Direct version (outside Play): payments are allowed. Open checkout in UPI-intent mode so
  // GPay / PhonePe / Paytm are listed inside the WebView (Razorpay needs webview_intent for that).
  function upi(R) {
    if (typeof R !== 'function' || R.__lgUpi) return R
    function Razorpay(opts) { opts = opts || {}; opts.webview_intent = true; return new R(opts) }
    Razorpay.prototype = R.prototype
    for (var k in R) { try { Razorpay[k] = R[k] } catch (e) {} }
    Razorpay.__lgUpi = true
    return Razorpay
  }
  if (window.__LG_DIRECT__) blocked = upi
  var rzp = blocked(window.Razorpay)
  try {
    Object.defineProperty(window, 'Razorpay', {
      configurable: true, enumerable: true,
      get: function () { return rzp },
      set: function (v) { rzp = blocked(v) }
    })
  } catch (e) { if (window.Razorpay) window.Razorpay = rzp }
})()
