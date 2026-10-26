package com.lessonguruodisha.app;

import android.net.Uri;
import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.webkit.JavascriptInterface;

/** window.LGApp — only honoured while the main frame is our own origin. */
final class Bridge {
    private final MainActivity a;

    Bridge(MainActivity a) {
        this.a = a;
    }

    private boolean trusted() {
        String u = a.currentUrl;
        return u != null && (u.startsWith(MainActivity.BASE + "/") || u.equals(MainActivity.BASE));
    }

    @JavascriptInterface
    public String getInfo() {
        return a.info().toString();
    }

    @JavascriptInterface
    public void saveFile(String dataUrl, String name, String mime) {
        if (trusted()) a.saveDataUrl(dataUrl, name, mime, false);
    }

    /** Saves to Downloads/LessonGuru and opens it (used by the Cloud Library). */
    @JavascriptInterface
    public void openFile(String dataUrl, String name, String mime) {
        if (trusted()) a.saveDataUrl(dataUrl, name, mime, true);
    }

    @JavascriptInterface
    public void cloudStatus(String status, String info) {
        if (trusted()) a.onCloudStatus(status);
    }

    @JavascriptInterface
    public void nativeDownload(String url) {
        if (!trusted() || url == null) return;
        Uri u = Uri.parse(url);
        if (!"https".equals(u.getScheme())) return;
        a.runOnUiThread(() -> a.nativeDownload(url, android.webkit.URLUtil.guessFileName(url, null, null), null));
    }

    @JavascriptInterface
    public void print(String title) {
        if (trusted()) a.runOnUiThread(() -> a.print(title));
    }

    @JavascriptInterface
    public void share(String subject, String text) {
        if (trusted()) a.runOnUiThread(() -> a.share(subject, text));
    }

    @JavascriptInterface
    public void openExternal(String url) {
        if (!trusted() || url == null) return;
        Uri u = Uri.parse(url);
        String s = u.getScheme() == null ? "" : u.getScheme();
        if (s.equals("https") || s.equals("upi") || s.equals("tel") || s.equals("mailto") || s.equals("whatsapp") || s.equals("market")) {
            a.runOnUiThread(() -> a.openExternal(u));
        }
    }

    @JavascriptInterface
    public void rateApp() {
        if (trusted()) a.runOnUiThread(a::rateApp);
    }

    @JavascriptInterface
    public void toast(String msg) {
        if (trusted()) a.toast(msg);
    }

    @JavascriptInterface
    public void haptic(String kind) {
        a.runOnUiThread(() -> {
            int c = HapticFeedbackConstants.KEYBOARD_TAP;
            if ("success".equals(kind) && Build.VERSION.SDK_INT >= 30) c = HapticFeedbackConstants.CONFIRM;
            else if ("heavy".equals(kind)) c = HapticFeedbackConstants.LONG_PRESS;
            a.web.performHapticFeedback(c);
        });
    }

    @JavascriptInterface
    public void setStatusBarStyle(String style) {
        if (trusted()) a.runOnUiThread(() -> a.setDarkStatusIcons("dark".equals(style)));
    }

    @JavascriptInterface
    public void purchaseBlocked() {
        if (trusted()) a.showPurchaseNotice();
    }

    @JavascriptInterface
    public boolean isOnline() {
        return a.isOnline();
    }

    @JavascriptInterface
    public void exitApp() {
        if (trusted()) a.runOnUiThread(a::finish);
    }
}
