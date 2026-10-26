package com.lessonguruodisha.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import java.io.PrintWriter;
import java.io.StringWriter;

/**
 * Remembers the last crash so the next launch can offer to send it to support.
 * Chains to the previous handler, so the system still shows its normal dialog.
 */
final class CrashLog implements Thread.UncaughtExceptionHandler {
    private static final String PREFS = "crash_log";
    private static final String KEY = "report";

    private final Context app;
    private final Thread.UncaughtExceptionHandler previous;

    private CrashLog(Context app, Thread.UncaughtExceptionHandler previous) {
        this.app = app;
        this.previous = previous;
    }

    static void install(Context ctx) {
        Thread.UncaughtExceptionHandler current = Thread.getDefaultUncaughtExceptionHandler();
        if (current instanceof CrashLog) return;
        Thread.setDefaultUncaughtExceptionHandler(new CrashLog(ctx.getApplicationContext(), current));
    }

    @Override
    public void uncaughtException(Thread t, Throwable e) {
        try {
            save(app, e);
        } catch (Throwable ignored) {
        }
        if (previous != null) previous.uncaughtException(t, e);
    }

    static void save(Context ctx, Throwable e) {
        StringWriter sw = new StringWriter();
        e.printStackTrace(new PrintWriter(sw));
        String report = "Lesson Guru " + BuildInfo.VERSION_NAME + " (" + BuildInfo.VERSION_CODE + ")"
                + " · Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")"
                + " · " + Build.MANUFACTURER + " " + Build.MODEL + "\n" + sw;
        // commit(), not apply(): the process is about to die
        prefs(ctx).edit().putString(KEY, report.length() > 6000 ? report.substring(0, 6000) : report).commit();
    }

    /** @return the pending report (and forgets it), or null. */
    static String take(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String r = p.getString(KEY, null);
        if (r != null) p.edit().remove(KEY).apply();
        return r;
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
