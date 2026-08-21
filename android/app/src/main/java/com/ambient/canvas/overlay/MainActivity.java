package com.ambient.canvas.overlay;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    private static final int GEOLOCATION_PERMISSION_REQUEST = 1001;

    /** AND-06: shared with AmbientDreamService so the screensaver can render
     *  real state instead of hardcoded defaults. */
    static final String DREAM_PREFS = "ambient_dream_state";
    static final String DREAM_STATE_KEY = "state_json";
    static final String DREAM_STATE_UPDATED_AT = "updated_at";

    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;

    /** AND-11: over-the-air updates. See UpdateInstaller. */
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

    /*
     * AND-16: a DreamService is inert until the user picks it in the system
     * screensaver settings, and nothing in the app pointed them there. On a TV
     * that screen is buried several levels deep and is named differently on
     * almost every brand, so "go and find it" is not a usable instruction.
     *
     * Android TV vendors do not all ship the standard dream picker, hence the
     * cascade: the exact screensaver screen if it exists, then display
     * settings, then the settings root. resolveActivity() is deliberately not
     * used — API 30 package visibility can hide the target from us even when
     * launching it would have worked.
     */
    private boolean launchSettingsScreen(String action) {
        try {
            Intent intent = new Intent(action);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            return false;
        }
    }

    /* ------------------------------------------- AND-17: screensaver override */

    /*
     * These four keys are the system's own screensaver configuration. They are
     * plain Settings.Secure entries; the constants exist in the framework but
     * are @hide, so the literal strings are used. They have been stable since
     * Android 4.2 and are what DreamManagerService itself reads.
     */
    private static final String SCREENSAVER_COMPONENTS = "screensaver_components";
    private static final String SCREENSAVER_ENABLED = "screensaver_enabled";
    private static final String SCREENSAVER_ON_SLEEP = "screensaver_activate_on_sleep";
    private static final String SCREENSAVER_ON_DOCK = "screensaver_activate_on_dock";

    private ComponentName dreamComponent() {
        return new ComponentName(this, AmbientDreamService.class);
    }

    private boolean holdsWriteSecureSettings() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_SECURE_SETTINGS)
            == PackageManager.PERMISSION_GRANTED;
    }

    /** True when this app's dream is the device's currently selected screensaver. */
    private boolean isSelectedScreensaver() {
        ContentResolver cr = getContentResolver();
        if (Settings.Secure.getInt(cr, SCREENSAVER_ENABLED, 1) == 0) return false;

        String components = Settings.Secure.getString(cr, SCREENSAVER_COMPONENTS);
        if (components == null || components.isEmpty()) return false;

        ComponentName ours = dreamComponent();
        // The value is a colon-separated list, and entries may be stored in
        // either the long or the short ("pkg/.Class") flattened form.
        for (String entry : components.split(":")) {
            ComponentName parsed = ComponentName.unflattenFromString(entry.trim());
            if (parsed != null && parsed.equals(ours)) return true;
        }
        return false;
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

        /** AND-16: takes the user straight to the system screensaver picker. */
        @JavascriptInterface
        public boolean openScreensaverSettings() {
            return launchSettingsScreen(Settings.ACTION_DREAM_SETTINGS)
                || launchSettingsScreen(Settings.ACTION_DISPLAY_SETTINGS)
                || launchSettingsScreen(Settings.ACTION_SETTINGS);
        }

        /**
         * AND-17: whether the screensaver is actually active, and whether this
         * build is able to switch it on without the system picker.
         *
         * `packageName` is read at runtime rather than hardcoded because debug
         * builds carry an `.debug` applicationIdSuffix — an adb command printed
         * with the wrong package name silently grants nothing.
         */
        @JavascriptInterface
        public String getScreensaverStatus() {
            boolean selected = false;
            boolean known = true;
            try {
                selected = isSelectedScreensaver();
            } catch (Exception e) {
                // Some OEM builds restrict reads of individual Secure keys.
                known = false;
            }
            try {
                return new JSONObject()
                    .put("selected", selected)
                    .put("known", known)
                    .put("canAssign", holdsWriteSecureSettings())
                    .put("packageName", getPackageName())
                    .toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        /**
         * AND-17: sets this app's dream as the screensaver directly, bypassing
         * the system picker.
         *
         * Several Google TV models only ever offer Google's own ambient screen
         * and never list third-party dreams — but that restriction lives in the
         * Settings UI, not in DreamManagerService, which still reads these
         * Secure keys. Writing them requires WRITE_SECURE_SETTINGS, which no
         * app can be granted normally; it carries the `development` protection
         * flag, so the owner of the device can grant it over adb. Until they do,
         * this returns false and the UI keeps pointing at the picker instead.
         */
        @JavascriptInterface
        public boolean assignScreensaver() {
            if (!holdsWriteSecureSettings()) return false;
            try {
                ContentResolver cr = getContentResolver();
                Settings.Secure.putString(
                    cr, SCREENSAVER_COMPONENTS, dreamComponent().flattenToString());
                Settings.Secure.putInt(cr, SCREENSAVER_ENABLED, 1);
                Settings.Secure.putInt(cr, SCREENSAVER_ON_SLEEP, 1);
                Settings.Secure.putInt(cr, SCREENSAVER_ON_DOCK, 1);
                return isSelectedScreensaver();
            } catch (Exception e) {
                return false;
            }
        }

        /* ------------------------------------------------- AND-11: updates */

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
