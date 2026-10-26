package com.lessonguruodisha.app;

import android.app.Activity;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

/**
 * Android 13+ back handling. From target SDK 36, Android 16 no longer calls onBackPressed();
 * the system back gesture is delivered to OnBackInvokedCallbacks instead. Kept in its own class
 * so older Android versions never load these API 33 types.
 */
final class BackCompat {
    private BackCompat() {
    }

    static void register(Activity activity, Runnable onBack) {
        OnBackInvokedCallback cb = onBack::run;
        activity.getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb);
    }
}
