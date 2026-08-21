import { afterEach, describe, expect, it } from 'vitest';

import { readScreensaverStatus, UNKNOWN_SCREENSAVER_STATUS } from '../src/lib/native';

/*
 * AND-17: the screensaver status crosses a JavascriptInterface as a JSON
 * string, so every field arrives untyped. A malformed reply must degrade to
 * "cannot tell" rather than claiming the screensaver is on — reporting
 * `selected` wrongly is the one failure that leaves the user with a TV that
 * never shows the artwork and a settings screen insisting it will.
 */
type BridgeStub = { getScreensaverStatus: () => string };

function stubBridge(reply: string | (() => never) | undefined): void {
  const host = window as unknown as { AmbientNative?: BridgeStub };
  if (reply === undefined) {
    delete host.AmbientNative;
    return;
  }
  host.AmbientNative = {
    getScreensaverStatus: typeof reply === 'function' ? reply : () => reply,
  };
}

afterEach(() => stubBridge(undefined));

describe('readScreensaverStatus', () => {
  it('reports "cannot tell" off-device, where there is no bridge at all', () => {
    expect(readScreensaverStatus()).toEqual(UNKNOWN_SCREENSAVER_STATUS);
  });

  it('reads a well-formed status', () => {
    stubBridge(
      JSON.stringify({
        selected: true,
        known: true,
        canAssign: true,
        packageName: 'com.ambient.canvas.overlay',
      }),
    );
    expect(readScreensaverStatus()).toEqual({
      selected: true,
      known: true,
      canAssign: true,
      packageName: 'com.ambient.canvas.overlay',
    });
  });

  it("keeps the debug build's own package name, which carries a suffix", () => {
    stubBridge(JSON.stringify({ packageName: 'com.ambient.canvas.overlay.debug' }));
    expect(readScreensaverStatus().packageName).toBe('com.ambient.canvas.overlay.debug');
  });

  it('never reports selected on a truthy non-boolean', () => {
    stubBridge(JSON.stringify({ selected: 'yes', canAssign: 1, known: 'true' }));
    expect(readScreensaverStatus()).toEqual({
      selected: false,
      known: false,
      canAssign: false,
      packageName: '',
    });
  });

  it('falls back when the reply is not JSON', () => {
    stubBridge('not json at all');
    expect(readScreensaverStatus()).toEqual(UNKNOWN_SCREENSAVER_STATUS);
  });

  it('falls back when the bridge itself throws', () => {
    stubBridge(() => {
      throw new Error('interface unavailable');
    });
    expect(readScreensaverStatus()).toEqual(UNKNOWN_SCREENSAVER_STATUS);
  });
});
