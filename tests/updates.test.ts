/**
 * Over-the-air update logic.
 *
 * These are the checks standing between the TV and an APK it downloads from the
 * internet and installs on itself, so they are tested against the failure
 * shapes that matter: a version that only looks newer, an asset on a host we
 * did not publish to, and a manifest that describes a different build than the
 * release actually contains.
 */
import { describe, expect, it } from 'vitest';

import {
  buildUpdate,
  compareVersionNames,
  formatBytes,
  isMissingRelease,
  isSha256,
  isTrustedUpdateUrl,
  isUpgrade,
  parseRelease,
  trimNotes,
  versionParts,
  type AvailableUpdate,
} from '../src/lib/updates';

const DIGEST = 'a'.repeat(64);

function release(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'v1.4.0',
    name: 'Ambient Canvas 1.4.0',
    body: 'Fixed the crossfade.',
    draft: false,
    prerelease: false,
    published_at: '2026-01-01T00:00:00Z',
    assets: [
      {
        name: 'ambient-canvas-1.4.0.apk',
        browser_download_url:
          'https://github.com/blofstedt/Ambiance/releases/download/v1.4.0/ambient-canvas-1.4.0.apk',
        size: 8 * 1024 * 1024,
      },
      {
        name: 'update.json',
        browser_download_url:
          'https://github.com/blofstedt/Ambiance/releases/download/v1.4.0/update.json',
        size: 200,
      },
    ],
    ...overrides,
  };
}

const MANIFEST = {
  versionCode: 42,
  versionName: '1.4.0',
  apkName: 'ambient-canvas-1.4.0.apk',
  sha256: DIGEST,
};

describe('versionParts', () => {
  it('ignores a leading v and any pre-release suffix', () => {
    expect(versionParts('v1.10.2-debug')).toEqual([1, 10, 2]);
    expect(versionParts('2.0')).toEqual([2, 0]);
  });

  it('treats non-numeric segments as zero rather than NaN', () => {
    expect(versionParts('1.x.3')).toEqual([1, 0, 3]);
  });
});

describe('compareVersionNames', () => {
  it('compares numerically, not lexically', () => {
    // The whole reason this function exists: "1.10.0" < "1.9.0" as strings.
    expect(compareVersionNames('1.10.0', '1.9.0')).toBeGreaterThan(0);
  });

  it('treats missing trailing segments as zero', () => {
    expect(compareVersionNames('1.4', '1.4.0')).toBe(0);
    expect(compareVersionNames('1.4.1', '1.4')).toBeGreaterThan(0);
  });
});

describe('isUpgrade', () => {
  const candidate = (over: Partial<AvailableUpdate> = {}): AvailableUpdate => ({
    versionCode: 42,
    versionName: '1.4.0',
    apkUrl: 'https://github.com/x/y/releases/download/v1.4.0/a.apk',
    sha256: DIGEST,
    sizeBytes: 1,
    notes: '',
    publishedAt: '',
    ...over,
  });

  it('prefers versionCode, which is what Android itself compares', () => {
    const installed = { versionCode: 41, versionName: '9.9.9' };
    expect(isUpgrade(installed, candidate())).toBe(true);
  });

  it('refuses an equal or lower versionCode', () => {
    expect(isUpgrade({ versionCode: 42, versionName: '1.0.0' }, candidate())).toBe(false);
    expect(isUpgrade({ versionCode: 43, versionName: '1.0.0' }, candidate())).toBe(false);
  });

  it('falls back to the version name when either code is unknown', () => {
    const installed = { versionCode: 0, versionName: '1.3.9' };
    expect(isUpgrade(installed, candidate({ versionCode: 0 }))).toBe(true);
    expect(isUpgrade({ versionCode: 0, versionName: '1.4.0' }, candidate({ versionCode: 0 }))).toBe(
      false,
    );
  });
});

describe('isTrustedUpdateUrl', () => {
  it('accepts GitHub release download hosts over https', () => {
    expect(isTrustedUpdateUrl('https://github.com/o/r/releases/download/v1/a.apk')).toBe(true);
    expect(isTrustedUpdateUrl('https://objects.githubusercontent.com/x')).toBe(true);
  });

  it('rejects plaintext, other hosts and lookalike domains', () => {
    expect(isTrustedUpdateUrl('http://github.com/o/r/a.apk')).toBe(false);
    expect(isTrustedUpdateUrl('https://example.com/a.apk')).toBe(false);
    expect(isTrustedUpdateUrl('https://github.com.evil.test/a.apk')).toBe(false);
    expect(isTrustedUpdateUrl('not a url')).toBe(false);
  });
});

describe('isSha256', () => {
  it('accepts 64 hex characters and nothing else', () => {
    expect(isSha256(DIGEST)).toBe(true);
    expect(isSha256(DIGEST.toUpperCase())).toBe(true);
    expect(isSha256(`${DIGEST}0`)).toBe(false);
    expect(isSha256('zz')).toBe(false);
    expect(isSha256(42)).toBe(false);
  });
});

describe('parseRelease', () => {
  it('narrows a well-formed payload', () => {
    const parsed = parseRelease(release());
    expect(parsed?.tag_name).toBe('v1.4.0');
    expect(parsed?.assets).toHaveLength(2);
  });

  it('rejects drafts and payloads with no tag', () => {
    expect(parseRelease(release({ draft: true }))).toBeNull();
    expect(parseRelease(release({ tag_name: '' }))).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });

  it('drops malformed assets instead of failing the whole release', () => {
    const parsed = parseRelease(release({ assets: [{ name: 'no-url.apk' }, 7, null] }));
    expect(parsed?.assets).toEqual([]);
  });
});

describe('buildUpdate', () => {
  it('combines the release and its manifest', () => {
    const update = buildUpdate(parseRelease(release())!, MANIFEST);
    expect(update).toMatchObject({
      versionCode: 42,
      versionName: '1.4.0',
      sha256: DIGEST,
      sizeBytes: 8 * 1024 * 1024,
    });
  });

  it('falls back to the tag name when there is no manifest', () => {
    const update = buildUpdate(parseRelease(release())!, null);
    expect(update?.versionName).toBe('1.4.0');
    expect(update?.versionCode).toBe(0);
    expect(update?.sha256).toBeNull();
  });

  it('refuses a manifest describing a different APK than the release carries', () => {
    const update = buildUpdate(parseRelease(release())!, {
      ...MANIFEST,
      apkName: 'ambient-canvas-1.3.0.apk',
    });
    expect(update).toBeNull();
  });

  it('refuses a release with no APK, or with more than one', () => {
    expect(buildUpdate(parseRelease(release({ assets: [] }))!, MANIFEST)).toBeNull();

    const two = release();
    two.assets.push({ ...two.assets[0]!, name: 'other.apk' });
    expect(buildUpdate(parseRelease(two)!, MANIFEST)).toBeNull();
  });

  it('refuses an APK served from somewhere we did not publish it', () => {
    const evil = release();
    evil.assets[0]!.browser_download_url = 'https://evil.test/ambient-canvas-1.4.0.apk';
    expect(buildUpdate(parseRelease(evil)!, MANIFEST)).toBeNull();
  });

  it('refuses an implausibly large download', () => {
    const huge = release();
    huge.assets[0]!.size = 500 * 1024 * 1024;
    expect(buildUpdate(parseRelease(huge)!, MANIFEST)).toBeNull();
  });

  it('ignores a malformed checksum rather than trusting it', () => {
    const update = buildUpdate(parseRelease(release())!, { ...MANIFEST, sha256: 'nope' });
    expect(update?.sha256).toBeNull();
  });
});

describe('trimNotes', () => {
  it('strips HTML comments and truncates', () => {
    expect(trimNotes('<!-- hidden -->Visible')).toBe('Visible');
    expect(trimNotes('x'.repeat(700))).toHaveLength(601);
    expect(trimNotes(null)).toBe('');
  });
});

describe('isMissingRelease', () => {
  it('treats GitHub 404 as "no release yet", not an outage', () => {
    expect(isMissingRelease('HTTP 404')).toBe(true);
  });

  it('does not classify other failures as a missing release', () => {
    expect(isMissingRelease('HTTP 500')).toBe(false);
    expect(isMissingRelease('Failed to fetch')).toBe(false);
    expect(isMissingRelease('')).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formats megabytes at a sensible precision', () => {
    expect(formatBytes(8 * 1024 * 1024)).toBe('8.0 MB');
    expect(formatBytes(42 * 1024 * 1024)).toBe('42 MB');
    expect(formatBytes(0)).toBe('');
  });
});
