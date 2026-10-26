import { backgroundJobsDisabled } from './background-jobs.js'
// /app/lib/driveSync.js — shared Google Drive → MongoDB sync logic + a daily
// background scheduler. Drive is the master store; we only index books/chapters
// tagged source:'gdrive'. Safe to call repeatedly (idempotent by driveFolderId /
// driveFileId). NEVER deletes records — vanished files are flagged unavailable.

import { getDb } from '@/lib/mongodb'
import { bookMetaFor } from '@/lib/osepaBooks.js'
import * as gdrive from '@/lib/googleDrive.js'
import { v4 as uuidv4 } from 'uuid'

const normClass = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim()

// Perform a full sync. Returns a report object. `trigger` is 'manual' | 'auto'.
export async function performDriveSync(d, { trigger = 'manual' } = {}) {
  const now = new Date()
  const cfg = await d.collection('driveConfig').findOne({ key: 'books' })
  const { books: crawled, apiCalls, classCount } = await gdrive.crawlBooks(cfg?.rootFolderId)

  const classes = await d.collection('classes').find({}, { projection: { id: 1, name: 1 } }).toArray()
  const clsByName = {}
  for (const c of classes) clsByName[normClass(c.name)] = c.id

  let newBooks = 0, updatedBooks = 0, newChapters = 0, updatedChapters = 0, unchanged = 0, skippedClass = 0
  const seenFileIds = new Set()
  const syncedBookIds = []

  for (const bk of crawled) {
    const classId = clsByName[normClass(bk.className)]
    if (!classId) { skippedClass++; continue }
    const meta = bookMetaFor(bk.subjectName) || bookMetaFor('General')
    let bookDoc = await d.collection('books').findOne({ source: 'gdrive', driveFolderId: bk.bookFolderId })
    if (!bookDoc) {
      const id = uuidv4()
      bookDoc = {
        id, classId, name: bk.bookName, subject: bk.subjectName,
        emoji: meta.emoji, color: meta.color, order: 0,
        source: 'gdrive', driveFolderId: bk.bookFolderId,
        published: true, hidden: false, allowOnlineView: true, allowDownload: false,
        createdAt: now, updatedAt: now, syncedAt: now,
      }
      await d.collection('books').insertOne(bookDoc)
      newBooks++
    } else {
      const upd = { classId, subject: bk.subjectName, emoji: meta.emoji, color: meta.color, updatedAt: now, syncedAt: now }
      if (!bookDoc.titleEdited) upd.name = bk.bookName
      await d.collection('books').updateOne({ id: bookDoc.id }, { $set: upd })
      updatedBooks++
    }
    syncedBookIds.push(bookDoc.id)

    for (const ch of bk.chapters) {
      seenFileIds.add(ch.driveFileId)
      const existing = await d.collection('chapters').findOne({ source: 'gdrive', driveFileId: ch.driveFileId })
      if (!existing) {
        await d.collection('chapters').insertOne({
          id: uuidv4(), bookId: bookDoc.id, classId,
          name: ch.chapterName, title: ch.chapterName, order: ch.chapterOrder,
          source: 'gdrive', driveFileId: ch.driveFileId, driveModifiedTime: ch.modifiedTime,
          pdfFilename: ch.name, pdfSize: ch.size,
          published: true, allowOnlineView: true, allowDownload: (bookDoc.allowDownload === true),
          driveUnavailable: false, createdAt: now, updatedAt: now, syncedAt: now,
        })
        newChapters++
      } else {
        const changed = existing.driveModifiedTime !== ch.modifiedTime || existing.bookId !== bookDoc.id || existing.driveUnavailable
        await d.collection('chapters').updateOne({ id: existing.id }, { $set: {
          bookId: bookDoc.id, classId,
          name: (existing.titleEdited ? existing.name : ch.chapterName),
          title: (existing.titleEdited ? existing.title : ch.chapterName), order: ch.chapterOrder,
          driveModifiedTime: ch.modifiedTime, pdfFilename: ch.name, pdfSize: ch.size,
          driveUnavailable: false, updatedAt: now, syncedAt: now,
        } })
        if (changed) updatedChapters++; else unchanged++
      }
    }
  }

  let missing = 0
  if (syncedBookIds.length) {
    const orphans = await d.collection('chapters').find({
      source: 'gdrive', bookId: { $in: syncedBookIds }, driveUnavailable: { $ne: true },
      driveFileId: { $nin: Array.from(seenFileIds) },
    }, { projection: { id: 1 } }).toArray()
    if (orphans.length) {
      await d.collection('chapters').updateMany(
        { id: { $in: orphans.map(o => o.id) } },
        { $set: { driveUnavailable: true, updatedAt: now } }
      )
      missing = orphans.length
    }
  }

  Promise.allSettled([
    d.collection('books').createIndex({ source: 1, driveFolderId: 1 }, { name: 'gdrive_book', background: true }),
    d.collection('chapters').createIndex({ source: 1, driveFileId: 1 }, { name: 'gdrive_chapter', background: true }),
  ]).catch(() => {})

  const report = { newBooks, updatedBooks, newChapters, updatedChapters, unchanged, missing, skippedClass, classCount, apiCalls, totalBooks: crawled.length, trigger }
  await d.collection('driveConfig').updateOne({ key: 'books' },
    { $set: { key: 'books', lastSyncAt: now, lastSyncStatus: 'success', lastSyncError: null, lastSyncReport: report, lastSyncTrigger: trigger, updatedAt: now } },
    { upsert: true })
  return report
}

// ── Background scheduler ────────────────────────────────────────────────────
let _started = false
const CHECK_EVERY_MS = 60 * 60 * 1000   // check hourly
const STALE_LOCK_MS = 30 * 60 * 1000    // consider a lock stale after 30 min

async function tick() {
  try {
    if (!gdrive.driveConfigured()) return
    const d = await getDb()
    const cfg = await d.collection('driveConfig').findOne({ key: 'books' })
    if (!cfg || cfg.autoSync !== true) return

    const intervalHours = Number(cfg.autoSyncIntervalHours) > 0 ? Number(cfg.autoSyncIntervalHours) : 24
    const lastAuto = cfg.lastAutoSyncAt ? new Date(cfg.lastAutoSyncAt).getTime() : 0
    const due = Date.now() - lastAuto >= intervalHours * 3600 * 1000
    if (!due) return

    // Concurrency lock (survives across the single server process).
    const lockAt = cfg.autoSyncLockAt ? new Date(cfg.autoSyncLockAt).getTime() : 0
    if (cfg.autoSyncRunning && Date.now() - lockAt < STALE_LOCK_MS) return
    await d.collection('driveConfig').updateOne({ key: 'books' }, { $set: { autoSyncRunning: true, autoSyncLockAt: new Date() } }, { upsert: true })

    try {
      const report = await performDriveSync(d, { trigger: 'auto' })
      await d.collection('driveConfig').updateOne({ key: 'books' }, { $set: { lastAutoSyncAt: new Date(), autoSyncRunning: false } })
      console.log(`[drive-autosync] done — +${report.newBooks} books · +${report.newChapters} chapters · updated ${report.updatedChapters} · missing ${report.missing}`)
    } catch (e) {
      await d.collection('driveConfig').updateOne({ key: 'books' }, { $set: { autoSyncRunning: false, lastSyncStatus: 'error', lastSyncError: String(e?.message || e), lastAutoSyncAt: new Date() } }).catch(() => {})
      console.error('[drive-autosync] failed:', e?.message)
    }
  } catch (e) {
    console.warn('[drive-autosync] tick warn:', e?.message)
  }
}

export function startDriveAutoSync() {
  if (_started || backgroundJobsDisabled()) return
  _started = true
  // First check shortly after boot, then hourly.
  setTimeout(tick, 45 * 1000)
  const h = setInterval(tick, CHECK_EVERY_MS)
  if (h.unref) h.unref()
  console.log('[drive-autosync] scheduler started (hourly check, daily default)')
}
