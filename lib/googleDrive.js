// /app/lib/googleDrive.js — Google Drive (Service Account) server-side helper.
// Credentials live ONLY in env vars (GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY).
// Never import this from client code. Never log the private key.
//
// Drive is the MASTER storage for the Books Library. MongoDB only holds an
// index (books/chapters). PDFs are proxied through the backend so credentials
// and raw Drive URLs are never exposed to the browser.

import { google } from 'googleapis'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const PDF_MIME = 'application/pdf'

let _drive = null

function req(name) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing environment variable: ${name}`)
  return v
}

export function driveConfigured() {
  return !!(process.env.GOOGLE_SA_CLIENT_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY)
}

export function getRootFolderId(override) {
  return override || process.env.GOOGLE_DRIVE_BOOKS_ROOT_ID || ''
}

export function getDrive() {
  if (_drive) return _drive
  const auth = new google.auth.JWT({
    email: req('GOOGLE_SA_CLIENT_EMAIL'),
    key: req('GOOGLE_SA_PRIVATE_KEY').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  _drive = google.drive({ version: 'v3', auth })
  return _drive
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Retry transient Google API failures with capped exponential backoff.
export async function driveCall(op, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await op()
    } catch (error) {
      const status = Number(error?.response?.status ?? error?.code)
      const retryable = [408, 429, 500, 502, 503, 504].includes(status)
      if (!retryable || i === attempts - 1) throw error
      await sleep(2 ** i * 400 + Math.random() * 250)
    }
  }
}

// Shared-drive params (harmless for My Drive too).
export function sharedDriveParams() {
  return { supportsAllDrives: true, includeItemsFromAllDrives: true }
}

// List direct children of a folder (handles pagination).
export async function listChildren(drive, parentId) {
  const files = []
  let pageToken
  do {
    const res = await driveCall(() =>
      drive.files.list({
        q: `'${String(parentId).replace(/'/g, "\\'")}' in parents and trashed = false`,
        pageSize: 1000,
        pageToken,
        spaces: 'drive',
        orderBy: 'name_natural',
        fields:
          'nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime,parents,webViewLink,thumbnailLink)',
        ...sharedDriveParams(),
      })
    )
    files.push(...(res.data.files || []))
    pageToken = res.data.nextPageToken
  } while (pageToken)
  return files
}

// Test connection + return a shallow summary of the root folder.
export async function testConnection(rootId) {
  const drive = getDrive()
  const id = getRootFolderId(rootId)
  if (!id) throw new Error('No root folder configured')
  const meta = await driveCall(() =>
    drive.files.get({ fileId: id, fields: 'id,name,mimeType', ...sharedDriveParams() })
  )
  const children = await listChildren(drive, id)
  const folders = children.filter((c) => c.mimeType === FOLDER_MIME)
  const pdfs = children.filter((c) => c.mimeType === PDF_MIME)
  return {
    ok: true,
    rootId: id,
    rootName: meta.data.name,
    childFolders: folders.length,
    childPdfs: pdfs.length,
    sampleFolders: folders.slice(0, 15).map((f) => f.name),
  }
}

// Recursively collect every PDF beneath a folder (handles variable depth, e.g.
// Subject → Book → extra subfolder → PDFs). Returns flat list in natural order.
async function collectPdfs(drive, folderId, depthGuard = 0) {
  if (depthGuard > 6) return [] // safety against pathological nesting
  const children = await listChildren(drive, folderId)
  const pdfs = children.filter((c) => c.mimeType === PDF_MIME)
  const subfolders = children.filter((c) => c.mimeType === FOLDER_MIME)
  const result = pdfs.map((f) => f)
  for (const sub of subfolders) {
    const nested = await collectPdfs(drive, sub.id, depthGuard + 1)
    result.push(...nested)
  }
  return result
}

// Crawl the Class -> Subject -> Book(folder) -> Chapter PDFs hierarchy.
//   level 1 folder  = Class      (e.g. "Class 1", "Balvatika")
//   level 2 folder  = Subject    (e.g. "Odia", "Mathematics")
//   level 3 folder  = Book       (e.g. "ଝୁଲଣା ଶ୍ରେଣୀ ୧") — its PDFs (possibly
//                                  one level deeper) are the chapters.
//   PDFs directly under a Subject with no book folder → a book named after the
//   subject, each PDF a chapter.
// Returns { books: [{ className, subjectName, bookName, bookFolderId, chapters:[...] }], apiCalls, classCount }
export async function crawlBooks(rootId) {
  const drive = getDrive()
  const root = getRootFolderId(rootId)
  if (!root) throw new Error('No root folder configured')

  const books = []
  let apiCalls = 0
  const inc = () => { apiCalls++ }

  const classFolders = (await listChildren(drive, root)).filter((c) => c.mimeType === FOLDER_MIME)
  inc()

  const pushBook = (className, subjectName, bookName, bookFolderId, pdfFiles) => {
    if (!pdfFiles.length) return
    const chapters = pdfFiles.map((f) => ({
      chapterName: cleanName(f.name),
      chapterOrder: chapterOrderOf(f.name),
      driveFileId: f.id,
      name: f.name,
      size: f.size ? Number(f.size) : null,
      modifiedTime: f.modifiedTime || null,
    }))
    // stable sort by detected chapter number, then natural name
    chapters.sort((a, b) => (a.chapterOrder - b.chapterOrder) || a.name.localeCompare(b.name, undefined, { numeric: true }))
    chapters.forEach((c, i) => { c.chapterOrder = i + 1 })
    books.push({ className, subjectName, bookName: prettyBookName(bookName), rawBookName: bookName, bookFolderId, chapters })
  }

  for (const cls of classFolders) {
    const subjFolders = (await listChildren(drive, cls.id)).filter((c) => c.mimeType === FOLDER_MIME)
    inc()
    for (const subj of subjFolders) {
      const subjChildren = await listChildren(drive, subj.id)
      inc()
      const bookFolders = subjChildren.filter((c) => c.mimeType === FOLDER_MIME)
      const directPdfs = subjChildren.filter((c) => c.mimeType === PDF_MIME)

      // Case A: PDFs sitting directly under the subject → subject IS the book.
      if (directPdfs.length) {
        pushBook(cls.name, subj.name, subj.name, subj.id, directPdfs)
      }

      // Case B: each folder under the subject is a book; collect its PDFs (recursively).
      for (const bookFolder of bookFolders) {
        const pdfs = await collectPdfs(drive, bookFolder.id)
        inc()
        pushBook(cls.name, subj.name, bookFolder.name, bookFolder.id, pdfs)
      }
    }
  }

  return { books, apiCalls, classCount: classFolders.length }
}

function cleanName(fileName) {
  return String(fileName || '')
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Turn a Drive folder name into a clean, human display title.
//  "Ganita-Khela-Class-1-Chapters"        -> "Ganita Khela"
//  "Aama-Bichitra-Pruthibi-Class-3-Chapters" -> "Aama Bichitra Pruthibi"
//  "Pallavi-Class-3-Chapters"             -> "Pallavi"
// Odia / non-Latin titles are already clean — just normalise whitespace.
function prettyBookName(folderName) {
  let s = String(folderName || '').trim()
  if (!s) return s
  const hasNonLatin = /[^\u0000-\u024F\s\d._-]/.test(s) // e.g. Odia/Devanagari script
  s = s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (hasNonLatin) return s
  // Drop boilerplate tokens: "Class 5", "Class-5", trailing "Chapters"/"Chapter"
  s = s
    .replace(/\bclass[\s-]*\d+\b/gi, ' ')
    .replace(/\bchapters?\b/gi, ' ')
    .replace(/\bpart[\s-]*\d+\b/gi, (m) => m) // keep meaningful "Part N"
    .replace(/\s+/g, ' ')
    .trim()
  // Title-case Latin words (leave ALLCAPS acronyms & numbers/roman as-is).
  s = s.split(' ').map((w) => {
    if (!w) return w
    if (/^[A-Z0-9]+$/.test(w)) return w
    return w.charAt(0).toUpperCase() + w.slice(1)
  }).join(' ')
  return s || String(folderName || '').trim()
}

// Detect a chapter number from a filename ("Chapter-01-...", "ch 3", "3. ...").
function chapterOrderOf(fileName) {
  const s = String(fileName || '')
  const m =
    s.match(/(?:chapter|ch|अध्याय|ଅଧ୍ୟାୟ|ଅଧ୍ୟାଯ)[\s._-]*(\d+)/i) ||
    s.match(/^(\d+)/)
  return m ? Number(m[1]) : 9999
}

// Fetch metadata for a single file.
export async function getFileMeta(fileId) {
  const drive = getDrive()
  const res = await driveCall(() =>
    drive.files.get({
      fileId,
      fields: 'id,name,mimeType,size,modifiedTime,capabilities(canDownload)',
      ...sharedDriveParams(),
    })
  )
  return res.data
}

// Stream a file's bytes (optionally honoring a Range header).
export async function getFileStream(fileId, range) {
  const drive = getDrive()
  const res = await driveCall(() =>
    drive.files.get(
      { fileId, alt: 'media', ...sharedDriveParams() },
      { responseType: 'stream', ...(range ? { headers: { Range: range } } : {}) }
    )
  )
  return res // res.data = stream, res.status, res.headers
}

export { FOLDER_MIME, PDF_MIME }
