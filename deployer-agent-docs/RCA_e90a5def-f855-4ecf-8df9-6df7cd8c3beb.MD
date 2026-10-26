# RCA — Lesson Guru Odisha (odisha-learning-pro) — production visibility symptoms

**Scope:** DIAGNOSE ONLY. No production data was modified. All reads against the live prod DB `odisha-learning-pro-edumaster_odisha` (Emergent-managed Atlas) and the live URL `https://odisha-learning-pro.emergent.host`.

**Deployed build:** active run `e90a5def-f855-4ecf-8df9-6df7cd8c3beb`, image tag `…:e90a5def…`, type=redeploy, deployed **2026-09-24T12:07:58Z**. This IS the newest run in history; prod is on the latest build. Because Next.js serves the frontend and the API from the SAME image, and the API routes respond correctly (below), the deployed client bundle is the latest build too — a "stale bundle inside the image" is not possible.

---

## Point 4 (asked first because it frames everything): Is prod a different DB than preview?
YES — prod uses a separate managed Atlas DB (`odisha-learning-pro-edumaster_odisha`); preview uses a local mongo with a different db name. **However, the owner's hypothesis that preview data did not propagate to prod is DISPROVEN:** both the ad ON-state and all the Jigyasa papers are physically present in the prod DB, with real production telemetry (user impressions, downloads) around them. The admin's edits/uploads landed in prod correctly. There is no missing-data / non-propagation problem.

---

## SYMPTOM 1 — PM POSHAN ad "only Admin sees it"  → NOT reproduced; ad IS serving to normal users
**Prod `ads` collection (1 doc):**
- id `9692336a-2a53-490e-9eed-dff042ef956d`, name "PM POSHAN MDM Calculator"
- **status: "on"**
- **placements: ["home","dashboard","lessons","assessment"]** (includes "home")
- schedule: startDate 2026-09-23, endDate 2026-10-30, **dailyStart 16:26, dailyEnd 23:59, timezone Asia/Kolkata**
- frequencyPerDay: 1, showOncePerSession: true
- content.destinationUrl: https://pmposhancalculator.com/

**Live API:** `GET /api/ads/active?placement=home` → 200, returns the full ad object (`{"ad":{...}}`) to an UNAUTHENTICATED caller. So the endpoint exists in the deployed build and there is **no server-side admin/subscription gate** — anonymous gets the ad.

**Prod telemetry (`ad_events`, 782 docs):** home-placement `impression` events come from BOTH anonymous (`userId:null`) AND many non-admin logged-in users (e.g. `66a4a885…`, `6016fc20…`, `c14aa773…`, `7abfd42c…`, `20dd547f…`, `1a7c3fb1…`). Impressions continue **after** the 12:07 deploy: 12:10, 12:13, 12:14, 12:21, 12:25, 12:26, 12:27, 12:28 on 09-24.

**Root cause:** The ad is correctly configured, un-gated, and actively rendering to normal subscribed users on prod. The "only admin sees it" perception is a **client-side frequency/schedule effect**, not a gate:
- `dailyStart 16:26` IST → the ad only serves in the evening window each day; a normal user checking before ~16:26 IST gets `{ad:null}`.
- `showOncePerSession:true` + `frequencyPerDay:1` → a user sees it once per session/day, then not again.
- The admin ads config/preview panel renders the creative regardless of schedule/cap, so admin always sees it.
**Action for owner:** if the ad should be visible all day, widen the schedule window (e.g. dailyStart 00:00) via the admin Ads editor (`PUT /api/admin/ads/:id`). No data fix needed.

---

## SYMPTOM 2 — Class 8 → Science → Jigyasa SA1 papers not visible  → NOT a data problem; papers exist & are served
**Class / book identity in prod:**
- `classes`: "Class 8" → id `7349163f-d5d6-486f-a87b-db85453eb265`.
- `books`: the book is named **"ଜିଜ୍ଞାସା (ବିଜ୍ଞାନ)"** (NOTE the `(ବିଜ୍ଞାନ)` = Science suffix), id `eb871cf7-1c56-4ad0-8d5b-5c5dc35797c9`, classId = Class 8. An exact-name search for plain "ଜିଜ୍ଞାସା" returns 0 — the stored name is NOT plain "Jigyasa".
- `subjects` collection has **0 docs for Class 8** (and books carry NO subjectId field). So "Class 8 → Science" grouping is not backed by a subjects table — it must be derived client-side (likely by parsing the book-name suffix).

**Papers in prod (`official_papers`, 530 total):**
- Class 8 + examType sa1 = 50 docs. Jigyasa (bookId `eb871cf7…`) SA1 = **10 sets** present: A–E (created 2026-09-23T01:44) and F–J (created 2026-09-24T10:57).
- Every Jigyasa SA1 doc: `hiddenByAdmin:false`, valid Cloudinary `pdfUrl`, correct `classId` (Class 8), correct `bookId`, `className:"Class 8"`, `bookName:"ଜିଜ୍ଞାସା (ବିଜ୍ଞାନ)"`, examType `sa1`.
- `official_papers` with `hiddenByAdmin:true` = **0**. Nothing is hidden.

**Live API:** `GET /api/official-papers` → 200, returns `{items:[…]}`. It returns every doc where `hiddenByAdmin != true`; since 0 are hidden, all 10 Jigyasa Class 8 SA1 sets ARE in the payload.

**Root cause:** Backend, DB, and API are all correct on prod — the papers exist and are served. Non-visibility is therefore **client-side**. Strongest DB-grounded lead: the prod book name carries the **"(ବିଜ୍ଞାନ)" suffix** and there is **no subjects linkage**, so if the user-facing "Instant Assessment Papers" UI filters/groups by book name or a derived "Science" subject, prod's naming/derivation won't match what the preview UI expected. Because the deployed client == latest build (API confirms), the likely preview-vs-prod difference is a **DATA-SHAPE mismatch**: verify whether the preview DB's book is named plain "ଜିଜ୍ଞାସା" while prod's is "ଜିଜ୍ଞାସା (ବିଜ୍ଞାନ)", and/or whether preview has a `subjects`/subjectId linkage that prod lacks. Secondary: browser/CDN cache serving old client JS to the tester's device.

**Action for owner/E1:** inspect the client-side filter/grouping in the "Instant Assessment Papers" section for how it maps Class 8 → Science → book; confirm it matches on `bookId` (robust) rather than exact book name (fragile, breaks on the "(ବିଜ୍ଞାନ)" suffix). Compare the preview vs prod `books`/`subjects` docs for the same book to find the shape difference. No prod paper data needs re-adding — it is all present.

---

## Summary
- Point 1 (build currency): prod is on the latest build `e90a5def` (2026-09-24T12:07:58Z); `/api/ads/active` and `/api/official-papers` both exist and respond on prod → deployed code is current.
- Point 2 (ad): status on, placements include home, schedule live, API serves it to anonymous, 782 ad_events incl. post-deploy impressions from non-admin users → not admin-gated; visibility limited by daily 16:26–23:59 IST window + once-per-session/day cap.
- Point 3 (papers): 10 Jigyasa Class 8 SA1 sets present, hiddenByAdmin:false, valid pdfUrls, correct classId/bookId; 0 hidden; API returns them → data correct, issue is client-side (book-name "(ବିଜ୍ଞାନ)" suffix / missing subjects linkage, or client cache).
- Point 4: prod DB is separate from preview, but the data IS in prod — no propagation failure.
