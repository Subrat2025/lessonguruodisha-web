# Google Apps Script — Extend Drive Bridge with `save` + `ping` Endpoints

The AI Lesson Generator's **Save-to-Drive** flow calls the existing bridge with:

```
POST https://script.google.com/macros/s/…/exec
Content-Type: application/json

{
  "action": "save",
  "path": ["Generated Lessons", "Class 1", "Odia", "ଝୁଲଣା ଶ୍ରେଣୀ ୧", "Chapter 01"],
  "fileName": "Chapter 01_P1_Panchapadi_2025-06-15.pdf",
  "mimeType": "application/pdf",
  "base64": "<base64-encoded-pdf>",
  "overwrite": false
}
```

Expected response:
```json
{ "ok": true, "success": true, "fileId": "…", "fileUrl": "https://drive.google.com/…", "versioned": false }
```

There is **also** a lightweight `ping` action — the admin "🧪 Test Drive Save"
button uses it to verify the handler is deployed **without writing any file**:

```
POST https://script.google.com/macros/s/…/exec
Content-Type: application/json

{ "action": "ping" }
```

Expected response:
```json
{ "ok": true, "action": "ping", "canSave": true, "version": "save-v1" }
```

---

## Apps Script patch — copy the whole block into your existing script

Open `script.google.com` → your project → append (or merge) the following
functions.  Keep every existing `doGet` / `list` / `file` code you already have —
only the `doPost` router and the new `_handleSave` / `_handlePing` are new.

```js
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'save') return _handleSave(body);
    if (body.action === 'ping') return _handlePing();
    return _json({ ok: false, error: 'Unknown POST action: ' + body.action });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

// Root of the LessonGuru Drive tree — same one used by GET actions.
var ROOT_FOLDER_ID = '1CniWaHqByQDzrtBhGdxOYC9DNJu1mIXE';

function _handlePing() {
  return _json({ ok: true, action: 'ping', canSave: true, version: 'save-v1' });
}

function _handleSave(body) {
  if (!body.fileName)  return _json({ ok: false, error: 'fileName required' });
  if (!body.base64)    return _json({ ok: false, error: 'base64 required' });
  if (!body.path || !body.path.length) return _json({ ok: false, error: 'path[] required' });

  // Walk / create the folder path under the root.
  var folder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  for (var i = 0; i < body.path.length; i++) {
    var name = String(body.path[i] || '').trim();
    if (!name) continue;
    var it = folder.getFoldersByName(name);
    folder = it.hasNext() ? it.next() : folder.createFolder(name);
  }

  var mimeType = body.mimeType || 'application/pdf';
  var blob = Utilities.newBlob(Utilities.base64Decode(body.base64), mimeType, body.fileName);

  // Duplicate handling.
  var existing = folder.getFilesByName(body.fileName);
  var versioned = false;
  if (existing.hasNext()) {
    if (body.overwrite === true) {
      // Trash the previous file so the new one becomes canonical.
      existing.next().setTrashed(true);
    } else {
      // Auto-version: append " vN.pdf" until we find an unused name.
      var base = body.fileName.replace(/\.pdf$/i, '');
      var v = 2;
      while (folder.getFilesByName(base + ' v' + v + '.pdf').hasNext()) v++;
      blob.setName(base + ' v' + v + '.pdf');
      versioned = true;
    }
  }

  var file = folder.createFile(blob);
  return _json({
    ok: true, success: true,
    fileId: file.getId(),
    fileUrl: 'https://drive.google.com/file/d/' + file.getId() + '/view',
    versioned: versioned,
  });
}

function _json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
```

---

## Deploy checklist

1. Open the existing Apps Script project (script.google.com).
2. Paste the `doPost`, `_handleSave`, `_handlePing`, `_json` functions above.
3. **Deploy → Manage deployments → Edit** the current web-app deployment.
4. Bump the version to a new one (e.g. "v3") — Apps Script won't publish new
   endpoints without a fresh version.
5. Set access = **Anyone** (same as your current GET deployment).
6. Save — the URL stays identical, so LessonGuru's `GOOGLE_DRIVE_BRIDGE_URL`
   env var doesn't need to change.
7. In LessonGuru → Admin → **AI Lesson Generator**, click
   **🧪 Test Drive Save Handler**.  A green toast (`Drive save handler ready`)
   confirms the deployment.

Until deployed, the endpoint returns:
`Unknown action: save — Apps Script needs the save handler…`
