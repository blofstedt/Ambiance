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

---

## 1.2.0 — Review pass, and updates over the air (2026-08-21)

Verification performed in a real environment this time: `npm ci`, `npm run
verify` (typecheck, lint, 62 tests across 6 suites, Vite build) all green. The
Android and firmware builds still run only in CI — see **Not verified** below.

### P0 — The verify pipeline could not run at all

Everything below was red before this pass, which means every gate downstream of
it had never executed on anything.

| ID | Fix | Where |
| --- | --- | --- |
| **BUILD-08** | Regenerated `package-lock.json`. It was out of sync with `package.json`, so `npm ci` aborted with "Missing: balanced-match@1.0.2 from lock file" — and `npm ci` is the first step of all three CI jobs, so **nothing in CI had run since the lockfile drifted**. | `package-lock.json` |
| **BUILD-09** | Moved the `"//"` comment out of `compilerOptions`. TypeScript rejects unknown compiler options outright (TS5023), so `npm run typecheck` failed on the config before reading a line of source. | `tsconfig.json` |
| **BUILD-10** | Turned `no-undef` off for TypeScript files. `globals` was a hand-written list of ~20 browser names, and every DOM type the code actually uses — `File`, `KeyboardEvent`, `HTMLElement`, `AbortSignal`, `URLSearchParams`, `React` — was absent from it, so lint failed with 33 errors. Maintaining a shadow copy of `lib.dom.d.ts` by hand is not the fix; `tsc` already performs this check against the real thing, which is what typescript-eslint's own documentation recommends. | `eslint.config.js` |

### P1 — Wrong behaviour

| ID | Fix | Where |
| --- | --- | --- |
| **AND-10** | Rewrote the cleartext policy. AND-08 expressed the private ranges as CIDR blocks (`192.168.0.0/16` and two others), but Android's `<domain>` element has no concept of a range — it matches a hostname or a single literal IP, so those entries matched nothing that has ever existed. Cleartext was denied to every sensor on a private address, and since CapacitorHttp goes through `HttpURLConnection` it is bound by exactly this policy: **every sensor read would have failed on-device while working perfectly in dev.** The ranges cannot be enumerated, so the policy is inverted — cleartext by default, with each remote host the app contacts pinned to HTTPS individually. | `network_security_config.xml` |
| **WEB-27** | `useSettings`' flush effect depended on `[settings]` and called `saveSettings()` from its own cleanup. React runs a cleanup before every re-run, so each tick of a slider drag forced a synchronous whole-document `localStorage` write — of the *previous* value, since the cleanup closes over its own render. That is exactly what the 400ms debounce immediately above it exists to prevent, and it undid it completely. | `src/hooks/useSettings.ts` |
| **WEB-28** | `debouncedSave()` added a `pagehide` and a `visibilitychange` listener on every call and had no way to remove either — the second via an inline arrow, so no caller could have removed it even by trying. One module-level pair now, plus a writer that can be disposed. This is the leak class CLAUDE.md §5 exists to prevent: invisible on a laptop, a crash on an appliance left up for weeks. | `src/lib/storage.ts`, `src/hooks/useSensorNetwork.ts` |
| **WEB-29** | The native HTTP path ignored `AbortSignal` entirely. On the TV — the only platform that takes it — cancelling a discovery scan therefore did nothing at all, meaning **the AbortController that WEB-04's fix is built on only ever worked in the browser**. A rescan left up to 254 probes in flight to land on state that had already moved on. | `src/lib/http.ts` |
| **WEB-30** | Nothing but sensor motion could reset the OLED saver timer. With no sensor paired, or one that had dropped off the network, there was no signal that could: the clock and weather faded to 20% a few minutes after launch and stayed there for good, and pressing keys on the remote did not bring them back. Remote input now counts as presence, throttled to once per 10s. | `src/hooks/useDisplayState.ts` |

### P2 — Polish

- `useConstant` added. `useRef(new Thing())` evaluates its argument on every
  render and discards all but the first result; it was holding both EMA filters,
  the motion ring buffer and the media library, in components that re-render
  once a second for the life of the app.
- The two genuine `react-hooks/exhaustive-deps` errors fixed at the source
  rather than silenced, per CLAUDE.md §6. Both were member expressions
  (`artwork?.url`, `art.current?.url`) that the rule cannot verify, hoisted to
  locals. In `App.tsx` obeying the rule literally would have republished the
  screensaver snapshot on every render.
- `detectLocalAddress()` no longer raises an unhandled rejection when
  `createOffer()` fails, and returns immediately instead of making the caller
  wait out the full timeout for a `null` it could have had at once.
- Removed `metadata.json`, an AI Studio leftover referenced by nothing.
  BUILD-07 recorded it as deleted; it was not.

### Over the air updates

| ID | What |
| --- | --- |
| **AND-11** | The app updates itself from GitHub Releases. `release.yml` builds a signed APK and publishes it alongside an `update.json` manifest; the TV checks daily, compares `versionCode`, verifies the SHA-256 and hands the file to Android's own installer. |

Split so the risky parts are the testable parts:

- `src/lib/updates.ts` — pure, no React, no native, no fetch. Version
  comparison and release parsing, including the two refusals that matter: an
  APK served from a host we did not publish to, and a manifest describing a
  different build than the release actually carries. 22 tests.
- `src/hooks/useAppUpdate.ts` — the check (45s after boot, then daily) and a
  status poll that only runs while a download does.
- `UpdateInstaller.java` — the work Android will not let a WebView do. Re-checks
  host and scheme at **every redirect hop**, because GitHub redirects release
  assets to object storage and an open redirect would otherwise walk straight
  past the allowlist. Caps the write so a server lying about `Content-Length`
  cannot fill the TV's disk. Deletes rather than installs an APK whose digest
  does not match.
- `release.yml` — refuses to build without signing secrets and verifies the
  finished APK with `apksigner`. An unsigned release installs exactly once and
  can then never be updated, which is worse than a failed build.

`versionCode` comes from `github.run_number`, which only ever increases. It is
the value Android's package manager itself compares, so a name-derived scheme
would let a release install on some televisions and silently fail on others.

Nothing installs unattended. The app offers, Android's installer asks, a person
confirms.

**Signing key discipline is now load-bearing.** Every release must be signed
with the same key or televisions will refuse the update and the only way
forward is an uninstall, losing every setting and paired sensor. `docs/RELEASING.md`
covers the setup.

### Housekeeping

- **BUILD-11** — `format:check` existed as a script but nothing ever ran it, so
  14 files had drifted out of Prettier style. Formatted, and the check joined
  `npm run verify` and CI so it cannot drift again.

- The **Sideload APK** workflow was a step-for-step duplicate of `ci.yml`'s
  android job running on every push, so each push paid for two identical Gradle
  builds. It is manual-only now. It also still passed `GEMINI_API_KEY` into the
  build — nothing has read that key since BUILD-04 removed the `define` that
  inlined it — and carried two `sed` commands that rewrote `AndroidManifest.xml`
  in place. The manifest has had all three of those tags since AND-02, so the
  greps guarding them never fired.

### CI could not run either (found once CI finally executed)

Fixing the lockfile let CI reach the two jobs that had never actually run. Both
were broken, and neither had anything to do with the code they were meant to
gate.

| ID | Fix | Where |
| --- | --- | --- |
| **BUILD-12** | The firmware job installed arduino-cli with `sh -s -- -b /usr/local/bin`, borrowing a flag convention from other Go installers that `install.sh` does not have. Its first positional argument is the **version tag**, so `-b` became the version and the script requested `arduino-cli_-b_Linux_64bit.tar.gz`, which 404s — "Failed to install arduino-cli". The install directory comes from the `BINDIR` environment variable, and `/usr/local/bin` was ignored throughout: the script reported "Installing in $PWD/bin" every time. Fixed, and the step now runs `arduino-cli version` so a broken install fails immediately rather than three steps later. | `.github/workflows/ci.yml` |
| **BUILD-13** | Every workflow pinned Node 20. The Capacitor 8 CLI requires `>=22.0.0` and refuses to start below it, so the Android job died at `cap sync` with "The Capacitor CLI requires NodeJS >=22.0.0" — before Gradle was ever invoked. All four pins raised to 22. `engines.node` said `>=20.19.0`, understating the real floor, which is what let the wrong pin look correct. | `.github/workflows/*.yml`, `package.json`, `README.md` |

### Not verified here

- The Android build and the firmware compile still run only in CI. `UpdateInstaller.java`
  is new and has not executed on a device; the download, checksum and install
  path needs one real release to confirm end to end.
- `npm audit` reports 11 advisories, all in dev-only transitive dependencies
  (babel, esbuild, postcss, tar). None reach the APK. Left alone rather than
  forcing majors in the same pass as a behaviour audit.
