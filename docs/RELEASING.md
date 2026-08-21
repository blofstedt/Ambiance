# Releasing an update to the TV

Ambient Canvas updates itself. You publish a release on GitHub, and every
television running the app offers the new version under
**Adjust Settings → Software Update**. Nothing needs to be plugged in.

This page is the whole process. Do the one-time setup once, then step 2 is all
you ever repeat.

---

## 1. One-time setup: the signing key

Android will only accept an update that is signed with **the same key** as the
version already installed. If that key changes, the TV refuses the update and
the only way forward is uninstalling the app — which loses every setting and
every paired sensor.

So: create this key once, back it up, and never replace it.

**Step 1.** On your computer, in a terminal, run this. Replace
`choose-a-password` with a password you record somewhere safe.

```bash
keytool -genkeypair -v \
  -keystore ambient-canvas.keystore \
  -alias ambient \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass choose-a-password \
  -keypass choose-a-password \
  -dname "CN=Ambient Canvas, O=Ambient Canvas, C=GB"
```

**Step 2.** Back up `ambient-canvas.keystore` somewhere that is not this
computer and not this repository. A password manager attachment is ideal.
Losing it ends the update channel for every TV already out there.

**Step 3.** Turn it into text so GitHub can store it:

```bash
base64 -w0 ambient-canvas.keystore > keystore.txt
```

**Step 4.** In the repository on github.com, go to
**Settings → Secrets and variables → Actions → New repository secret** and add
these four:

| Name | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the entire contents of `keystore.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | the password you chose |
| `ANDROID_KEY_ALIAS` | `ambient` |
| `ANDROID_KEY_PASSWORD` | the password you chose |

**Step 5.** Delete `keystore.txt` from your computer. Keep the `.keystore` file
in your backup.

The repository is configured to refuse to commit either file, but delete it
anyway.

---

## 2. Publishing a version

Two ways, both fine.

**From the GitHub website:** open the **Actions** tab, choose **Release** in the
left-hand list, press **Run workflow**, type the version number (for example
`1.4.0`) and press the green button.

**From a terminal:**

```bash
git tag v1.4.0
git push origin v1.4.0
```

Either way the build takes about ten minutes. When it finishes there is a new
release on the repository's Releases page with two files attached.

Televisions check once a day, so most will pick it up within 24 hours. To see it
straight away on a particular TV: **Adjust Settings → Software Update → Check
now**.

### Version numbers

Use plain dotted numbers — `1.4.0`, `2.0.0`. The workflow rejects anything else,
because Android does.

You never set a build number. The workflow uses GitHub's own run counter, which
only ever goes up. That is the number the TV actually compares.

---

## 3. What the TV does with it

Worth knowing, because it explains the failure messages.

1. Once a day the app asks GitHub for the newest release.
2. It reads `update.json` from that release: the build number, the version name,
   the APK's name and its SHA-256 checksum.
3. If the build number is higher than the one running, the update is offered.
   Nothing downloads until someone presses **Download**.
4. The download happens natively, straight from GitHub over HTTPS. Every
   redirect is re-checked against a list of GitHub hosts, so an APK can never be
   fetched from anywhere else.
5. The downloaded file is hashed and compared to the checksum in `update.json`.
   A mismatch deletes the file and reports that the download did not arrive
   intact — it is never installed.
6. Android's own installer then asks the user to confirm. The app cannot install
   anything silently, by design.

The first time, Android will also ask for permission to install apps from
Ambient Canvas. The settings screen explains this and offers a button that goes
straight to the right place.

---

## 4. When something goes wrong

**"An unsigned APK cannot be installed as an update"** — the four secrets in
step 1 are missing or misspelled. Check them in repository settings.

**The build fails at "Confirm the APK is actually signed"** — the keystore
password or alias is wrong. The alias is whatever you passed to `-alias`.

**A TV says "This is the latest version" after a release** — its build number is
already at or above the new one. This happens if a release was published from a
re-run with a lower run number. Publish again; the counter will have moved on.

**A TV never offers anything** — it only checks once a day and 45 seconds after
starting up. Use **Check now**. If that says it cannot reach the update server,
the TV has no internet.

**A TV says the update did not arrive intact** — the download was corrupted or
interrupted. Press **Download** again. It is refusing to install a file that
does not match what you published, which is the behaviour you want.

---

## 5. Things that are deliberately not automatic

- **The app never installs without being asked.** It offers; a person confirms.
  An appliance that silently restarts itself into new software is not something
  to inflict on a living room.
- **Debug APKs are not part of this.** They install as a separate app
  (`...overlay.debug`) and are never offered updates. Use the **Sideload APK**
  workflow for those.
- **Downgrades are impossible.** Android rejects an install with a lower build
  number. To pull a bad release, publish a new one with the fix.
