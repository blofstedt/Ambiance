# Binary-free Android folder notes

This repository intentionally excludes binary assets (PNG launcher/splash files and
`gradle-wrapper.jar`) so PR systems that reject binary diffs can still accept changes.

In CI, the workflow recreates `android/gradle/wrapper/gradle-wrapper.jar` from the
installed Gradle distribution before running `./gradlew`.

## How to restore a fully buildable Android project locally

1. Install web dependencies and build the web bundle:
   - `npm ci && npm run build`
2. Recreate Android resources and the Capacitor plugin project from Capacitor defaults:
   - `npx cap sync android`
   - This creates `android/capacitor-cordova-android-plugins/`, which `settings.gradle`
     requires. Gradle sync fails on a fresh clone without it (BUILD-01).
3. Restore Gradle wrapper JAR (if missing):
   - `cd android && gradle wrapper --gradle-version 8.14.3`
   - or run from Android Studio which will regenerate wrapper files.

`npm run android:prepare` performs steps 1 and 2 for you.

## Icons stay binary-free

All launcher, monochrome and TV banner assets are **vector drawables**
(`res/drawable/ic_launcher_foreground.xml`, `ic_launcher_monochrome.xml`,
`tv_banner.xml`) composed via `mipmap-anydpi-v26/ic_launcher.xml`.

Because there is no density-bucket PNG fallback, `minSdkVersion` is **26**
(AND-02). Do not lower it without first committing PNG mipmaps.

> Google TV / Play Store submission still requires a 320x180 banner PNG in the
> store listing itself. That asset lives in the listing, not in this repo.

## Included native functionality

Even without binary resources committed, native source/config changes remain in the repo:

- `AmbientDreamService` screensaver service, with state injection from the main app.
- TV launcher + dream service + location/network/wake-lock permissions in `AndroidManifest.xml`.
- `MainActivity` geolocation `WebChromeClient` handling and the `AmbientNative` bridge.
