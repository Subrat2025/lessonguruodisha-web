# LessonGuru R2 Gateway — Cloudflare Worker setup (click-by-click)

This Worker is the bridge between our server and your R2 buckets, because the
hosting environment blocks the direct R2 S3 endpoint. Our server calls the
Worker over HTTPS with a signed (HMAC) request; the Worker reads/writes R2 via
native bindings.

You only have to do this **once**. Everything stays on the free tier.

---

## Option 1 — Cloudflare Dashboard (no tools to install)

### A. Create the Worker
1. Go to **dash.cloudflare.com** → left sidebar **Workers & Pages**.
2. Click **Create** → **Create Worker**.
3. Name it `lg-r2-gateway` → **Deploy** (it deploys a hello-world first).
4. Click **Edit code**.
5. Delete everything in the editor, then **paste the full contents of `worker.js`** (in this folder).
6. Click **Deploy** (top right).

### B. Bind both R2 buckets
1. Open the Worker → **Settings** tab → **Bindings** (or "Variables and Bindings").
2. **Add binding → R2 bucket**:
   - Variable name: `PRIVATE_BUCKET`  → Bucket: `lg-private-assets`
3. **Add binding → R2 bucket** again:
   - Variable name: `PUBLIC_BUCKET`  → Bucket: `lg-public-assets`
4. **Save / Deploy**.

### C. Add the shared secret
1. Still in **Settings → Variables and Secrets** (or "Variables").
2. **Add variable** → turn ON **Encrypt** (so it becomes a Secret):
   - Name: `GATEWAY_SECRET`
   - Value: a long random string (generate one — e.g. 48+ random characters).
3. **Save / Deploy**.
4. **Keep this exact value** — you'll paste the SAME value into our server's
   Secrets panel as `R2_GATEWAY_SECRET`.

### D. Get the Worker URL
1. On the Worker's overview page, copy the URL — it looks like:
   `https://lg-r2-gateway.<your-subdomain>.workers.dev`
2. Paste it into our server Secrets panel as `R2_GATEWAY_URL`.

---

## Option 2 — Command line (wrangler)
```bash
cd cloudflare-worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put GATEWAY_SECRET   # paste your random string
# URL is printed after deploy: https://lg-r2-gateway.<subdomain>.workers.dev
```

---

## What to give back to the agent (set in the server Secrets panel)
| Secret name          | Value                                                        |
|----------------------|--------------------------------------------------------------|
| `R2_GATEWAY_URL`     | `https://lg-r2-gateway.<your-subdomain>.workers.dev`         |
| `R2_GATEWAY_SECRET`  | the SAME random string you set as the Worker's `GATEWAY_SECRET` |

That's it. Our server will then route all R2 reads/writes through this Worker.

## Notes
- Free Workers tier: 100,000 requests/day — comfortably enough for normal app
  traffic. The one-time Cloudinary→R2 migration copy is throttled server-side
  and, if needed, spread across days to stay under the limit.
- The Worker never lists objects and never serves anything without a valid
  60-second HMAC signature. Public image reads do NOT go through the Worker —
  they are served directly by the `r2.dev` / custom-domain public URL.
