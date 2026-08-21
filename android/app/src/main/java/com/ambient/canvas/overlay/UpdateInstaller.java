package com.ambient.canvas.overlay;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

import javax.net.ssl.HttpsURLConnection;

import org.json.JSONObject;

/**
 * AND-10: over-the-air updates from GitHub Releases.
 *
 * Android will not let a WebView install a package, so the download, the
 * checksum and the handoff to the system installer all have to happen here.
 * The web layer decides *whether* to update (src/lib/updates.ts, which is pure
 * and unit-tested); this class does it.
 *
 * Three things are deliberately re-checked here even though the web layer
 * already checked them — the host, the scheme and the size. A JavascriptInterface
 * is a public entry point into the app, and everything crossing it is an
 * argument from the WebView, not a promise. The one thing that genuinely cannot
 * be verified before the bytes arrive is the checksum, which is why a download
 * whose digest does not match what the release published is deleted rather than
 * installed.
 *
 * Progress is polled from JS via getStatusJson() rather than pushed. A
 * JavascriptInterface can only be called FROM the WebView, so pushing would mean
 * evaluateJavascript() off a worker thread for a value that changes a few times
 * a second at most.
 */
final class UpdateInstaller {

    private static final String TAG = "AmbientUpdate";

    /** Mirrors ALLOWED_HOSTS in src/lib/updates.ts. Keep the two in step. */
    private static final Set<String> ALLOWED_HOSTS = new HashSet<>(Arrays.asList(
        "github.com",
        "api.github.com",
        "objects.githubusercontent.com"
    ));

    /** Mirrors MAX_APK_BYTES in src/lib/updates.ts. */
    private static final long MAX_APK_BYTES = 200L * 1024L * 1024L;

    private static final int CONNECT_TIMEOUT_MS = 20_000;
    private static final int READ_TIMEOUT_MS = 60_000;
    private static final int MAX_REDIRECTS = 5;
    private static final String UPDATE_DIR = "updates";
    private static final String UPDATE_FILE = "ambient-canvas-update.apk";

    private final Context context;

    /** Guards every field below; touched from both the WebView and worker threads. */
    private final Object lock = new Object();

    private String state = "idle";
    private int progress = 0;
    private String error = "";
    private String versionName = "";
    private File downloaded;
    private Thread worker;
    private volatile boolean cancelled;

    UpdateInstaller(Context context) {
        this.context = context.getApplicationContext();
    }

    /* ------------------------------------------------------------- status */

    String getStatusJson() {
        synchronized (lock) {
            try {
                return new JSONObject()
                    .put("state", state)
                    .put("progress", progress)
                    .put("error", error)
                    .put("versionName", versionName)
                    .toString();
            } catch (Exception e) {
                return "{\"state\":\"error\",\"progress\":0,\"error\":\"Status unavailable.\",\"versionName\":\"\"}";
            }
        }
    }

    private void setState(String nextState, int nextProgress, String nextError) {
        synchronized (lock) {
            state = nextState;
            progress = nextProgress;
            error = nextError;
        }
    }

    /* ----------------------------------------------------------- download */

    void start(final String url, final String expectedSha256, final String version) {
        synchronized (lock) {
            if (worker != null && worker.isAlive()) return;

            if (!isTrustedUrl(url)) {
                state = "error";
                progress = 0;
                error = "That update came from an unexpected address and was not downloaded.";
                return;
            }

            cancelled = false;
            state = "downloading";
            progress = -1;
            error = "";
            versionName = version == null ? "" : version;
            downloaded = null;

            worker = new Thread(new Runnable() {
                @Override
                public void run() {
                    download(url, expectedSha256);
                }
            }, "ambient-update");
            worker.start();
        }
    }

    void cancel() {
        cancelled = true;
        synchronized (lock) {
            state = "idle";
            progress = 0;
            error = "";
        }
    }

    private void download(String url, String expectedSha256) {
        HttpURLConnection connection = null;
        File target = null;

        try {
            connection = openFollowingRedirects(url);

            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) {
                setState("error", 0, "The update server replied with an error (" + status + ").");
                return;
            }

            long expectedLength = connection.getContentLength();
            if (expectedLength > MAX_APK_BYTES) {
                setState("error", 0, "That update is unexpectedly large and was not downloaded.");
                return;
            }

            File directory = new File(context.getFilesDir(), UPDATE_DIR);
            if (!directory.exists() && !directory.mkdirs()) {
                setState("error", 0, "Could not create a place to save the update.");
                return;
            }
            target = new File(directory, UPDATE_FILE);

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long written = 0;

            InputStream input = connection.getInputStream();
            OutputStream output = new FileOutputStream(target);
            try {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (cancelled) {
                        deleteQuietly(target);
                        return;
                    }

                    written += read;
                    // A server that lies about Content-Length must not be able
                    // to fill the TV's storage.
                    if (written > MAX_APK_BYTES) {
                        deleteQuietly(target);
                        setState("error", 0, "That update is unexpectedly large and was not downloaded.");
                        return;
                    }

                    output.write(buffer, 0, read);
                    digest.update(buffer, 0, read);

                    if (expectedLength > 0) {
                        setState("downloading", (int) ((written * 100L) / expectedLength), "");
                    }
                }
                output.flush();
            } finally {
                closeQuietly(input);
                closeQuietly(output);
            }

            if (cancelled) {
                deleteQuietly(target);
                return;
            }

            setState("verifying", 100, "");

            /*
             * The checksum is the only thing that ties these bytes to the build
             * the release actually published. A mismatch is a deleted file, not
             * a warning — half a megabyte of the wrong APK is exactly what an
             * installer must never be handed.
             */
            String actual = toHex(digest.digest());
            if (expectedSha256 != null && expectedSha256.length() == 64) {
                if (!actual.equalsIgnoreCase(expectedSha256)) {
                    deleteQuietly(target);
                    setState("error", 0, "The download did not arrive intact and was discarded.");
                    return;
                }
            } else {
                Log.w(TAG, "Release published no checksum; installing on signature trust alone.");
            }

            synchronized (lock) {
                downloaded = target;
                state = "ready";
                progress = 100;
                error = "";
            }
        } catch (Exception e) {
            Log.w(TAG, "Update download failed", e);
            deleteQuietly(target);
            setState("error", 0, "The download failed. Check the TV's internet connection.");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /**
     * GitHub serves release assets as a redirect to a signed object-store URL.
     * HttpURLConnection does not follow a redirect across protocols or hosts on
     * its own, so it is done here — re-checking the destination at every hop,
     * because an open redirect would otherwise walk straight past the host
     * allowlist.
     */
    private HttpURLConnection openFollowingRedirects(String url) throws Exception {
        String current = url;

        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            if (!isTrustedUrl(current)) {
                throw new IllegalArgumentException("Untrusted redirect target");
            }

            HttpsURLConnection connection = (HttpsURLConnection) new URL(current).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setRequestProperty("Accept", "application/octet-stream");

            int status = connection.getResponseCode();
            boolean redirect = status == HttpURLConnection.HTTP_MOVED_PERM
                || status == HttpURLConnection.HTTP_MOVED_TEMP
                || status == HttpURLConnection.HTTP_SEE_OTHER
                || status == 307
                || status == 308;

            if (!redirect) return connection;

            String location = connection.getHeaderField("Location");
            connection.disconnect();
            if (location == null) throw new IllegalStateException("Redirect with no Location");
            current = new URL(new URL(current), location).toString();
        }

        throw new IllegalStateException("Too many redirects");
    }

    /* ------------------------------------------------------------ install */

    /**
     * Hands the verified APK to the system package installer. The user still
     * confirms in Android's own UI — this cannot install anything silently.
     */
    void install() {
        File apk;
        synchronized (lock) {
            apk = downloaded;
        }
        if (apk == null || !apk.exists()) {
            setState("error", 0, "There is no downloaded update to install.");
            return;
        }

        try {
            Uri uri = FileProvider.getUriForFile(
                context, context.getPackageName() + ".fileprovider", apk);

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);

            setState("installing", 100, "");
        } catch (Exception e) {
            Log.w(TAG, "Could not launch the package installer", e);
            setState("error", 0, "Android would not open the installer for this update.");
        }
    }

    /**
     * Android 8+ requires an explicit per-app grant before anything may install
     * a package. Without it the installer closes instantly with no message,
     * which on a TV is indistinguishable from a crash.
     */
    boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        try {
            return context.getPackageManager().canRequestPackageInstalls();
        } catch (Exception e) {
            return false;
        }
    }

    void openInstallPermissionSettings(Context activityContext) {
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + context.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activityContext.startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "No unknown-sources settings screen on this device", e);
        }
    }

    /* ------------------------------------------------------------ helpers */

    private static boolean isTrustedUrl(String url) {
        if (url == null) return false;
        try {
            URL parsed = new URL(url);
            return "https".equalsIgnoreCase(parsed.getProtocol())
                && ALLOWED_HOSTS.contains(parsed.getHost().toLowerCase(Locale.ROOT));
        } catch (Exception e) {
            return false;
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            out.append(Character.forDigit((b >> 4) & 0xF, 16));
            out.append(Character.forDigit(b & 0xF, 16));
        }
        return out.toString();
    }

    private static void deleteQuietly(File file) {
        if (file != null && file.exists() && !file.delete()) {
            Log.w(TAG, "Could not delete " + file.getName());
        }
    }

    private static void closeQuietly(java.io.Closeable closeable) {
        try {
            if (closeable != null) closeable.close();
        } catch (Exception ignored) {
            /* nothing useful to do */
        }
    }
}
