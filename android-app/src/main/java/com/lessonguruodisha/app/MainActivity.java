package com.lessonguruodisha.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Single-activity shell. The bundled hub (assets/app) is served from
 * https://lessonguruodisha.in/__app/ so it shares origin, cookies and
 * localStorage with the live platform it wraps.
 */
public class MainActivity extends Activity {

    static final String HOST = "lessonguruodisha.in";
    static final String BASE = "https://" + HOST;
    static final String APP_PREFIX = BASE + "/__app/";
    static final String HUB_URL = APP_PREFIX + "index.html";

    private static final int REQ_FILE = 41;
    private static final int REQ_STORAGE = 42;

    private static final int C_VIOLET = 0xFF6D28D9;
    private static final int C_PINK = 0xFFFF2D78;
    private static final int C_DEEP = 0xFF4C1D95;

    WebView web;
    private LinearLayout column;
    private LinearLayout header;
    private TextView titleView;
    TopProgressView progress;
    private FrameLayout snackHost;

    ValueCallback<Uri[]> fileCallback;
    private Runnable pendingStorageAction;
    private long lastBackAt;
    private boolean onHub = true;
    volatile String currentUrl = HUB_URL;

    private int insetTop, insetBottom, insetIme;
    final Handler ui = new Handler(Looper.getMainLooper());
    private FileSaver saver;

    // ------------------------------------------------------------------ lifecycle

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        CrashLog.install(this);
        saver = new FileSaver(this);
        setupWindow();
        buildUi();
        setupWebView();

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        }
        if (savedInstanceState == null || web.getUrl() == null) {
            String deep = deepLink(getIntent());
            web.loadUrl(deep != null ? deep : HUB_URL);
        }
        offerCrashReport();
        if (Build.VERSION.SDK_INT >= 33) BackCompat.register(this, this::handleBack);
    }

    static final String SUPPORT_WHATSAPP = "918093414633";
    /** Ratings always go to the Play Store listing, also from the direct version. */
    static final String PLAY_APP_ID = "com.lessonguruodisha.app";

    /** If the app crashed last time, offer to send the details to support on WhatsApp. */
    private void offerCrashReport() {
        String report = CrashLog.take(this);
        if (report == null) return;
        String text = "Hello Lesson Guru team, the app closed unexpectedly. Error report:\n\n"
                + (report.length() > 1800 ? report.substring(0, 1800) + "…" : report);
        new android.app.AlertDialog.Builder(this)
                .setTitle("Sorry, the app closed unexpectedly")
                .setMessage("Please send the error report to our support team on WhatsApp so we can fix it quickly.")
                .setPositiveButton("Send report", (d, w) ->
                        openExternal(Uri.parse("https://wa.me/" + SUPPORT_WHATSAPP + "?text=" + Uri.encode(text))))
                .setNegativeButton("Not now", null)
                .show();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String deep = deepLink(intent);
        if (deep != null) web.loadUrl(deep);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.resumeTimers();
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.stopLoading();
            web.setWebChromeClient(null);
            web.destroy();
        }
        super.onDestroy();
    }

    private String deepLink(Intent intent) {
        if (intent == null || intent.getData() == null) return null;
        Uri u = intent.getData();
        if (!"https".equals(u.getScheme()) || u.getHost() == null) return null;
        if (!u.getHost().endsWith(HOST)) return null;
        return u.toString();
    }

    // ------------------------------------------------------------------ window & layout

    @SuppressWarnings("deprecation")
    private void setupWindow() {
        Window w = getWindow();
        // Create the decor view first: on API 30+ PhoneWindow.getInsetsController() dereferences it
        // without a null check, so touching the insets controller earlier crashes the app.
        w.getDecorView();
        w.setStatusBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            w.setNavigationBarColor(Color.TRANSPARENT);
            if (Build.VERSION.SDK_INT >= 29) w.setNavigationBarContrastEnforced(false);
        } else {
            int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN;
            if (Build.VERSION.SDK_INT >= 26) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                w.setNavigationBarColor(Color.WHITE);
            } else {
                w.setNavigationBarColor(C_DEEP);
            }
            w.getDecorView().setSystemUiVisibility(flags);
        }
        if (Build.VERSION.SDK_INT >= 28) {
            w.getAttributes().layoutInDisplayCutoutMode =
                    android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        applyBarAppearance();
    }

    private boolean darkStatusIcons;

    /** White status icons over our gradients by default; dark icons when a page has a light top. */
    void setDarkStatusIcons(boolean dark) {
        darkStatusIcons = dark;
        applyBarAppearance();
    }

    @SuppressWarnings("deprecation")
    private void applyBarAppearance() {
        try {
            View d = getWindow().getDecorView();
            if (Build.VERSION.SDK_INT >= 30) {
                WindowInsetsController c = d.getWindowInsetsController();
                if (c != null) {
                    int want = WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                            | (darkStatusIcons ? WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS : 0);
                    c.setSystemBarsAppearance(want, WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                            | WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS);
                }
            } else {
                int f = d.getSystemUiVisibility();
                f = darkStatusIcons ? (f | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) : (f & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
                d.setSystemUiVisibility(f);
            }
        } catch (RuntimeException e) {
            // purely cosmetic — never let system-bar styling take the app down
            android.util.Log.w("LessonGuru", "system bar styling failed", e);
        }
    }

    int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);

        column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        root.addView(column, new FrameLayout.LayoutParams(-1, -1));

        // gradient header (only visible on live-site pages)
        header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{C_DEEP, C_VIOLET, C_PINK});
        header.setBackground(g);
        header.setElevation(dp(4));
        header.setPadding(dp(4), 0, dp(4), 0);

        header.addView(iconButton(IconView.BACK, v -> onBackPressed()));
        titleView = new TextView(this);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        titleView.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        titleView.setSingleLine(true);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        titleView.setPadding(dp(6), 0, dp(6), 0);
        header.addView(titleView, new LinearLayout.LayoutParams(0, -2, 1f));
        header.addView(iconButton(IconView.REFRESH, v -> web.reload()));
        header.addView(iconButton(IconView.SHARE, v -> shareCurrent()));
        header.addView(iconButton(IconView.HOME, v -> goHub("home")));
        header.setVisibility(View.GONE);
        column.addView(header, new LinearLayout.LayoutParams(-1, -2));

        FrameLayout content = new FrameLayout(this);
        column.addView(content, new LinearLayout.LayoutParams(-1, 0, 1f));

        web = new WebView(this);
        web.setBackgroundColor(0xFFF6F3FF);
        content.addView(web, new FrameLayout.LayoutParams(-1, -1));

        progress = new TopProgressView(this);
        content.addView(progress, new FrameLayout.LayoutParams(-1, dp(3), Gravity.TOP));

        snackHost = new FrameLayout(this);
        root.addView(snackHost, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));

        root.setOnApplyWindowInsetsListener((v, insets) -> {
            readInsets(insets);
            applyInsets();
            return insets;
        });
        setContentView(root);
    }

    @SuppressWarnings("deprecation")
    private void readInsets(WindowInsets insets) {
        if (Build.VERSION.SDK_INT >= 30) {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
            insetTop = bars.top;
            insetBottom = bars.bottom;
            insetIme = ime.bottom;
        } else {
            insetTop = insets.getSystemWindowInsetTop();
            // pre-30 we don't draw under the nav bar; whatever exceeds the stable inset is the keyboard
            insetBottom = 0;
            insetIme = Math.max(0, insets.getSystemWindowInsetBottom() - insets.getStableInsetBottom());
        }
    }

    private void applyInsets() {
        header.setPadding(dp(4), insetTop, dp(4), 0);
        header.getLayoutParams().height = insetTop + dp(56);
        header.requestLayout();
        int bottom = onHub ? insetIme : Math.max(insetBottom, insetIme);
        column.setPadding(0, 0, 0, bottom);
        snackHost.setPadding(dp(12), 0, dp(12), Math.max(insetBottom, insetIme) + dp(onHub ? 84 : 12));
        pushInsetsToPage();
    }

    void pushInsetsToPage() {
        if (web == null || !onHub) return;
        float d = getResources().getDisplayMetrics().density;
        String js = String.format(Locale.US,
                "document.documentElement.style.setProperty('--sat','%.1fpx');" +
                        "document.documentElement.style.setProperty('--sab','%.1fpx');",
                insetTop / d, (insetIme > 0 ? 0 : insetBottom) / d);
        web.evaluateJavascript(js, null);
    }

    private View iconButton(int icon, View.OnClickListener l) {
        IconView v = new IconView(this, icon);
        v.setOnClickListener(l);
        v.setPadding(dp(12), dp(12), dp(12), dp(12));
        v.setBackground(rippleCircle());
        v.setLayoutParams(new LinearLayout.LayoutParams(dp(46), dp(46)));
        return v;
    }

    private android.graphics.drawable.Drawable rippleCircle() {
        GradientDrawable mask = new GradientDrawable();
        mask.setShape(GradientDrawable.OVAL);
        mask.setColor(Color.WHITE);
        return new android.graphics.drawable.RippleDrawable(
                android.content.res.ColorStateList.valueOf(0x40FFFFFF), null, mask);
    }

    // ------------------------------------------------------------------ webview

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    private void setupWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(true); // Razorpay opens card / net-banking verification in a popup
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        int sysZoom = Math.round(getResources().getConfiguration().fontScale * 100);
        s.setTextZoom(Math.max(85, Math.min(sysZoom, 115))); // keep large-font users comfortable without breaking layouts
        // "direct" tells the website this copy may sell (it is not the Play Store version)
        s.setUserAgentString(s.getUserAgentString() + " LessonGuruApp/" + BuildInfo.VERSION_NAME
                + (BuildInfo.DIRECT ? " (Android; direct)" : " (Android)"));

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.addJavascriptInterface(new Bridge(this), "LGApp");
        web.setWebViewClient(new ShellClient(this));
        web.setWebChromeClient(new ShellChrome(this));
        web.setDownloadListener((url, ua, cd, mime, len) -> onDownload(url, cd, mime));

        try {
            // the live site registers a service worker; make sure its fetches for /__app/ still hit our assets
            ServiceWorkerController.getInstance().setServiceWorkerClient(new SwClient(getApplicationContext()));
        } catch (RuntimeException e) {
            // optional: the WebView provider may be missing or mid-update; the app works without it
            android.util.Log.w("LessonGuru", "service worker client unavailable", e);
        }
    }

    // Nested classes are static on purpose: JDK 21 javac emits MethodParameters for inner-class
    // constructors, which the D8 bundled with bundletool cannot read.
    private static final class SwClient extends ServiceWorkerClient {
        private final Context ctx;

        SwClient(Context ctx) {
            this.ctx = ctx;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
            return AssetServer.serve(ctx, request.getUrl());
        }
    }

    private static final class ShellClient extends WebViewClient {
        private final MainActivity a;

        ShellClient(MainActivity a) {
            this.a = a;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return AssetServer.serve(a, request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return a.route(request.getUrl(), request.isForMainFrame());
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            a.onUrlChanged(url);
            a.progress.setProgress(8);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            a.onUrlChanged(url);
            view.evaluateJavascript(Inject.script(a), null);
            a.pushInsetsToPage();
            CookieManager.getInstance().flush();
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            Uri u = Uri.parse(url == null ? "" : url);
            if (!BuildInfo.DIRECT && u.getHost() != null && u.getHost().endsWith(HOST) && isPurchasePath(u.getPath())) {
                // e.g. a Next.js <Link> into the store: step back out and explain
                if (view.canGoBack()) view.goBack();
                else a.goHub("home");
                a.showPurchaseNotice();
                return;
            }
            a.onUrlChanged(url); // SPA pushState navigations on the live site
            if (url != null && !url.startsWith(APP_PREFIX) && url.startsWith(BASE)) {
                view.evaluateJavascript(Inject.trackVisit(), null);
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            String failed = request.getUrl().toString();
            if (failed.startsWith(APP_PREFIX)) return;
            view.loadUrl(APP_PREFIX + "offline.html?from=" + Uri.encode(failed));
        }

        @Override
        public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
            a.recreate();
            return true;
        }
    }

    private static final class ShellChrome extends WebChromeClient {
        private final MainActivity a;

        ShellChrome(MainActivity a) {
            this.a = a;
        }

        @Override
        public void onProgressChanged(WebView view, int p) {
            a.progress.setProgress(p);
        }

        @Override
        public void onReceivedTitle(WebView view, String title) {
            a.updateTitle();
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
            WebView popup = a.openPopup();
            ((WebView.WebViewTransport) resultMsg.obj).setWebView(popup);
            resultMsg.sendToTarget();
            return true;
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (a.fileCallback != null) a.fileCallback.onReceiveValue(null);
            a.fileCallback = cb;
            Intent i = params.createIntent();
            i.addCategory(Intent.CATEGORY_OPENABLE);
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            try {
                a.startActivityForResult(Intent.createChooser(i, "Choose file"), REQ_FILE);
            } catch (ActivityNotFoundException e) {
                a.fileCallback = null;
                a.toast("No file picker found on this device");
                return false;
            }
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) {
                Uri[] result = null;
                if (resultCode == RESULT_OK && data != null) {
                    if (data.getClipData() != null) {
                        int n = data.getClipData().getItemCount();
                        result = new Uri[n];
                        for (int i = 0; i < n; i++) result[i] = data.getClipData().getItemAt(i).getUri();
                    } else if (data.getData() != null) {
                        result = new Uri[]{data.getData()};
                    }
                }
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /** @return true when the shell handled the URL (i.e. WebView must not load it). */
    boolean route(Uri uri, boolean mainFrame) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.US);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.US);

        if (scheme.equals("http") || scheme.equals("https")) {
            // iframes (Razorpay checkout, embedded videos…) must load wherever they need to
            if (!mainFrame) return false;
            // mid-payment: Razorpay may redirect to bank / 3-D Secure pages; keep them in the app
            if (isPaymentHost(Uri.parse(currentUrl == null ? "" : currentUrl).getHost())) return false;
            if (isInternalHost(host)) {
                String path = uri.getPath() == null ? "" : uri.getPath().toLowerCase(Locale.US);
                if (!BuildInfo.DIRECT && host.endsWith(HOST) && isPurchasePath(path)) {
                    showPurchaseNotice();
                    return true;
                }
                if (mainFrame && path.endsWith(".pdf")) {
                    onDownload(uri.toString(), null, "application/pdf");
                    return true;
                }
                return false;
            }
            openExternal(uri);
            return true;
        }
        if (scheme.equals("blob") || scheme.equals("data") || scheme.equals("about") || scheme.equals("javascript")) {
            return false;
        }
        if (scheme.equals("intent")) {
            try {
                Intent i = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
                try {
                    try {
                        startActivity(i);
                    } catch (ActivityNotFoundException first) {
                        // some UPI apps don't declare BROWSABLE on their upi:// handler
                        i.removeCategory(Intent.CATEGORY_BROWSABLE);
                        startActivity(i);
                    }
                } catch (ActivityNotFoundException e) {
                    String fallback = i.getStringExtra("browser_fallback_url");
                    if (fallback != null) openExternal(Uri.parse(fallback));
                    else if (i.getPackage() != null)
                        openExternal(Uri.parse("market://details?id=" + i.getPackage()));
                }
            } catch (Exception e) {
                toast("Can't open this link");
            }
            return true;
        }
        // upi:, tel:, mailto:, whatsapp:, sms:, market:, geo: ...
        openExternal(uri);
        return true;
    }

    /**
     * Pages that sell something. The app is consumption-only (Google Play Payments policy): teachers
     * buy on the website, and purchased content (My Library, orders, viewer) stays available here.
     */
    static boolean isPurchasePath(String path) {
        if (path == null) return false;
        String p = path.toLowerCase(Locale.US);
        if (p.length() > 1 && p.endsWith("/")) p = p.substring(0, p.length() - 1);
        if (p.startsWith("/store/library") || p.startsWith("/store/orders")) return false;
        return p.equals("/plans") || p.equals("/store") || p.startsWith("/store/")
                || p.equals("/assessment") || p.equals("/my-qr-payments");
    }

    private long lastPurchaseNoticeAt;

    void showPurchaseNotice() {
        long now = System.currentTimeMillis();
        if (now - lastPurchaseNoticeAt < 1500) return; // one notice per tap
        lastPurchaseNoticeAt = now;
        ui.post(() -> new android.app.AlertDialog.Builder(this)
                .setTitle("Not available in the app")
                .setMessage("Purchases are not available in the Lesson Guru app. Everything already on your account works here.")
                .setPositiveButton("OK", null)
                .show());
    }

    static boolean isPaymentHost(String host) {
        if (host == null) return false;
        host = host.toLowerCase(Locale.US);
        return host.equals("razorpay.com") || host.endsWith(".razorpay.com");
    }

    static boolean isInternalHost(String host) {
        return host.equals(HOST) || host.endsWith("." + HOST)
                || host.equals("razorpay.com") || host.endsWith(".razorpay.com");
    }

    void openExternal(Uri uri) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, uri);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            String s = uri.getScheme();
            if ("upi".equals(s)) toast("Please install a UPI app (PhonePe, GPay, Paytm…) to pay");
            else if ("whatsapp".equals(s)) toast("WhatsApp is not installed");
            else toast("No app found to open this link");
        }
    }

    // ------------------------------------------------------------------ popup windows (window.open)

    WebView popup;
    private LinearLayout popupHost;

    /** Hosts that should open in their own app even when a popup asks for them. */
    static boolean opensInOwnApp(String host) {
        if (host == null) return false;
        host = host.toLowerCase(Locale.US);
        return host.equals("wa.me") || host.endsWith("whatsapp.com") || host.equals("play.google.com")
                || host.endsWith("youtube.com") || host.equals("youtu.be") || host.equals("t.me")
                || host.endsWith("facebook.com") || host.endsWith("instagram.com");
    }

    @SuppressLint("SetJavaScriptEnabled")
    WebView openPopup() {
        closePopup();
        WebView w = new WebView(this);
        WebSettings ps = w.getSettings();
        ps.setJavaScriptEnabled(true);
        ps.setDomStorageEnabled(true);
        ps.setSupportMultipleWindows(false);
        ps.setJavaScriptCanOpenWindowsAutomatically(true);
        ps.setUserAgentString(web.getSettings().getUserAgentString());
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, true);
        w.setWebViewClient(new PopupClient(this));
        w.setWebChromeClient(new PopupChrome(this));
        w.setDownloadListener((url, ua, cd, mime, len) -> onDownload(url, cd, mime));

        LinearLayout host = new LinearLayout(this);
        host.setOrientation(LinearLayout.VERTICAL);
        host.setBackgroundColor(Color.WHITE);
        host.setClickable(true);
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(16), insetTop + dp(8), dp(6), dp(8));
        bar.setBackgroundColor(0xFFF5F3FF);
        TextView t = new TextView(this);
        t.setText("🔒 Secure page");
        t.setTextColor(C_DEEP);
        t.setTextSize(15);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        bar.addView(t, new LinearLayout.LayoutParams(0, -2, 1f));
        TextView x = new TextView(this);
        x.setText("✕");
        x.setTextSize(20);
        x.setTextColor(C_DEEP);
        x.setPadding(dp(14), dp(4), dp(14), dp(4));
        x.setContentDescription("Close");
        x.setOnClickListener(v -> closePopup());
        bar.addView(x);
        host.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        host.addView(w, new LinearLayout.LayoutParams(-1, 0, 1f));
        host.setPadding(0, 0, 0, Math.max(insetBottom, insetIme));
        ((FrameLayout) column.getParent()).addView(host, new FrameLayout.LayoutParams(-1, -1));
        popupHost = host;
        popup = w;
        return w;
    }

    void closePopup() {
        if (popupHost != null) {
            ((ViewGroup) popupHost.getParent()).removeView(popupHost);
            popupHost = null;
        }
        if (popup != null) {
            popup.stopLoading();
            popup.destroy();
            popup = null;
        }
    }

    private static final class PopupClient extends WebViewClient {
        private final MainActivity a;

        PopupClient(MainActivity a) {
            this.a = a;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.US);
            boolean web = scheme.equals("http") || scheme.equals("https");
            if (web && !opensInOwnApp(u.getHost())) return false; // bank / 3-D Secure pages load here
            if (scheme.equals("blob") || scheme.equals("data") || scheme.equals("about")) return false;
            if (web) a.openExternal(u);
            else a.route(u, true); // upi:, intent:, tel:, …
            // a popup that only existed to hand off to another app has nothing left to show
            String cur = view.getUrl();
            if (cur == null || cur.isEmpty() || "about:blank".equals(cur)) a.ui.post(a::closePopup);
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return AssetServer.serve(a, request.getUrl());
        }
    }

    private static final class PopupChrome extends WebChromeClient {
        private final MainActivity a;

        PopupChrome(MainActivity a) {
            this.a = a;
        }

        @Override
        public void onCloseWindow(WebView window) {
            a.ui.post(a::closePopup);
        }
    }

    // ------------------------------------------------------------------ navigation state

    void onUrlChanged(String url) {
        if (url == null) return;
        currentUrl = url;
        boolean hub = url.startsWith(APP_PREFIX);
        if (hub != onHub) {
            onHub = hub;
            header.setVisibility(hub ? View.GONE : View.VISIBLE);
            applyInsets();
        }
        if (!hub && darkStatusIcons) setDarkStatusIcons(false); // site pages sit under our gradient header
        updateTitle();
    }

    private static final Map<String, String> TITLES = new HashMap<>();

    static {
        TITLES.put("/", "Lesson Guru Odisha");
        TITLES.put("/dashboard", "My Dashboard");
        TITLES.put("/login", "Login");
        TITLES.put("/register", "Create Account");
        TITLES.put("/forgot-password", "Reset Password");
        TITLES.put("/account/change-password", "Change Password");
        TITLES.put("/plans", "My Plan");
        TITLES.put("/my-plan", "My Plan");
        TITLES.put("/lessons", "Lesson Plans");
        TITLES.put("/books", "Books");
        TITLES.put("/chapters", "Chapters");
        TITLES.put("/lesson-list", "Lessons");
        TITLES.put("/lesson", "Lesson Plan");
        TITLES.put("/daily-plan", "Daily Plan");
        TITLES.put("/instant-plan", "Instant Plan");
        TITLES.put("/instant-search", "Instant Search");
        TITLES.put("/ajira-pathya-jojana", "Ajira Pathya Jojana");
        TITLES.put("/multigrade", "Multigrade");
        TITLES.put("/search", "Search");
        TITLES.put("/learning-outcomes", "Learning Outcomes");
        TITLES.put("/qbank", "Question Bank");
        TITLES.put("/assessments", "Assessments");
        TITLES.put("/assessment", "Assessment Store");
        TITLES.put("/question-papers", "Question Papers");
        TITLES.put("/favorites", "Favourites");
        TITLES.put("/history", "History");
        TITLES.put("/ai-wallet", "AI Wallet");
        TITLES.put("/resources", "Resource Library");
        TITLES.put("/panchapadi", "Panchapadi");
        TITLES.put("/mcm-test", "MCM Test");
        TITLES.put("/verify-mcm", "Verify MCM");
        TITLES.put("/abp", "Annual Plan");
        TITLES.put("/store", "Store");
        TITLES.put("/tob", "Teacher Observation");
        TITLES.put("/teacher-observation", "Teacher Observation");
        TITLES.put("/about", "About Us");
        TITLES.put("/privacy", "Privacy Policy");
        TITLES.put("/terms", "Terms of Use");
        TITLES.put("/refund", "Refund Policy");
        TITLES.put("/delete-account", "Delete Account");
    }

    void updateTitle() {
        if (onHub) return;
        String t = null;
        try {
            Uri u = Uri.parse(currentUrl);
            String p = u.getPath() == null ? "/" : u.getPath();
            if (p.length() > 1 && p.endsWith("/")) p = p.substring(0, p.length() - 1);
            t = TITLES.get(p);
            if (t == null) {
                int i = p.indexOf('/', 1);
                if (i > 0) t = TITLES.get(p.substring(0, i));
            }
            if (t == null && !isInternalHost(u.getHost() == null ? "" : u.getHost())) t = u.getHost();
            if (t == null && u.getHost() != null && u.getHost().contains("razorpay")) t = "Secure Payment";
        } catch (Exception ignored) {
        }
        if (t == null) {
            String wt = web.getTitle();
            t = (wt == null || wt.startsWith("http") || wt.isEmpty()) ? "Lesson Guru" : wt.split("[|—–-]")[0].trim();
        }
        titleView.setText(t);
    }

    void goHub(String tab) {
        web.loadUrl(HUB_URL + "#" + tab);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // Android 12 and older (13+ uses the OnBackInvokedCallback registered in onCreate)
        handleBack();
    }

    void handleBack() {
        if (popup != null) {
            if (popup.canGoBack()) popup.goBack();
            else closePopup();
            return;
        }
        if (onHub) {
            web.evaluateJavascript("(window.LGHub&&LGHub.onBack())?'1':'0'", v -> {
                if ("\"1\"".equals(v)) return;
                if (web.canGoBack() && !isHubHome()) {
                    web.goBack();
                } else {
                    exitOrHint();
                }
            });
            return;
        }
        if (web.canGoBack()) {
            web.goBack();
        } else {
            goHub("home");
        }
    }

    private boolean isHubHome() {
        android.webkit.WebBackForwardList h = web.copyBackForwardList();
        // only the hub itself in history -> exit
        for (int i = 0; i < h.getCurrentIndex(); i++) {
            if (!h.getItemAtIndex(i).getUrl().startsWith(APP_PREFIX)) return false;
        }
        return true;
    }

    @SuppressWarnings("deprecation")
    private void exitOrHint() {
        long now = System.currentTimeMillis();
        if (now - lastBackAt < 2000) {
            finish();
        } else {
            lastBackAt = now;
            snack("Press back again to exit", null, null);
        }
    }

    // ------------------------------------------------------------------ actions

    void shareCurrent() {
        String url = currentUrl;
        if (url == null || url.startsWith(APP_PREFIX)) url = BASE;
        share("Lesson Guru Odisha", "📚 Lesson plans, Panchapadi, question papers & more for Odisha teachers:\n" + url);
    }

    void share(String subject, String text) {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_SUBJECT, subject);
        i.putExtra(Intent.EXTRA_TEXT, text);
        startActivity(Intent.createChooser(i, "Share via"));
    }

    void print(String title) {
        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
        if (pm == null) return;
        String job = (title == null || title.isEmpty()) ? "Lesson Guru" : title;
        pm.print(job, web.createPrintDocumentAdapter(job),
                new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
    }

    void rateApp() {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + PLAY_APP_ID)));
        } catch (ActivityNotFoundException e) {
            openExternal(Uri.parse("https://play.google.com/store/apps/details?id=" + PLAY_APP_ID));
        }
    }

    boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        @SuppressWarnings("deprecation") NetworkInfo ni = cm.getActiveNetworkInfo();
        return ni != null && ni.isConnected();
    }

    JSONObject info() {
        JSONObject o = new JSONObject();
        float d = getResources().getDisplayMetrics().density;
        try {
            o.put("platform", "android");
            o.put("version", BuildInfo.VERSION_NAME);
            o.put("versionCode", BuildInfo.VERSION_CODE);
            o.put("direct", BuildInfo.DIRECT);
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("sat", insetTop / d);
            o.put("sab", insetBottom / d);
            o.put("online", isOnline());
        } catch (Exception ignored) {
        }
        return o;
    }

    // ------------------------------------------------------------------ downloads

    private void onDownload(String url, String contentDisposition, String mime) {
        if (url.startsWith("blob:") || url.startsWith("data:")) {
            web.evaluateJavascript(Inject.fetchAndSave(url), null);
            return;
        }
        String name = URLUtil.guessFileName(url, contentDisposition, mime);
        Uri u = Uri.parse(url);
        String cur = currentUrl == null ? "" : currentUrl;
        if (u.getHost() != null && isInternalHost(u.getHost().toLowerCase(Locale.US)) && cur.startsWith(BASE + "/")) {
            // same-origin: fetch in the page with the teacher's session so the file is also backed up to the cloud
            web.evaluateJavascript(Inject.download(url, name), null);
            return;
        }
        nativeDownload(url, name, mime);
    }

    /** DownloadManager fallback (external hosts, or when the in-page fetch fails). */
    void nativeDownload(String url, String name, String mime) {
        withStorage(() -> {
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) r.addRequestHeader("Cookie", cookies);
                r.addRequestHeader("User-Agent", web.getSettings().getUserAgentString());
                r.setMimeType(mime != null ? mime : MimeTypeMap.getSingleton()
                        .getMimeTypeFromExtension(MimeTypeMap.getFileExtensionFromUrl(url)));
                r.setTitle(name);
                r.setDescription("Lesson Guru Odisha");
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "LessonGuru/" + name);
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                dm.enqueue(r);
                snack("Downloading " + name + "…", null, null);
            } catch (Exception e) {
                openExternal(Uri.parse(url));
            }
        });
    }

    // Result of the latest save, combined with its cloud backup status into one message.
    private volatile Uri lastSavedUri;
    private volatile String lastSavedName;
    private volatile String cloudState;

    /** Called from JS (any thread) with a data: URL produced from a blob. */
    void saveDataUrl(String dataUrl, String name, String mime, boolean openAfter) {
        lastSavedUri = null;
        cloudState = null;
        withStorage(() -> new Thread(() -> {
            try {
                Uri saved = saver.saveDataUrl(dataUrl, name, mime);
                lastSavedName = saver.lastName;
                lastSavedUri = saved;
                ui.post(() -> {
                    if (openAfter) {
                        saver.open(saved);
                    } else {
                        showSavedSnack();
                    }
                });
            } catch (Exception e) {
                ui.post(() -> toast("Could not save file: " + e.getMessage()));
            }
        }).start());
    }

    /** Called from JS when the cloud backup of the latest download finishes. */
    void onCloudStatus(String status) {
        cloudState = status;
        ui.post(() -> {
            if (lastSavedUri != null) showSavedSnack();
        });
    }

    private void showSavedSnack() {
        Uri uri = lastSavedUri;
        String name = lastSavedName;
        String c = cloudState;
        if ("quota".equals(c)) {
            snack("Saved to phone · Cloud storage is full", "MANAGE", () -> goHub("cloud"));
        } else if ("ok".equals(c) || "duplicate".equals(c)) {
            snack("Saved to phone & Cloud Library ☁️ › " + name, "OPEN", () -> saver.open(uri));
        } else if ("error".equals(c)) {
            snack("Saved to phone (cloud backup failed) › " + name, "OPEN", () -> saver.open(uri));
        } else {
            snack("Saved to Downloads › " + name, "OPEN", () -> saver.open(uri));
        }
    }

    private void withStorage(Runnable action) {
        if (Build.VERSION.SDK_INT >= 29
                || checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) {
            ui.post(action);
            return;
        }
        pendingStorageAction = action;
        requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == REQ_STORAGE) {
            Runnable r = pendingStorageAction;
            pendingStorageAction = null;
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED && r != null) r.run();
            else toast("Storage permission is needed to save files");
        }
    }

    // ------------------------------------------------------------------ feedback

    void toast(String msg) {
        ui.post(() -> Toast.makeText(this, msg, Toast.LENGTH_SHORT).show());
    }

    private Runnable hideSnack;

    void snack(String msg, String action, Runnable onAction) {
        snackHost.removeAllViews();
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(18), dp(12), dp(10), dp(12));
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{0xF21E1B4B, 0xF23B0764});
        bg.setCornerRadius(dp(16));
        bar.setBackground(bg);
        bar.setElevation(dp(8));
        TextView t = new TextView(this);
        t.setText(msg);
        t.setTextColor(Color.WHITE);
        t.setTextSize(14);
        t.setMaxLines(2);
        bar.addView(t, new LinearLayout.LayoutParams(0, -2, 1f));
        if (action != null) {
            TextView a = new TextView(this);
            a.setText(action);
            a.setTextColor(0xFFFFD60A);
            a.setTypeface(Typeface.DEFAULT_BOLD);
            a.setPadding(dp(14), dp(6), dp(14), dp(6));
            a.setOnClickListener(v -> {
                snackHost.removeAllViews();
                if (onAction != null) onAction.run();
            });
            bar.addView(a);
        }
        bar.setAlpha(0f);
        bar.setTranslationY(dp(24));
        snackHost.addView(bar, new FrameLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT));
        bar.animate().alpha(1f).translationY(0).setDuration(220).start();
        if (hideSnack != null) ui.removeCallbacks(hideSnack);
        hideSnack = () -> bar.animate().alpha(0f).translationY(dp(24)).setDuration(200)
                .withEndAction(() -> snackHost.removeView(bar)).start();
        ui.postDelayed(hideSnack, action != null ? 6000 : 2200);
    }
}
