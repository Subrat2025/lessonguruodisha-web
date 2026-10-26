package com.lessonguruodisha.app;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.MimeTypeMap;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/** Writes generated files into Downloads/LessonGuru and opens them. */
final class FileSaver {
    private final Context ctx;
    String lastName;
    private String lastMime;

    FileSaver(Context ctx) {
        this.ctx = ctx;
    }

    Uri saveDataUrl(String dataUrl, String name, String mime) throws IOException {
        int comma = dataUrl.indexOf(',');
        if (!dataUrl.startsWith("data:") || comma < 0) throw new IOException("bad data");
        String meta = dataUrl.substring(5, comma);
        if (mime == null || mime.isEmpty()) {
            int semi = meta.indexOf(';');
            mime = semi >= 0 ? meta.substring(0, semi) : meta;
        }
        if (mime.isEmpty()) mime = "application/octet-stream";
        byte[] bytes = meta.endsWith(";base64")
                ? Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
                : Uri.decode(dataUrl.substring(comma + 1)).getBytes("UTF-8");
        return save(bytes, cleanName(name, mime), mime);
    }

    private static String cleanName(String name, String mime) {
        String n = (name == null || name.trim().isEmpty()) ? "LessonGuru-" + System.currentTimeMillis() : name.trim();
        n = n.replaceAll("[\\\\/:*?\"<>|\\n\\r\\t]", "_");
        if (n.length() > 120) n = n.substring(0, 120);
        if (!n.contains(".")) {
            String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
            if (ext != null) n += "." + ext;
        }
        return n;
    }

    private Uri save(byte[] bytes, String name, String mime) throws IOException {
        lastName = name;
        lastMime = mime;
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = ctx.getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/LessonGuru");
            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new IOException("MediaStore insert failed");
            try (OutputStream os = cr.openOutputStream(uri)) {
                if (os == null) throw new IOException("cannot open output");
                os.write(bytes);
            }
            v.clear();
            v.put(MediaStore.MediaColumns.IS_PENDING, 0);
            cr.update(uri, v, null, null);
            return uri;
        }
        @SuppressWarnings("deprecation")
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "LessonGuru");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("cannot create folder");
        File f = new File(dir, name);
        int i = 1;
        String base = name.contains(".") ? name.substring(0, name.lastIndexOf('.')) : name;
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.')) : "";
        while (f.exists()) f = new File(dir, base + " (" + (i++) + ")" + ext);
        try (FileOutputStream fo = new FileOutputStream(f)) {
            fo.write(bytes);
        }
        lastName = f.getName();
        DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
        @SuppressWarnings("deprecation")
        long id = dm.addCompletedDownload(f.getName(), "Lesson Guru Odisha", true, mime, f.getAbsolutePath(), f.length(), true);
        return dm.getUriForDownloadedFile(id);
    }

    void open(Uri uri) {
        if (uri == null) return;
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, lastMime);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(ctx, "No app found to open " + lastName, Toast.LENGTH_SHORT).show();
        }
    }
}
