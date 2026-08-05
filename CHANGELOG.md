# Changelog

## 1.0.0 — Production readiness pass (2026-08-05)

Every finding from the audit, in order, with where it was fixed.

Verification performed: `tsc` clean under `strict` + `noUncheckedIndexedAccess`
+ `noUnusedLocals` across all 24 source files; 40 unit tests passing across 13
suites; firmware brace/paren/symbol resolution verified. `npm install`,
`vite build` and `gradlew` could not be executed here because the package
registry was unreachable — see **Not verified** at the end.

---

## P0 — Blocked build or core functionality

| ID | Fix | Where |
| --- | --- | --- |
| **AND-01** | Added the missing `colors.xml`. `styles.xml` referenced `colorPrimary`, `colorPrimaryDark` and `colorAccent`, none of which existed; `aapt2` failed. | `android/.../values/colors.xml` |
| **AND-02** | Raised `minSdkVersion` 24 → 26. Launcher icons existed only in `mipmap-anydpi-v26` with no PNG fallback, so `@mipmap/ic_launcher` was unresolvable on API 24–25. Moved the foreground vector out of `drawable-v24`. | `android/variables.gradle` |
| **AND-03** | Added `postSplashScreenTheme`, `windowSplashScreenBackground` and `windowSplashScreenAnimatedIcon`. The activity previously never left the splash theme. Also rebased `AppTheme` on a DayNight NoActionBar parent so cold start no longer flashes white. | `android/.../values/styles.xml` |
| **WEB-01** | All telemetry now reads `/api/status`. The client polled `/`, which the firmware 302-redirects to the HTML admin page — `res.json()` threw on every poll and connection state was pinned to `lost`. | `src/lib/sensor-utils.ts`, `src/lib/sensor.ts` |
| **WEB-02** | Added credential storage, an `Authorization: Basic` header on every write, and explicit 401 handling that prompts for the password. The client previously sent no credentials at all, so renames queued forever and pairing reported "unreachable". | `src/lib/http.ts`, `src/lib/sensor.ts`, `src/components/SensorPanel.tsx` |
| **WEB-03** | Added handling for HTTP 428. The firmware refuses pair/unpair/reset while the factory password is set; the app now detects this and walks the user through setting a new one. | `src/lib/sensor.ts`, `src/components/SensorPanel.tsx` |
| **FW-01** | Added `server.collectHeaders()`. Without it the ESP32 `WebServer` returns an empty string for `Origin`, `Authorization`, `X-Firmware-Version` and `X-Firmware-SHA256`. This one omission broke CORS **and** made every OTA fail with "invalid or unchanged firmware version". | `firmware/ambient_sensor.ino` |
| **FW-02** | Restructured OTA. Validation and the response now live in the main handler; the upload callback only streams and hashes. Previously the main handler was an empty lambda and responses were sent from inside the per-chunk callback, so the client hung even on success, and auth re-ran on every chunk. | `firmware/ambient_sensor.ino` |
| **FW-03** | Replaced `mbedtls_sha256_*_ret()` with the unsuffixed API behind a version macro. The `_ret` variants do not exist in the mbedTLS bundled with current Arduino-ESP32 — **the firmware did not compile.** | `firmware/ambient_sensor.ino` |
| **BUILD-01** | Documented and scripted `npm run android:prepare`, and added a CI step that runs `cap sync` before Gradle. `settings.gradle` includes `:capacitor-cordova-android-plugins`, which does not exist in a fresh clone. | `package.json`, `.github/workflows/ci.yml`, `android/BINARY_FREE_SETUP.md` |

## P1 — Wrong behaviour

| ID | Fix | Where |
| --- | --- | --- |
| **WEB-04** | Rewrote discovery: mDNS/known-host first, then a bounded sweep of **our own subnet only**, abortable throughout. `sensors` moved to a ref so the effect no longer retriggers itself. The old version swept 8 subnets (2,032 requests) from an effect that its own success path re-fired, producing continuously overlapping full-LAN scans. | `src/lib/discovery.ts`, `src/hooks/useSensorNetwork.ts` |
| **WEB-05** | Replaced the ad-hoc history array with a fixed-size `MotionWindow`. `slice(-(sensitivity - 1))` is `slice(-0)` at sensitivity 1, which returns the **whole array** — the buffer grew unbounded and the most responsive sensitivity setting never woke the screen. Sampling also moved off change-detection onto every reading. | `src/lib/motion.ts` |
| **WEB-06** | The sleep timer ref is now nulled after `clearTimeout`. It was cleared but left truthy, and the scheduling branch was guarded by `!ref.current` — **sleep worked exactly once per app launch.** | `src/hooks/useDisplayState.ts` |
| **WEB-07** | Rotation and arrow-key navigation derive length from the active source. Hardcoding `ARTWORK.length` meant a local folder of any size only ever showed its first five images. | `src/lib/artwork.ts`, `src/hooks/useArtRotation.ts` |
| **WEB-08** | `AnimatePresence` keys on `artwork.url`. Local media hardcoded `id: 999` for every image, so React saw an unchanged key and the crossfade never ran for local albums. | `src/components/ArtworkCanvas.tsx` |
| **WEB-09** | `LocalMediaLibrary` revokes object URLs on replace and unmount. Previously every URL leaked, and blob URLs died on reload while `imageSource: 'local'` persisted — the app rebooted into local mode pointing at dead URLs. | `src/lib/artwork.ts` |
| **WEB-10** | Rewrote weather-code mapping against the WMO 4677 table. The old chain made the thunderstorm branch unreachable — **storms rendered as a snow cloud.** | `src/lib/weather.ts` |
| **WEB-11** | Payload shape is validated before use. `data.current_weather.temperature` was dereferenced unguarded inside an async geolocation callback the enclosing `try` could not reach. | `src/lib/weather.ts`, `src/hooks/useWeather.ts` |
| **WEB-12** | Three guards: EMA smoothing on the raw signal, bucket hysteresis, and auto-apply suspended while the settings menu is open. Lux jitter crossing a bucket edge used to hard-reset the sliders mid-drag. | `src/lib/profile.ts`, `src/hooks/useDisplayState.ts` |
| **WEB-13** | The settings panel unmounts when closed. `opacity-0 pointer-events-none` left it keyboard-focusable, so the D-pad could walk into an invisible menu and the TV appeared frozen. | `src/components/SettingsPanel.tsx` |
| **WEB-14** | Telemetry polls at 1s on a stable interval, `upsertSensor` returns the same object when nothing changed, and persistence is debounced. Previously 4 polls/sec each rewrote state, tearing down and rebuilding the interval and writing to disk 4×/sec. | `src/hooks/useSensorNetwork.ts`, `src/lib/storage.ts` |
| **WEB-15** | One versioned settings document covering all 15 preferences, with coercion and range-clamping on load, plus migration from the old key names. Seven settings were previously never persisted — every reboot reset the appliance. | `src/lib/settings.ts`, `src/lib/storage.ts`, `src/hooks/useSettings.ts` |
| **FW-04** | Sensor reads moved to 250ms with EMA smoothing. `tcs.getRawData()` blocks for the full 50ms integration time and was called every 50ms, starving `server.handleClient()` and making the sensor appear intermittently offline. | `firmware/ambient_sensor.ino` |
| **FW-05** | The pairing SoftAP now uses WPA2 with a MAC-derived key and shuts down on successful pairing. It was previously **open**, exposing every admin endpoint to anyone in radio range. | `firmware/ambient_sensor.ino` |
| **FW-06** | Added `jsonEscape()` on every interpolated value and a strict charset check on `tvId`. A backslash in a device name produced malformed JSON and the sensor appeared permanently offline. | `firmware/ambient_sensor.ino` |
| **AND-04** | Added `WAKE_LOCK` and a user-toggleable `FLAG_KEEP_SCREEN_ON`. An always-on art display was letting the TV sleep. | `AndroidManifest.xml`, `MainActivity.java` |
| **AND-05** | Corrected the package assertion and moved the tests out of the stale `com.getcapacitor.myapp` package. The test asserted `com.getcapacitor.app` and always failed. | `android/app/src/*/java/...` |
| **AND-06** | The dream service now injects a state snapshot via a native bridge, and the web app renders a networking-free `DreamView`. Timers are paused on `onDreamingStopped`. The screensaver previously had no bridge, could not reach the sensor, and rendered hardcoded defaults forever while retrying doomed requests. | `AmbientDreamService.java`, `MainActivity.java`, `src/lib/native.ts`, `src/DreamView.tsx` |

## P2 — Production hardening

| ID | Fix |
| --- | --- |
| **BUILD-02** | R8 + `shrinkResources` on release, env-driven signing config, CI-supplied `versionCode`/`versionName`, debug suffix, and Capacitor/`@JavascriptInterface` keep rules. |
| **BUILD-03** | Removed `@google/genai` and `googleapis` (imported nowhere), removed `dotenv`, de-duplicated `vite`, moved build-only tooling to `devDependencies`, renamed from `react-example`, added `engines`. |
| **BUILD-04** | **Deleted the `define` block that inlined `GEMINI_API_KEY` into the client bundle shipped inside the APK.** It was never read by any source file. |
| **BUILD-05** | `strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, and an `include` list. `TvSlider`'s `any` props are now typed; `NodeJS.Timeout` replaced with `ReturnType<typeof setTimeout>`. |
| **BUILD-06** | Pinned `build.target` to `chrome87`/`es2020` for older TV WebViews, added `manualChunks` and sourcemaps, and set `base: './'` so the screensaver can load assets over `file://`. |
| **BUILD-07** | Added ESLint (with `react-hooks/exhaustive-deps` as an **error**), Prettier, a three-job CI pipeline, `LICENSE`, `PRIVACY.md`, a rewritten README, and removed `metadata.json`. |
| **WEB-16** | Bundled artwork (3 SVG pieces) and locally generated `feTurbulence` grain/paper textures; fonts moved to system stacks. Every visual asset was previously remote, so a TV with no WAN rendered a black screen. Dead-image detection added. |
| **WEB-17** | Replaced `alert`/`confirm` with an in-app `Dialog` with focus trapping, focus restore and D-pad key handling. `no-alert` is now a lint error. |
| **WEB-18** | Telemetry seeds to zero and connection state is explicit. The UI showed a plausible fake reading whether or not a sensor existed. |
| **WEB-19** | Settings panel is a bounded, scrollable container (`.tv-scroll`). |
| **WEB-20** | Added an `ErrorBoundary` with a visible message and a 15-second auto-reload. |
| **AND-07** | `androidScheme: 'https'`, `cleartext: false`, `allowNavigation: []`, `allowMixedContent: false`. Sensor traffic moved to native HTTP so the WebView no longer needs to be permissive. |
| **AND-08** | Cleartext restricted to RFC1918 ranges plus `.local`; removed the redundant app-wide `usesCleartextTraffic` that was overriding the per-domain rules. |
| **FW-07** | Admin password stored as salted SHA-256 with constant-time comparison and automatic migration off the old plaintext value. Basic auth is now verified manually. |
| **FW-08** | Explicit forward declarations for all 20 handlers, replacing reliance on Arduino's auto-prototype generation. |
| **FW-09** | `esp_ota_mark_app_valid_cancel_rollback()` now runs only after 15s uptime **and** confirmed Wi-Fi. Calling it unconditionally at boot made rollback protection meaningless. |

## P3 — Polish

| ID | Fix |
| --- | --- |
| **WEB-21** | Removed dead `powerSafeAction`; gave `isStatic` a real control; dropped 8 unused icon imports. |
| **WEB-22** | TV type scale via `clamp()` design tokens. The old UI had 10.5px uppercase text on a 1080p panel. |
| **WEB-23** | Focus rings on every control, ARIA slider semantics, `aria-pressed` on toggles, labels on inputs, initial focus on open. |
| **WEB-24** | `clamp()` sizing so the layout survives non-16:9 viewports. |
| **WEB-25** | Added a °C/°F toggle. |
| **WEB-26** | `parseInt` radix fixed; all settings coerced through `normaliseSettings`. |
| **AND-09** | Removed the unused `activity_main.xml` and the unused launcher-background vector. |
| **INFRA-01** | Added `PRIVACY.md` covering the location permission, and documented the Play Store banner requirement. |

---

## Decisions taken

These were the six open questions in the audit; I proceeded on the recommended
option in each case.

1. **Native HTTP + mDNS-first discovery** — adopted. `CapacitorHttp`'s global
   fetch patch is left **disabled**; `src/lib/http.ts` calls the explicit API for
   sensor traffic only, so weather and artwork stay on standard `fetch` and other
   plugins' file handling is unaffected.
2. **`minSdkVersion` 26** — adopted, keeping the repo binary-free.
3. **Firmware in scope** — yes. Four findings there were P0/P1 and two prevented
   compilation.
4. **Bundled artwork** — I generated three original SVG pieces rather than wait
   on assets. Replace them with your own by editing `BUNDLED_ARTWORK`.
5. **Local album persistence** — deferred. Blob URLs are now correctly revoked
   and no longer resurrect dead references on reload, but copying files into app
   storage via Capacitor Filesystem is a feature, not a bug fix. See below.
6. **Scope** — all four phases completed.

## Not verified here

- `npm ci`, `vite build` and `gradlew` never ran: the package registry was
  unreachable in this environment. Typechecking was performed against local
  stub declarations, which validates our source but not the real dependency
  surface. **Run `npm run verify` before trusting the build.**
- The firmware was checked structurally, not compiled. The CI `firmware` job now
  compiles it on every push, which is how FW-03 should have been caught.
- No ESP32 was in the loop. FW-01, FW-02 and FW-05 need a real device to confirm.

## Known follow-ups

- **Local albums do not survive a reboot.** Correctly handled now rather than
  silently broken, but persisting them needs Capacitor Filesystem or a USB/SMB
  source.
- **mDNS is hostname-probing, not true service browsing.** `discovery.ts`
  isolates this behind one function so a native NSD plugin can be dropped in
  without touching callers.
- **Google TV store submission** still needs a 320×180 banner PNG in the listing.

---

## 1.1.0 — AI-readability and structural pass

No behaviour changes. Typecheck clean, 40/40 tests passing before and after.

### Design system centralised

- **109 hardcoded brand hex values** (`#D4CDA4` and friends) replaced with the
  semantic Tailwind utilities generated from the `@theme` tokens that already
  existed but were not being used. Changing the accent colour is now a one-line
  edit in `index.css` instead of 55 scattered replacements.
- `src/lib/theme.ts` added for the handful of places that need a raw colour in
  JavaScript (slider thumbs).
- `src/components/ui/styles.ts` added. `SettingsPanel` and `SensorPanel` each
  carried their own near-identical `buttonClass` / `fieldClass` / `chipBase` /
  `toggleBase`, so the two halves of the same menu could drift apart. One
  definition each now, used everywhere.
- Verbose `text-[length:var(--text-tv-xs)]` (used 40 times) replaced with a
  `text-tv-xs` utility.

### File splits

| Before | After |
| --- | --- |
| `SettingsPanel.tsx` (528) | shell (115) + `settings/DisplaySection` (180) + `MediaSection` (140) + `PowerSection` (158) |
| `SensorPanel.tsx` (439) | panel (331) + `sensor/SensorListItem` (126) + `sensor/TelemetryReadout` (57) |
| `useSensorNetwork.ts` (465) | composition (323) + `useSensorDiscovery` (85) + `useSensorTelemetry` (99) + `lib/sensor-store` (89) |
| `App.tsx` (380) | root (260) + `useTvInput` (167) + `useDreamPublisher` (33) |

Largest file is now 331 lines, down from 528. Every split follows a boundary
that already existed in the code.

### Dead code removed

- `describeWeather()`, `storage.remove()`, `native.isNativeHost()` — exported,
  never called. Verified by usage count, not by eye: a first-pass scan flagged
  29 "unused" exports, 26 of which were type definitions in active use.

### AI navigation

- `CLAUDE.md` routing map expanded from 18 to 27 rows to cover the new files.
- Added a "three files that control almost everything" design table.
- All 40 file paths referenced in `CLAUDE.md` verified to resolve.
- `@file` orientation headers on all 39 source files.
