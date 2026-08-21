package com.ambient.canvas.overlay;

import android.annotation.SuppressLint;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.service.dreams.DreamService;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class AmbientDreamService extends DreamService {

    private static final String DREAM_URL = "file:///android_asset/public/index.html?dream=1";

    private WebView dreamWebView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    public void onAttachedToWindow() {
        super.onAttachedToWindow();
        setInteractive(false);
        setFullscreen(true);
        setScreenBright(false);

        dreamWebView = new WebView(this);
        dreamWebView.setBackgroundColor(Color.BLACK);

        WebSettings settings = dreamWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        // AND-06/WEB-16: the dream must render from bundled assets only. No
        // network is assumed and none is required.
        settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);

        // AND-06: the dream WebView has no Capacitor bridge and runs on a
        // file:// origin, so it cannot read the app's localStorage and cannot
        // reach the sensor. Previously it therefore rendered the hardcoded
        // default telemetry forever. We now inject the last snapshot the main
        // activity persisted, and the web layer renders in a read-only mode.
        dreamWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectDreamState(view);
            }
        });

        setContentView(dreamWebView);
    }

    private void injectDreamState(WebView view) {
        SharedPreferences prefs = getSharedPreferences(MainActivity.DREAM_PREFS, MODE_PRIVATE);
        String json = prefs.getString(MainActivity.DREAM_STATE_KEY, null);
        long updatedAt = prefs.getLong(MainActivity.DREAM_STATE_UPDATED_AT, 0L);
        if (json == null || json.isEmpty()) return;

        String script =
            "window.__AMBIENT_DREAM_STATE__ = " + json + ";" +
            "window.__AMBIENT_DREAM_STATE_AT__ = " + updatedAt + ";" +
            "window.dispatchEvent(new Event('ambient-dream-state'));";
        view.evaluateJavascript(script, null);
    }

    @Override
    public void onDreamingStarted() {
        super.onDreamingStarted();
        if (dreamWebView != null) {
            dreamWebView.onResume();
            dreamWebView.loadUrl(DREAM_URL);
        }
    }

    @Override
    public void onDreamingStopped() {
        /*
         * AND-16: this used to call pauseTimers(). That API is documented as
         * global — "pauses all layout, parsing and JavaScript timers for all
         * WebViews" in the process, not just this one. The dream and the main
         * activity share a process, so ending the screensaver froze the app's
         * own WebView: the clock stopped, sensor polling stopped and the UI
         * looked hung until the app was force-stopped.
         *
         * onPause() is per-WebView and is all that is needed here, because
         * onDetachedFromWindow follows immediately and destroys the WebView
         * outright — which stops every timer it owns and nothing else's.
         */
        if (dreamWebView != null) {
            dreamWebView.stopLoading();
            dreamWebView.onPause();
        }
        super.onDreamingStopped();
    }

    @Override
    public void onDetachedFromWindow() {
        if (dreamWebView != null) {
            /*
             * AND-16: removeAllViews() removes the WebView's *children*, not the
             * WebView itself from its parent, so destroy() was being called on a
             * still-attached WebView. Android logs "WebView.destroy() called
             * while still attached" and the render surface can outlive the
             * dream. Detach from the real parent first.
             */
            dreamWebView.loadUrl("about:blank");
            dreamWebView.clearHistory();
            ViewParent parent = dreamWebView.getParent();
            if (parent instanceof ViewGroup) {
                ((ViewGroup) parent).removeView(dreamWebView);
            }
            dreamWebView.destroy();
            dreamWebView = null;
        }
        super.onDetachedFromWindow();
    }
}
