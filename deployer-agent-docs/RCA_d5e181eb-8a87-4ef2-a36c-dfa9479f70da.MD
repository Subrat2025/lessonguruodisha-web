# READ-ONLY Production DB Diagnosis — Lesson Guru Odisha (odisha-learning-pro)

**Scope:** strictly read-only. No writes, toggles, cancels, or reschedules were performed.
**DB read (resolved server-side):** `odisha-learning-pro-edumaster_odisha`
**Run:** d5e181eb-8a87-4ef2-a36c-dfa9479f70da (active, nextjs_mongo_shadcn, tier_1)
**Reference "now":** latest DB write observed was the RENEWAL campaign createdAt **2026-10-09T19:18:48Z**, so current time ≥ ~19:18 UTC (≈ 00:48 IST, 10 Oct). IST = UTC+5:30.

---

## ⚠️ HEADLINE FINDINGS (read these first)
1. **The drip switch-OFF did NOT take effect.** `settings.whatsapp_drip_config.value.enabled = **true**` (you expected `false`). `updatedAt` on the doc is 2026-10-09T19:16:16.994Z, `lastRunAt` 2026-10-09T17:31:24.275Z. Drip is still ENABLED.
2. **The RENEWAL campaign WILL auto-fire before 9am IST.** `wa_campaigns` RENEWAL is `status:scheduled`, `scheduledFor = 2026-10-10T01:00:00Z = 06:30 IST (10 Oct)`. That is within now+12h and before 09:00 IST.
3. **No creator is recorded on the RENEWAL campaign** — no `createdBy` / `creator` / `adminId` field exists on the document (full key list below).
4. **`user_registration_2` (the welcome template) began FAILING at ~16:36Z** with `reason:"legacy_template_removed", skipped:true` — 4 failures in the window; earlier sends succeeded.

---

## 1) settings → whatsapp_drip_config (full `value`, verbatim)
- `_id`: 6a784e8db22993754c26dc0d
- `updatedAt`: 2026-10-09T19:16:16.994Z
- `value`:
  - **enabled: true**  ← expected false; switch-OFF NOT reflected
  - **enabledAt: null**
  - **welcomeTemplate: "user_registration_2"**
  - **nudgeTemplate: "lesson_guru_activate_01"**
  - **delayHours: 72**
  - **batchSize: 200**
  - **lastRunAt: "2026-10-09T17:31:24.275Z"**
  - language: "en_US"
  - lastRunError: null
  - lastRunSent: 0
  - planUrl: "LessonGuruOdisha.in/plans"
  - **sequence** (3 steps):
    1. { template: "lesson_guru_activate_01", delayHours: 72,  label: "Day 3 · Activate",         vars: ["name","planUrl"] }
    2. { template: "premium_offer1",          delayHours: 168, label: "Day 7 · Premium Offer",     vars: ["name"] }
    3. { template: "panchapdi_photo",         delayHours: 336, label: "Day 14 · Panchapadi Photo", vars: [] }

## 2) wa_campaigns with status scheduled OR running
Exactly **ONE** document matched (no `running` campaigns at all):

**RENEWAL** (verbatim):
- _id: 6ac93e189a8ca2447713f1a1
- id: 59bca1d4-5d65-4d9c-8795-391d1fff6615
- name: "RENEWAL"
- templateId: "expired_premium_renewal"  /  templateName: "expired_premium_renewal"
- filter.audience: "expired"
- scheduledFor: **2026-10-10T01:00:00Z** (= **06:30 IST, 10 Oct**)
- status: "scheduled"
- createdAt: 2026-10-09T19:18:48.916Z
- updatedAt: 2026-10-09T19:18:48.916Z
- counts: { total:0, sent:0, delivered:0, failed:0, pending:0 }
- ctaLink: "https://lessonguruodisha.in/plans", language: "en_US", message: "", imageUrl: "", documentUrl: "", buttons: [], variables: {}

**Full raw key list of the RENEWAL doc:** `_id, buttons, counts, createdAt, ctaLink, documentUrl, filter, id, imageUrl, language, message, name, scheduledFor, status, templateId, templateName, updatedAt, variables`
→ **No creator/createdBy/adminId/ownerId field is present.** The schema does not record who created it.

## 3) scheduled campaigns with scheduledFor <= now+12h (will anything auto-fire before 9am IST?)
**YES.** The RENEWAL campaign above is the only scheduled campaign and it fires at **2026-10-10T01:00:00Z = 06:30 IST**, which is before 09:00 IST. Nothing else is scheduled/running.

## 4) whatsapp_send_log — breakdown by (template, status), last ~6 hours
Note: `sentAt` is stored as a BSON **Date**; the tool's filter couldn't push a date-range server-side, so this was tallied client-side from newest-first results. Window = sentAt ≥ ~2026-10-09T13:18Z (last 6h vs now ~19:18Z). The next-oldest batch (13:14:19Z) is ~4 min outside the window and excluded.

| template | status | count |
|---|---|---|
| user_registration_2 | **failed** | **4** |
| user_registration_2 | sent | 2 |
| lesson_guru_activate_01 | sent | 2 |
| premium_offer1 | sent | 2 |
| panchapdi_photo | sent | 2 |

- **user_registration_2:** 2 sent, 4 failed (6 total). The 4 failures are the most recent (16:36:35, 17:49:58, 18:24:50, 18:27:09Z); every one has `apiResponse = {reason:"legacy_template_removed", skipped:true, template_id:"user_registration_2"}`, `httpStatus:0`. Earlier same-template sends (15:45Z and before) succeeded — so the welcome template started being rejected as a removed/legacy template around 16:36Z.
- **lesson_guru_activate_01:** 2 sent, 0 failed in the window.
- No `failed` rows for lesson_guru_activate_01 / premium_offer1 / panchapdi_photo in the window.

## 5) Is the WhatsApp campaign scheduler active in live pods? (and send-time-window risk)
- **Scheduler/drip machinery IS active in the live pods — confirmed by runtime evidence**, not by source read: the live run emits recurring `[whatsapp-drip] conversion agg degraded for <template> ...` lines (repeating over the last 6h across all four templates), and `whatsapp_send_log` shows fresh sends throughout the day. Drip config `enabled:true` + `lastRunAt 17:31Z` corroborate an active runner.
- **No send-time window is being enforced — supported by DATA, not source:** `whatsapp_send_log` contains sends at all hours including deep night/early-morning UTC/IST (e.g. 00:58Z, 02:12Z, 02:53Z, 03:25Z = 06:28–08:55 IST, and many pre-dawn IST entries on prior days). This is consistent with a runner that fires whenever `scheduledFor <= now` with no quiet-hours guard.
- **CAVEAT — source NOT inspected:** I attempted to spawn an eph sandbox to read the scheduler source (confirm it is a module-level `setInterval` claiming `status:'scheduled'` wa_campaigns with no send-window check), but the sandbox failed to come up three times (`eph_source_check_failed` / "container not found" — platform infra error). So the specific *code structure* claim could not be independently verified from source; the behavioral conclusions above are inferred from runtime logs + send-log data. Note also the drip-sequence runner and the wa_campaigns scheduled-campaign runner may be distinct mechanisms; no wa_campaigns scheduled-campaign has run yet (RENEWAL counts are all 0), so its runner was observed only via the pending schedule, not an execution.

## 6) Recent pod errors/restarts related to whatsapp-drip / campaign runners (last few hours)
- **No crashes or restarts.** Both replicas Running, `ready:true`, `restart_count:0` (started 2026-10-09T19:12:28Z after the 19:06 redeploy).
- One transient **Readiness probe** timeout at 19:14:27Z on pod ...-sslhb during startup (single occurrence, pod recovered) — not a crash, not drip-related.
- Only recurring app-level errors in the window are `[whatsapp-drip] conversion agg degraded for {panchapdi_photo|premium_offer1|lesson_guru_activate_01|user_registration_2} - PlanExecutor error during aggregation :: operation exceeded time limit`. This is an **analytics/conversion aggregation query timing out** (degraded gracefully) — it is NOT a send failure and does NOT stop the drip/campaign runner.
- No errors referencing `/api/admin/whatsapp-drip` specifically were present in the retrieved logs.

---
### Verification status
- Items 1–4, 6: read directly from production DB / live pod events/logs — **verified**.
- Item 5 behavior: **inferred** from runtime logs + send-log timestamps; source code **not** inspected (sandbox infra failure).
