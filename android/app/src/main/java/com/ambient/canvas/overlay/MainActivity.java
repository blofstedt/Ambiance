package com.ambient.canvas.overlay;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int GEOLOCATION_PERMISSION_REQUEST = 1001;

    /** AND-06: shared with AmbientDreamService so the screensaver can render
     *  real state instead of hardcoded defaults. */
    static final String DREAM_PREFS = "ambient_dream_state";
    static final String DREAM_STATE_KEY = "state_json";
    static final String DREAM_STATE_UPDATED_AT = "updated_at";

    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;

    /** AND-10: over-the-air updates. See UpdateInstaller. */
    private UpdateInstaller updateInstaller;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        updateInstaller = new UpdateInstaller(this);

        if (getBridge() != null && getBridge().getWebView() != null) {
            // AND-06: expose a minimal, local-assets-only JS interface. The web
            // layer pushes a state snapshot here; AmbientDreamService reads it
            // back. This is necessary because the dream WebView has no Capacitor
            // bridge and runs on a file:// origin, so it shares no localStorage
            // with the main app.
            getBridge().getWebView().addJavascriptInterface(new AmbientNativeBridge(), "AmbientNative");

            getBridge().getWebView().setWebChromeClient(new WebChromeClient() {
                @Override
                public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                    if (hasLocationPermission()) {
                        callback.invoke(origin, true, false);
                        return;
                    }
                    pendingGeoCallback = callback;
                    pendingGeoOrigin = origin;
                    ActivityCompat.requestPermissions(
                        MainActivity.this,
                        new String[]{Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION},
                        GEOLOCATION_PERMISSION_REQUEST
                    );
                }
            });
        }

        // AND-04: an ambient art display that lets the panel sleep is useless.
        // Default on; the web layer can turn it off via AmbientNative.setKeepAwake.
        applyKeepAwake(true);
    }

    private void applyKeepAwake(final boolean enabled) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (enabled) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            }
        });
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != GEOLOCATION_PERMISSION_REQUEST || pendingGeoCallback == null) return;

        boolean granted = false;
        for (int result : grantResults) {
            if (result == PackageManager.PERMISSION_GRANTED) {
                granted = true;
                break;
            }
        }
        pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
        pendingGeoCallback = null;
        pendingGeoOrigin = null;
    }

    /** The running build's own version, for the update check to compare against. */
    private PackageInfo selfPackageInfo() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0);
        } catch (PackageManager.NameNotFoundException e) {
            return null;
        }
    }

    /** Minimal native surface. Only reachable from bundled local assets. */
    private class AmbientNativeBridge {

        @JavascriptInterface
        public void saveDreamState(String json) {
            if (json == null || json.length() > 64_000) return;
            SharedPreferences prefs = getSharedPreferences(DREAM_PREFS, MODE_PRIVATE);
            prefs.edit()
                .putString(DREAM_STATE_KEY, json)
                .putLong(DREAM_STATE_UPDATED_AT, System.currentTimeMillis())
                .apply();
        }

        @JavascriptInterface
        public void setKeepAwake(boolean enabled) {
            applyKeepAwake(enabled);
        }

        @JavascriptInterface
        public boolean isNativeHost() {
            return true;
        }

        /* ------------------------------------------------- AND-10: updates */

        @JavascriptInterface
        public String getVersionName() {
            PackageInfo info = selfPackageInfo();
            return info == null || info.versionName == null ? "" : info.versionName;
        }

        @JavascriptInterface
        public long getVersionCode() {
            PackageInfo info = selfPackageInfo();
            if (info == null) return 0;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return info.getLongVersionCode();
            }
            return info.versionCode;
        }

        @JavascriptInterface
        public void startUpdateDownload(String url, String sha256, String versionName) {
            updateInstaller.start(url, sha256, versionName);
        }

        @JavascriptInterface
        public String getUpdateStatus() {
            return updateInstaller.getStatusJson();
        }

        @JavascriptInterface
        public void installDownloadedUpdate() {
            updateInstaller.install();
        }

        @JavascriptInterface
        public void cancelUpdateDownload() {
            updateInstaller.cancel();
        }

        @JavascriptInterface
        public boolean canInstallPackages() {
            return updateInstaller.canInstallPackages();
        }

        @JavascriptInterface
        public void openInstallPermissionSettings() {
            updateInstaller.openInstallPermissionSettings(MainActivity.this);
        }
    }
}
