# Lesson Guru Odisha — Android app

Native Android app (`com.lessonguruodisha.app`) for https://lessonguruodisha.in.

## What it is

- **Native shell** (Java, Android framework only — no AndroidX, no third-party SDKs) in `src/main/java`.
  It hosts the live platform in a hardened WebView with a native gradient header, a loading bar,
  edge-to-edge layout and the native integrations below.
- **Bundled hub** (`src/main/assets/app`): splash, onboarding, Home, Explore, Cloud Library,
  My Plan, Profile and an Offline screen. These pages ship inside the APK, so they open instantly and work offline.
  The shell serves them at `https://lessonguruodisha.in/__app/…`, which puts them on the same
  origin as the website: they read the existing login (`em_token`), call `/api/auth/me`, and every link opens the matching page of the live platform.

### Native integrations

| Web behaviour | In the app |
|---|---|
| `blob:` / `data:` downloads (html2pdf, jsPDF, `a[download]`) | Saved to **Downloads/LessonGuru** *and* backed up to the teacher's Cloud Library |
| Normal file downloads from lessonguruodisha.in, `.pdf` links | Fetched with the teacher's session, then saved and backed up the same way; falls back to Android DownloadManager |
| `window.print()` | Android print dialog (Save as PDF / printers) |
| `<input type=file>` | System file picker (multi-select supported) |
| Buying (plans, store, credits) | Not offered: the app is consumption-only (Google Play Payments policy). `/plans`, `/store` (except My Library and orders), `/assessment` and `/my-qr-payments` are refused with a notice; Razorpay checkout can't open; the website hides purchase UI when it sees the `LessonGuruApp/` user agent |
| `window.open` (card / net-banking verification) | Shown in a secure in-app window with a close bar |
| `upi:`, `intent:`, `tel:`, `mailto:`, WhatsApp links | Opened in the matching app |
| External websites | Opened in the browser; lessonguruodisha.in and iframes stay in-app |
| No connection | Branded offline screen with retry |
| Deep links `https://lessonguruodisha.in/...` | Open in the app (`autoVerify`; see *App Links*) |
| PWA "Install app" banner | Hidden inside the app |

### Cloud Library

The **Cloud** tab lists the teacher's files with storage usage, search, filters
(PDFs, starred, docs, images), upload from the phone with progress, and per-file actions:
open, share a 3-day link, save a copy, rename, star, stop old share links, delete. The
*Auto-backup* switch (on by default) controls whether downloads are uploaded. Backend:
`docs/CLOUD_LIBRARY.md` in the website repo.

The user agent ends with `LessonGuruApp/<version> (Android)` so the website can detect the app.

## Two versions

| | Play Store version | Direct version |
|---|---|---|
| App ID | `com.lessonguruodisha.app` | `com.lessonguruodisha.app.direct` |
| Build | `python3 build-tools/build.py --tools … --flavor play` | `… --flavor direct` |
| Buying | Not offered (Google Play Payments policy) | Website checkout (Razorpay, UPI apps listed) |
| User agent | `LessonGuruApp/<ver> (Android)` | `LessonGuruApp/<ver> (Android; direct)` |
| Share it | Upload the `.aab` to Play Console | Share the `-Direct-` `.apk` from the website / WhatsApp |

Both versions use the same accounts and data, and both can be installed on one phone.
The website (`lib/in-app.js`) hides purchase UI only for the Play version.

## PDFs

Lesson-plan PDFs (single lesson, whole chapter, daily / instant / multigrade diary, Panchapadi) are
rendered on the server and shrunk to fit exactly one A4 page per lesson (`lib/pdf-fit.js`), with
the teacher's signature on the left and the headmaster's on the right. In-app "Print / Save PDF" of a
lesson plan does the same on the phone (`LG.printNow(title, { lesson: true })`).

## Outputs

`dist/LessonGuruOdisha-v1.3.0.apk` — signed (v2 + v3) APK to install directly.
`dist/LessonGuruOdisha-v1.3.0.aab` — signed App Bundle to upload to Google Play.
`dist/screenshots/` — every screen. `dist/store/play-store-icon-512.png` — Play listing icon.

minSdk 24 (Android 7.0) · targetSdk 36 (Android 16) · portrait.

## Signing key — back it up

`keystore/lessonguru-upload.p12` and `keystore/keystore.properties` (passwords) were generated
by the build. Use them as the **upload key** with Play App Signing. Keep both files private and
backed up: you need the same key for every future update. Do not commit them to a public repo.

## Building

The build doesn't use Gradle or the SDK manager (the build sandbox couldn't reach Google's SDK
download host). It needs JDK 17+, Python 3 with Pillow, and two files in a tools folder:

- `android-35.jar` — API 35 compile classpath
- `bundletool.jar` — Google's bundletool 1.17.2 (it also provides D8 and apksig)

```
python3 build-tools/make_icons.py .     # only when the icon design changes
python3 build-tools/build.py --tools /path/to/tools
```

`res_build.py` writes the binary manifest and resource table for the APK, and `ProtoGen.java`
writes the protobuf versions for the AAB. To change the version, edit `VERSION_CODE` /
`VERSION_NAME` in `build-tools/build.py`. Screenshots: `node build-tools/screenshots.js .`
(needs Playwright).

## Launch test

`launch-test/` starts the real `MainActivity` on real Android framework code (Robolectric) for
Android 7, 8, 9, 10, 11, 12, 13, 14, 15 and 16, using the built classes and resource table. Run it
before every release. v1.0.0 and v1.1.0 crashed at startup on Android 11+ (the system-bar
styling ran before the window's view existed); this test reproduces that crash. If the app ever
crashes on a phone, the next launch offers to send the error report to support on WhatsApp.

## App Links

To have `https://lessonguruodisha.in/...` links open the app without a chooser, publish
`https://lessonguruodisha.in/.well-known/assetlinks.json` with the app's SHA-256 signing
certificate fingerprint. `public/.well-known/assetlinks.json` in the website already lists the
upload key (`F7:33:01:62:…:7D:5D`), which covers the APK in `dist/`. Once Play App Signing is on,
add the Play signing key's SHA-256 (Play Console › App integrity) to the same list and redeploy.
