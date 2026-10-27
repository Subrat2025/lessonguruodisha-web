package com.lessonguruodisha.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.content.Intent;
import android.content.res.TypedArray;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceResponse;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.shadows.ShadowAlertDialog;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

/** Launches the real activity on each Android version the app supports, end to end. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {24, 26, 28, 29, 30, 31, 33, 34, 35, 36})
public class LaunchTest {

    @Test
    public void launchesAndShowsHub() {
        try (ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity a = c.get();
            assertNotNull(a.web);
            assertEquals(MainActivity.HUB_URL, shadowOf(a.web).getLastLoadedUrl());
            assertTrue(a.web.getSettings().getJavaScriptEnabled());
            assertTrue(a.web.getSettings().getUserAgentString().contains("LessonGuruApp/"));

            // our theme (from the hand-written resources.arsc) resolved and applied
            int themeId = a.getResources().getIdentifier("AppTheme", "style", a.getPackageName());
            assertEquals(0x7f030000, themeId);
            TypedArray t = a.getTheme().obtainStyledAttributes(new int[]{android.R.attr.windowBackground});
            assertEquals(0xFF4C1D95, ((ColorDrawable) t.getDrawable(0)).getColor());
            t.recycle();
            assertNotNull(a.getResources().getDrawable(a.getResources().getIdentifier("ic_launcher", "mipmap", a.getPackageName()), null));

            // switching to a live-site page shows the native header, back to the hub hides it
            a.onUrlChanged(MainActivity.BASE + "/lessons");
            a.setDarkStatusIcons(true);
            a.setDarkStatusIcons(false);
            a.onUrlChanged(MainActivity.HUB_URL);

            // bundled assets are served at the in-app origin
            WebResourceResponse r = AssetServer.serve(a, Uri.parse(MainActivity.APP_PREFIX + "index.html"));
            assertNotNull(r);
            assertEquals("text/html", r.getMimeType());
            assertTrue(Inject.script(a).contains("__lgPatched"));

            // feedback + navigation helpers don't throw
            a.snack("Saved", "OPEN", null);
            a.onBackPressed();
            assertTrue(a.route(Uri.parse("upi://pay?pa=x@upi"), true));
            assertTrue(!a.route(Uri.parse(MainActivity.BASE + "/lessons"), true));

            // full lifecycle incl. rotation-style state save/restore
            Bundle state = new Bundle();
            c.pause().saveInstanceState(state).stop();
            c.restart().resume();
            c.pause().stop().destroy();
        }
    }

    @Test
    public void opensDeepLink() {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("https://lessonguruodisha.com/panchapadi"));
        try (ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class, i).setup()) {
            assertEquals("https://lessonguruodisha.com/panchapadi", shadowOf(c.get().web).getLastLoadedUrl());
        }
    }

    @Test
    public void offersCrashReportOnceAfterACrash() {
        // the installed handler records the crash and still hands it to the previous handler
        final Throwable[] passedOn = new Throwable[1];
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> passedOn[0] = e);
        try (ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup()) {
            assertNull(ShadowAlertDialog.getLatestAlertDialog());
            IllegalStateException boom = new IllegalStateException("boom");
            Thread.getDefaultUncaughtExceptionHandler().uncaughtException(Thread.currentThread(), boom);
            assertEquals(boom, passedOn[0]);
        }
        try (ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup()) {
            android.app.AlertDialog d = ShadowAlertDialog.getLatestAlertDialog();
            assertNotNull(d);
            assertTrue(d.isShowing());
            d.dismiss();
        }
        ShadowAlertDialog.reset();
        try (ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup()) {
            assertNull("report is offered only once", ShadowAlertDialog.getLatestAlertDialog());
        }
        assertNull(CrashLog.take(RuntimeEnvironment.getApplication()));
    }

    @Test
    public void purchasesAreNotOfferedInTheApp() {
        // Google Play Payments policy: the app is consumption-only; buying happens on the website
        for (String p : new String[]{"/plans", "/plans/", "/store", "/store/checkout", "/store/item/abc", "/assessment", "/my-qr-payments", "/PLANS"})
            assertTrue(p, MainActivity.isPurchasePath(p));
        for (String p : new String[]{"/store/library", "/store/library/x", "/store/orders", "/store/orders/7", "/assessment/my", "/my-plan", "/dashboard", "/", "", null})
            assertTrue(String.valueOf(p), !MainActivity.isPurchasePath(p));
        try (ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity a = c.get();
            String before = a.currentUrl;
            // tapping a store / plans link: handled (not loaded), nothing launched, user told why
            assertTrue(a.route(Uri.parse(MainActivity.BASE + "/plans"), true));
            assertTrue(a.route(Uri.parse(MainActivity.BASE + "/store/checkout?id=1"), true));
            assertNull(shadowOf(a).getNextStartedActivity());
            shadowOf(android.os.Looper.getMainLooper()).idle();
            android.app.Dialog d = org.robolectric.shadows.ShadowDialog.getLatestDialog();
            assertTrue(d != null && d.isShowing());
            assertEquals(before, a.currentUrl);
            // purchased content still opens in-app
            assertTrue(!a.route(Uri.parse(MainActivity.BASE + "/store/library"), true));
        }
    }

    @Test
    public void paymentsAndPopupsStayInTheApp() {
        try (ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity a = c.get();
            org.robolectric.shadows.ShadowActivity sa = shadowOf(a);

            // iframes (Razorpay checkout frame, YouTube embeds) load in place — never kicked out to a browser
            assertTrue(!a.route(Uri.parse("https://api.razorpay.com/v1/checkout/public"), false));
            assertTrue(!a.route(Uri.parse("https://www.youtube.com/embed/x"), false));
            assertNull(sa.getNextStartedActivity());

            // external site in the main frame opens outside the app
            a.currentUrl = MainActivity.BASE + "/plans";
            assertTrue(a.route(Uri.parse("https://example.org/page"), true));
            assertEquals("https://example.org/page", sa.getNextStartedActivity().getData().toString());

            // …but not while a Razorpay page is on screen (bank / 3-D Secure redirect)
            a.currentUrl = "https://api.razorpay.com/v1/payments/abc/authenticate";
            assertTrue(!a.route(Uri.parse("https://netbanking.somebank.in/acs"), true));
            assertNull(sa.getNextStartedActivity());

            // UPI hand-off goes to the UPI app
            assertTrue(a.route(Uri.parse("upi://pay?pa=lessonguru@upi&am=199"), true));
            assertEquals("upi", sa.getNextStartedActivity().getData().getScheme());
            assertTrue(a.route(Uri.parse("intent://pay?pa=x@upi#Intent;scheme=upi;package=com.phonepe.app;end"), true));
            android.content.Intent upi = sa.getNextStartedActivity();
            assertEquals("upi", upi.getData().getScheme());
            assertEquals("com.phonepe.app", upi.getPackage());

            // window.open → popup overlay; back closes it; main page untouched
            assertTrue(a.web.getSettings().supportMultipleWindows());
            android.webkit.WebView p = a.openPopup();
            assertNotNull(a.popup);
            assertEquals(p, a.popup);
            a.onBackPressed();
            assertNull(a.popup);
            a.openPopup();
            a.closePopup();
            assertNull(a.popup);
        }
    }

    /** Android 13+: the system back gesture goes to our OnBackInvokedCallback (onBackPressed is not called on 16+). */
    @Test
    public void systemBackGestureIsHandled() throws Exception {
        if (android.os.Build.VERSION.SDK_INT < 33) return;
        // The real binary manifest sets android:enableOnBackInvokedCallback="true"; Robolectric's
        // text-manifest reader doesn't carry that flag over, so set it the way the system would.
        android.content.pm.ApplicationInfo ai = RuntimeEnvironment.getApplication().getApplicationInfo();
        ai.getClass().getMethod("setEnableOnBackInvokedCallback", boolean.class).invoke(ai, true);
        try (ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity a = c.get();
            // Activity → ProxyOnBackInvokedDispatcher, which forwards to the window's real dispatcher.
            Object proxy = a.getOnBackInvokedDispatcher();
            java.lang.reflect.Field f = proxy.getClass().getDeclaredField("mActualDispatcher");
            f.setAccessible(true);
            Object actual = f.get(proxy);
            java.lang.reflect.Method top = actual.getClass().getMethod("getTopCallback");
            android.window.OnBackInvokedCallback cb = (android.window.OnBackInvokedCallback) top.invoke(actual);
            assertNotNull("back callback registered", cb);
            assertTrue("our callback is the one on top: " + cb.getClass().getName(), cb.getClass().getName().startsWith("com.lessonguruodisha.app."));
            a.openPopup();
            cb.onBackInvoked();
            assertNull("back gesture closed the popup", a.popup);
        }
    }
}
