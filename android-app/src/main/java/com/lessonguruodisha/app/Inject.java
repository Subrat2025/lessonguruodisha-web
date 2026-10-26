package com.lessonguruodisha.app;

import android.content.Context;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

/** JavaScript injected into pages to bridge web-only behaviours to native ones. */
final class Inject {
    private Inject() {
    }

    private static String script;

    /** Page patch from assets/app/inject.js (downloads, cloud backup, print, install banner). */
    static String script(Context ctx) {
        if (script == null) {
            try (InputStream in = ctx.getAssets().open("app/inject.js")) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                script = (BuildInfo.DIRECT ? "window.__LG_DIRECT__=true;\n" : "") + out.toString("UTF-8");
            } catch (IOException e) {
                script = "";
            }
        }
        return script;
    }

    static String download(String url, String guessName) {
        return "window.__lgDownload&&__lgDownload(" + JSONObject.quote(url) + "," + JSONObject.quote(guessName) + ")";
    }

    static String fetchAndSave(String url) {
        return "window.__lgSave&&__lgSave(" + JSONObject.quote(url) + ",'')";
    }

    /** Remembers the last live page and counts this week's activity for the hub. */
    static String trackVisit() {
        return "(function(){try{var p=location.pathname+location.search;"
                + "if(p==='/'||/^\\/(login|register|forgot-password)/.test(p))return;"
                + "var last=JSON.parse(localStorage.getItem('lgapp_last')||'{}');"
                + "localStorage.setItem('lgapp_last',JSON.stringify({p:p,t:document.title,ts:Date.now()}));"
                + "var now=new Date();var ws=new Date(now.getFullYear(),now.getMonth(),now.getDate()-((now.getDay()+6)%7)).getTime();"
                + "var w=JSON.parse(localStorage.getItem('lgapp_week')||'{}');if(w.ws!==ws)w={ws:ws,n:0};"
                + "if(last.p!==p){w.n=(w.n||0)+1;}localStorage.setItem('lgapp_week',JSON.stringify(w));"
                + "}catch(e){}})()";
    }
}
