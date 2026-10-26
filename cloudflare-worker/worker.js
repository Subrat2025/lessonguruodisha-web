/*
  LessonGuru R2 Gateway (Cloudflare Worker) - paste-safe build.
  Security: HMAC-SHA256 signature + 60s timestamp on every request;
  only put/get/head/delete; no listing; 25 MB upload cap;
  private bucket only via signed requests; errors logged without keys/contents.
  Bindings: PRIVATE_BUCKET -> lg-private-assets, PUBLIC_BUCKET -> lg-public-assets,
  GATEWAY_SECRET -> secret string.
*/

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_SKEW_SECONDS = 60;
const ALLOWED = new Set(["GET", "HEAD", "PUT", "DELETE"]);
const enc = new TextEncoder();

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  const bytes = Array.from(new Uint8Array(sig));
  return bytes.map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) { return false; }
  let out = 0;
  for (let i = 0; i < a.length; i++) { out |= a.charCodeAt(i) ^ b.charCodeAt(i); }
  return out === 0;
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status: status, headers: { "content-type": "application/json" } });
}

export default {
  async fetch(request, env, ctx) {
    let method = request.method.toUpperCase();
    let alias = "";
    try {
      if (!ALLOWED.has(method)) { return json(405, { error: "method_not_allowed" }); }
      if (!env.GATEWAY_SECRET) { console.error("config", method, "no_secret"); return json(500, { error: "server_misconfigured" }); }

      const url = new URL(request.url);
      const segments = url.pathname.split("/").filter(Boolean);
      alias = segments.shift() || "";
      const key = segments.map(function (s) { return decodeURIComponent(s); }).join("/");

      if (alias !== "public" && alias !== "private") { return json(400, { error: "bad_bucket" }); }
      if (!key || key.indexOf("..") !== -1) { return json(400, { error: "bad_key" }); }

      const ts = request.headers.get("x-lg-ts") || "";
      const sig = request.headers.get("x-lg-sig") || "";
      const tsNum = parseInt(ts, 10);
      if (!ts || !sig || !Number.isFinite(tsNum)) { return json(403, { error: "unsigned" }); }
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - tsNum) > MAX_SKEW_SECONDS) { return json(403, { error: "expired" }); }
      const expected = await hmacHex(env.GATEWAY_SECRET, method + "\n" + alias + "\n" + key + "\n" + ts);
      if (!safeEqual(expected, sig)) { return json(403, { error: "bad_signature" }); }

      const bucket = alias === "private" ? env.PRIVATE_BUCKET : env.PUBLIC_BUCKET;
      if (!bucket) { console.error("config", method, "no_binding"); return json(500, { error: "server_misconfigured" }); }

      if (method === "PUT") {
        const len = parseInt(request.headers.get("content-length") || "0", 10);
        if (Number.isFinite(len) && len > MAX_UPLOAD_BYTES) { return json(413, { error: "too_large" }); }
        const contentType = request.headers.get("content-type") || "application/octet-stream";
        const cacheControl = request.headers.get("x-lg-cache") || (alias === "public" ? "public, max-age=31536000, immutable" : "private, no-store");
        const body = await request.arrayBuffer();
        if (body.byteLength > MAX_UPLOAD_BYTES) { return json(413, { error: "too_large" }); }
        const obj = await bucket.put(key, body, { httpMetadata: { contentType: contentType, cacheControl: cacheControl } });
        return json(200, { ok: true, key: key, size: body.byteLength, etag: obj && obj.httpEtag ? obj.httpEtag : null });
      }

      if (method === "HEAD") {
        const obj = await bucket.head(key);
        if (!obj) { return new Response(null, { status: 404 }); }
        const h = new Headers();
        h.set("content-length", String(obj.size));
        if (obj.httpMetadata && obj.httpMetadata.contentType) { h.set("content-type", obj.httpMetadata.contentType); }
        h.set("etag", obj.httpEtag);
        h.set("cache-control", "private, no-store");
        return new Response(null, { status: 200, headers: h });
      }

      if (method === "GET") {
        const obj = await bucket.get(key);
        if (!obj) { return new Response(null, { status: 404 }); }
        const h = new Headers();
        h.set("content-type", obj.httpMetadata && obj.httpMetadata.contentType ? obj.httpMetadata.contentType : "application/octet-stream");
        h.set("content-length", String(obj.size));
        h.set("etag", obj.httpEtag);
        h.set("cache-control", "private, no-store");
        return new Response(obj.body, { status: 200, headers: h });
      }

      if (method === "DELETE") {
        await bucket.delete(key);
        return new Response(null, { status: 204 });
      }

      return json(405, { error: "method_not_allowed" });
    } catch (err) {
      console.error("gateway_error", method, alias, err && err.name ? err.name : "Error");
      return json(500, { error: "internal" });
    }
  }
};
