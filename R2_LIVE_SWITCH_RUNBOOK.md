# R2 LIVE Switch Runbook (Cloudinary → Cloudflare R2)

> Goal: finish moving reads/writes from Cloudinary to R2 on LIVE **safely**, with
> a Cloudinary fallback kept the whole time. Nothing here flips a flag until the
> explicit GO step. Private assets are NEVER exposed publicly.

Owner actions are marked **[ADMIN]**; agent/CLI actions **[CLI]**.

---

## 0. Current state (as of this runbook)
- **Code**: R2-first read + Cloudinary fallback is deployed for private PDFs
  (official papers, academic resources, answer keys, store files). Secure
  viewers stream bytes through the server (no Cloudinary/R2 URL in the browser).
- **OG images**: new code renders the 1200×630 share image as **JPG in PUBLIC R2**
  (`cover.ogUrl`), with a Cloudinary-webp fallback if the R2 write fails.
- **LIVE flags (MUST stay OFF until GO):**
  - `STORAGE_WRITE` = (unset/off)  → new uploads stay on Cloudinary
  - `R2_READ_FLIP` = (unset/off)   → private reads use Cloudinary fallback
  - `ASSESS_VIEW_R2` = (unset/off) → assess viewer uses Cloudinary
- Reads resolve R2 by `publicId` via the **`r2_migration`** collection
  (`status:'done', bucket:'private'|'public'`). A 7-Oct bulk copy populated it.
- **⚠️ The `r2_migration` mapping + `r2_assets` backfill currently exist ONLY in the
  PREVIEW database.** LIVE has a SEPARATE database, so before GO the mapping must
  be imported into LIVE (the R2 buckets/objects are shared — only the DB rows differ).
- **🔐 No CLI on LIVE / no shared passwords:** every LIVE data operation below runs
  as an **admin-only background job (button) with a dry-run + live progress**, never
  a shell script. Jobs to be exposed in Admin → Store/Storage:
  `manifest-import`, `delta-copy`, `r2-assets-backfill`, `coverage-report`,
  `og-backfill`. (`og-backfill` already exists; the others are ⚠️ TO BE BUILT before GO.)

---

## 0.5 BACK UP LIVE FIRST (before ANY LIVE data write)
Take a restore point BEFORE manifest import / backfill / mark-failed etc.:
- **[ADMIN] In Emergent:** open the app → **Database** panel → create a **Snapshot /
  Backup (restore point)** of the production MongoDB, and note its timestamp/id.
  (If a managed snapshot isn't available, use "Export collections" for at least
  `r2_migration`, `storeProducts`, `official_papers`, `academicResources`,
  `wa_campaigns`, `settings`.)
- Only proceed once the backup is confirmed. Rollback = restore this snapshot.

---

## 1. Bring the MAPPING to LIVE (no file re-copy) + delta copy
The R2 objects from the 7-Oct bulk copy already exist in the shared buckets — only
the DB rows (`r2_migration`, and products' `r2_assets`) are missing on LIVE. So we
IMPORT the mapping, then copy ONLY assets uploaded after 7 Oct.

### 1a. Export the manifest from PREVIEW
**[CLI on PREVIEW only]** dump the mapping (safe, read-only):
```bash
mongoexport --uri "$MONGO_URL" --db "$DB_NAME" --collection r2_migration \
  --query '{"status":"done"}' --out r2_migration_manifest.json
```
(Keep it; this is the artifact imported into LIVE.)

### 1b. Import the manifest into LIVE — admin button (ADDITIVE, idempotent)
**[ADMIN] Admin → Storage → "Import R2 manifest"** (⚠️ TO BE BUILT):
- Upload `r2_migration_manifest.json`. The job **upserts** rows by `sourceId`
  (never deletes/overwrites existing LIVE rows), reports inserted/skipped, and has
  a **dry-run** that only counts what WOULD be inserted.

### 1c. r2_assets backfill — admin button
**[ADMIN] Admin → Storage → "R2 assets backfill"** (⚠️ TO BE BUILT):
- Re-points each product/paper/resource record's `r2_assets` using the imported
  mapping. Dry-run + progress. Additive; safe to re-run.

### 1d. Delta copy — ONLY assets uploaded after 7 Oct — admin button
**[ADMIN] Admin → Storage → "Delta copy (Cloudinary→R2)"** (⚠️ TO BE BUILT):
- Runs the resumable copy for assets created **after the 7-Oct bulk copy**
  (filter by Cloudinary `created_at > 2026-10-07`), skipping anything already
  `status:'done'`. Dry-run first (counts only), then live with progress.
- Downloads ORIGINAL bytes (no Cloudinary transform credits), verifies each object
  with a SHA-256 re-read, never edits app records beyond `r2_migration`.
- (The underlying logic is `scripts/migrate_cloudinary_to_r2.mjs`, exposed as a job.)

### 1e. Coverage report BEFORE GO — admin button (read-only)
**[ADMIN] Admin → Storage → "R2 coverage report"** (⚠️ TO BE BUILT, wraps
`scripts/r2-coverage.mjs`):
- Shows, read-only, **how many LIVE Cloudinary references will resolve to R2**
  after import (coverage %), broken down by folder/type (official papers,
  academic resources, answer keys, store files/covers, payment proofs).
- **GO only when coverage ≈ 100%** for the folders you care about. Spot-check with
  the papers check embedded in the same report.

---

## 2. OG 1200×630 JPG backfill (PUBLIC R2) — fixes WhatsApp/Facebook previews
New/regenerated covers already emit a JPG OG. To backfill the existing catalogue,
call the admin endpoint (runs as a background job, re-runnable):

**[ADMIN] Admin → Store → "OG JPG backfill"** (background job, re-runnable), or **[CLI]** via API:
```
POST /api/admin/store/og-backfill        # body: {} or {"scope":"missing"}
     → { ok:true, jobId, total }         # 'missing' = products not yet on JPG
POST /api/admin/store/og-backfill        # body: {"force":true,"scope":"all"}  (full re-run)
GET  /api/admin/store/covers/jobs/<jobId>  # poll: status, done, made, failures
```
Verify a few products: `GET /api/store/product/<slug>` → `coverOgUrl` ends in
`.jpg`, is a public R2 URL (no `res.cloudinary.com`), and fetches as
`image/jpeg` 1200×630. The share page (`/store/p/<slug>`) `og:image` already
prefers `coverOgUrl`.
> ~3,121 products: run **at night with concurrency 1** (one OG render at a time via
> Chromium) to protect the pod. Safe to stop/re-run — `scope:'missing'` continues
> where it left off.

---

## 3. GO — flip the flags on LIVE (ONLY after §0.5 backup + §1–§2 verified)
Prerequisites: LIVE backup taken (§0.5); manifest imported + r2_assets backfilled +
delta copy done + coverage ≈100% (§1); OG backfill done (§2); the §1 admin jobs built.
Flip in THIS order so reads never point at an empty bucket. **[ADMIN]** sets
these in the LIVE environment Secrets (NOT in code), then redeploy/restart:

1. `STORAGE_WRITE=r2`   → NEW uploads now write to R2 (Cloudinary copy kept by dual-write).
2. **Verify** a fresh upload (store a test product file / academic PDF) streams back OK.
3. `R2_READ_FLIP=1`     → private reads now prefer R2 (Cloudinary still falls back).
4. `ASSESS_VIEW_R2=1`   → assess viewer serves from R2.

After each flip, run the smoke tests in §4. If anything fails, go to §5 rollback.

---

## 4. Smoke tests after GO (read-only)
Private (server-proxy; NO Cloudinary/R2 URL in the browser):
- Official Paper: open in the secure viewer + Download → renders `%PDF`.
- Academic Resource: open + Download (if allowed) → `%PDF`.
- Answer key: open for an entitled user → OK; **answer-key BLUR preview** renders.
- Payment-proof **admin view**: open 2–3 proofs in admin → images load.

Public (served from `static.lessonguruodisha.in` / public R2):
- **Store covers**: product cards show covers from `static.lessonguruodisha.in`.
- **WhatsApp share preview**: share a `/store/p/<slug>` link → preview shows the
  **1200×630 JPG** (not webp, not broken).
- **TOB / ABP HTML pages** render with their images.
- **LO code books** open and render.

Health:
- `r2_fallback_stats`: `priv_read_r2` climbing, `priv_read_cloudinary` flat/low.
- **Cloudflare Worker requests/day** well **< 100,000** (free tier). Check the
  Worker analytics the morning after GO; if trending high, investigate hot paths.
- OTP / login still work (unaffected by R2).

---

## 5. Rollback (instant, no data loss)
Because Cloudinary is kept as a counted fallback, you can revert reads instantly:
1. Set `R2_READ_FLIP` (and `ASSESS_VIEW_R2`) back to off → reads use Cloudinary again.
2. Optionally set `STORAGE_WRITE` back to off → new uploads go to Cloudinary again.
3. Redeploy/restart. No data migration is undone; R2 objects simply stop being read.
- To revert OG images to the previous Cloudinary webp, re-point is automatic:
  `generateProductCover` falls back to Cloudinary if the R2 write fails; to force,
  clear `cover.ogFormat` and re-run the cover job. (`scripts/r2-backfill-revert.mjs`
  exists for public-image URL reverts if needed.)

---

## 6. Stop paying Cloudinary BEFORE 7 Nov (downgrade, do NOT delete)
Target: off the paid plan before the 7-Nov billing date, with zero data loss.
1. After **7 consecutive good days** on R2 (coverage ~100%, `priv_read_cloudinary`
   near 0, Worker requests < 100k/day, no user reports):
2. **Switch new uploads to R2-only** — remove the Cloudinary dual-write (or set the
   dual-write off) so nothing new lands on Cloudinary.
3. **Downgrade Cloudinary to the FREE plan** — keep ALL originals as a cold backup;
   **do NOT delete anything**.
4. **Confirm Free-plan limits are enough once reads come from R2:** since R2 serves
   both private (server-proxy) and public (static domain) assets, Cloudinary should
   see ~0 delivery/transformation traffic. Verify Cloudinary's Free quotas
   (storage GB + a small monthly "credits" allowance for storage/last-mile) comfortably
   cover the residual (ideally near-zero) usage BEFORE downgrading. If storage alone
   exceeds Free, plan a later cold-archive/delete **only after** R2 is proven 100%
   and an external backup exists.
5. Keep Cloudinary **read-only as fallback** through at least one billing cycle after
   downgrade before considering any deletion.

---

## 7. Follow-up pending YOUR OK (after the switch)
- **148 old payment proofs flip to AUTHENTICATED (private).** This changes those
  assets from public to token-gated. **Do NOT execute until you explicitly approve**
  — it's a separate, reversible admin action to run after the R2 switch is stable.
