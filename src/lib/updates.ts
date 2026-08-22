/**
 * @file Over-the-air update logic: version comparison and GitHub release parsing. Pure. No React, no native.
 */
/**
 * Over-the-air updates from GitHub Releases.
 *
 * This file is deliberately pure — no React, no Capacitor, no fetch. It takes
 * the JSON GitHub hands back and turns it into a decision. That is what makes
 * the interesting part (is this build actually newer, and is it safe to
 * install) testable without a TV, a release, or a network.
 *
 * The transport lives in hooks/useAppUpdate.ts and the install itself is native
 * (UpdateInstaller.java), because Android will not let a WebView install an APK.
 *
 * SHAPE OF A RELEASE
 * ------------------
 * .github/workflows/release.yml publishes two assets per release:
 *
 *   ambient-canvas-<version>.apk   the signed APK
 *   update.json                    { versionCode, versionName, apkName, sha256, sizeBytes, notes }
 *
 * update.json is what makes this trustworthy: versionCode is the only value
 * Android actually compares when deciding whether an install is an upgrade, and
 * sha256 lets the device refuse a download that arrived corrupted or altered.
 * Both are written by the workflow from the artifact it just built.
 *
 * A release without update.json still works — buildUpdate() falls back to the
 * tag name — but then the comparison is between version *names* and there is no
 * checksum to verify against, which is why the workflow always writes one.
 */

/** Everything needed to describe, and then perform, one update. */
export interface AvailableUpdate {
  /** Android versionCode. Monotonic; the authoritative comparison. */
  versionCode: number;
  /** Human-readable version, e.g. "1.4.0". */
  versionName: string;
  /** Absolute HTTPS URL of the APK asset. */
  apkUrl: string;
  /** Lowercase hex SHA-256 of the APK, or null when the release omits it. */
  sha256: string | null;
  sizeBytes: number;
  /** Release notes, already trimmed for display. */
  notes: string;
  publishedAt: string;
}

/** What the app knows about itself. Supplied by the native bridge. */
export interface InstalledVersion {
  versionCode: number;
  versionName: string;
}

/** Only these hosts may be contacted for an update, or serve an APK. */
const ALLOWED_HOSTS = new Set(['api.github.com', 'github.com', 'objects.githubusercontent.com']);

/** Refuse anything larger than this outright rather than filling the TV's disk. */
export const MAX_APK_BYTES = 200 * 1024 * 1024;

/**
 * True when `url` is an https URL on a GitHub host we are willing to download
 * an installable binary from.
 *
 * The URLs come out of an API response, so they are attacker-influenced in
 * principle. An APK is the most dangerous thing this app can be persuaded to
 * fetch, so the destination is checked against a list rather than trusted.
 */
export function isTrustedUpdateUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && ALLOWED_HOSTS.has(parsed.hostname);
}

/** A well-formed lowercase or uppercase hex SHA-256 digest. */
export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

/**
 * Splits a version name into numeric parts, ignoring a leading "v" and any
 * trailing pre-release suffix. "v1.10.2-debug" -> [1, 10, 2].
 */
export function versionParts(version: string): number[] {
  const core = version.trim().replace(/^v/i, '').split(/[-+]/)[0] ?? '';
  return core
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

/**
 * Compares two version names numerically, segment by segment.
 * Returns >0 when `a` is newer, <0 when `b` is newer, 0 when equal.
 *
 * Written out rather than using a string compare because "1.10.0" sorts BEFORE
 * "1.9.0" lexically, which would silently stop offering updates the moment a
 * minor version reached double digits.
 */
export function compareVersionNames(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Whether `candidate` should be offered over what is installed.
 *
 * versionCode decides when both sides have a real one, because that is the
 * value Android's package manager itself compares — an install that is not an
 * increment fails on the device no matter what the version name says. The name
 * is the fallback for a release published without update.json.
 */
export function isUpgrade(installed: InstalledVersion, candidate: AvailableUpdate): boolean {
  if (candidate.versionCode > 0 && installed.versionCode > 0) {
    return candidate.versionCode > installed.versionCode;
  }
  return compareVersionNames(candidate.versionName, installed.versionName) > 0;
}

/* -------------------------------------------------------------- API parsing */

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GithubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string;
  assets: ReleaseAsset[];
}

function asAssets(value: unknown): ReleaseAsset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const asset = entry as Record<string, unknown>;
    if (typeof asset.name !== 'string') return [];
    if (typeof asset.browser_download_url !== 'string') return [];
    return [
      {
        name: asset.name,
        browser_download_url: asset.browser_download_url,
        size: typeof asset.size === 'number' ? asset.size : 0,
      },
    ];
  });
}

/** Narrows the /releases/latest payload, discarding anything unusable. */
export function parseRelease(raw: unknown): GithubRelease | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.tag_name !== 'string' || value.tag_name === '') return null;
  if (value.draft === true) return null;

  return {
    tag_name: value.tag_name,
    name: typeof value.name === 'string' ? value.name : null,
    body: typeof value.body === 'string' ? value.body : null,
    draft: false,
    prerelease: value.prerelease === true,
    published_at: typeof value.published_at === 'string' ? value.published_at : '',
    assets: asAssets(value.assets),
  };
}

/** The URL of the release asset named `name`, if the release carries one. */
export function assetUrl(release: GithubRelease, name: string): string | null {
  const asset = release.assets.find((candidate) => candidate.name === name);
  return asset ? asset.browser_download_url : null;
}

/**
 * Whether a failed update-check fetch means "no release published yet" rather
 * than a genuine outage. GitHub answers GET /releases/latest with 404 when a
 * repository has never published a release — the app is not behind, there is
 * simply nothing newer to offer.
 */
export function isMissingRelease(errorMessage: string): boolean {
  return errorMessage === 'HTTP 404';
}

/** The single .apk asset in a release, or null if it has none (or several). */
export function apkAsset(release: GithubRelease): ReleaseAsset | null {
  const apks = release.assets.filter((asset) => asset.name.toLowerCase().endsWith('.apk'));
  return apks.length === 1 ? (apks[0] ?? null) : null;
}

/** Release notes trimmed to something a 3-metre-away reader will actually read. */
export function trimNotes(body: string | null, maxLength = 600): string {
  if (!body) return '';
  const cleaned = body
    .replace(/\r\n/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).trimEnd()}…`;
}

/**
 * Builds an AvailableUpdate from a release plus its update.json manifest.
 * Returns null when the pair does not describe something installable.
 */
export function buildUpdate(release: GithubRelease, manifest: unknown): AvailableUpdate | null {
  const apk = apkAsset(release);
  if (!apk || !isTrustedUpdateUrl(apk.browser_download_url)) return null;
  if (apk.size > MAX_APK_BYTES) return null;

  const meta = (manifest && typeof manifest === 'object' ? manifest : {}) as Record<
    string,
    unknown
  >;

  const versionCode = typeof meta.versionCode === 'number' ? Math.trunc(meta.versionCode) : 0;
  const versionName =
    typeof meta.versionName === 'string' && meta.versionName !== ''
      ? meta.versionName
      : release.tag_name.replace(/^v/i, '');

  if (versionName === '') return null;

  /*
   * A manifest that names a different APK than the release actually carries is
   * a mismatch, not a detail — the two were built at different times. Refuse it
   * rather than installing a binary the checksum was not computed from.
   */
  if (typeof meta.apkName === 'string' && meta.apkName !== '' && meta.apkName !== apk.name) {
    return null;
  }

  return {
    versionCode: versionCode > 0 ? versionCode : 0,
    versionName,
    apkUrl: apk.browser_download_url,
    sha256: isSha256(meta.sha256) ? meta.sha256.toLowerCase() : null,
    sizeBytes: apk.size,
    notes: trimNotes(release.body),
    publishedAt: release.published_at,
  };
}

/** Formats a byte count for the update prompt. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}
