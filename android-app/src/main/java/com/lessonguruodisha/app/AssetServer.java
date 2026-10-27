package com.lessonguruodisha.app;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceResponse;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/** Serves assets/app/** at https://lessonguruodisha.com/__app/** (same origin as the live site). */
final class AssetServer {
    private AssetServer() {
    }

    static WebResourceResponse serve(Context ctx, Uri uri) {
        if (uri == null || !"https".equals(uri.getScheme()) || !MainActivity.HOST.equals(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || !path.startsWith("/__app/")) return null;
        String rel = path.substring("/__app/".length());
        if (rel.isEmpty()) rel = "index.html";
        if (rel.contains("..")) return notFound();
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        headers.put("Access-Control-Allow-Origin", "*");
        try {
            InputStream in = ctx.getAssets().open("app/" + rel);
            String mime = mime(rel);
            String enc = mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json") || mime.endsWith("svg+xml") ? "utf-8" : null;
            return new WebResourceResponse(mime, enc, 200, "OK", headers, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(),
                new java.io.ByteArrayInputStream(new byte[0]));
    }

    private static String mime(String p) {
        String l = p.toLowerCase(java.util.Locale.US);
        if (l.endsWith(".html")) return "text/html";
        if (l.endsWith(".css")) return "text/css";
        if (l.endsWith(".js")) return "application/javascript";
        if (l.endsWith(".json")) return "application/json";
        if (l.endsWith(".svg")) return "image/svg+xml";
        if (l.endsWith(".png")) return "image/png";
        if (l.endsWith(".webp")) return "image/webp";
        if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg";
        if (l.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }
}
