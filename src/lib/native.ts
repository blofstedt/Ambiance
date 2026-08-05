/**
 * @file Bridge to Android. No-ops safely in a plain browser.
 */
/**
 * Thin wrapper over the AmbientNative JavascriptInterface added in
 * MainActivity. Every method degrades to a no-op in a plain browser so the app
 * runs identically during development.
 */

import type { Telemetry } from './types';

interface AmbientNativeBridge {
  saveDreamState(json: string): void;
  setKeepAwake(enabled: boolean): void;
  isNativeHost(): boolean;
}

declare global {
  interface Window {
    AmbientNative?: AmbientNativeBridge;
    /** Injected by AmbientDreamService.injectDreamState before the app boots. */
    __AMBIENT_DREAM_STATE__?: DreamState;
    __AMBIENT_DREAM_STATE_AT__?: number;
  }
}

/** The snapshot the screensaver renders from. */
export interface DreamState {
  telemetry: Telemetry;
  luminance: number;
  warmth: number;
  grainIntensity: number;
  showClock: boolean;
  showWeather: boolean;
  overlayFont: string;
  temperatureUnit: string;
  weatherTemp: number | null;
  weatherCode: number;
  weatherLocation: string;
  artworkUrl: string | null;
  artworkTitle: string | null;
}

function bridge(): AmbientNativeBridge | null {
  if (typeof window === 'undefined') return null;
  return window.AmbientNative ?? null;
}

/**
 * AND-06: the dream WebView has no Capacitor bridge, cannot reach the sensor,
 * and runs on a file:// origin so it shares no localStorage with the app. It
 * previously rendered the hardcoded default telemetry forever. The main
 * activity pushes a snapshot here; the dream reads it back on load.
 */
export function publishDreamState(state: DreamState): void {
  const target = bridge();
  if (!target) return;
  try {
    target.saveDreamState(JSON.stringify(state));
  } catch {
    /* bridge unavailable; nothing to do */
  }
}

/** AND-04: honours the "Keep Screen Awake" setting. */
export function setKeepAwake(enabled: boolean): void {
  try {
    bridge()?.setKeepAwake(enabled);
  } catch {
    /* no-op off-device */
  }
}

/** True when running inside AmbientDreamService rather than the main activity. */
export function isDreamMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('dream') === '1';
  } catch {
    return false;
  }
}

export function readInjectedDreamState(): DreamState | null {
  if (typeof window === 'undefined') return null;
  return window.__AMBIENT_DREAM_STATE__ ?? null;
}

/** Age of the injected snapshot, used to avoid presenting stale data as live. */
export function dreamStateAgeMs(): number | null {
  const at = typeof window === 'undefined' ? undefined : window.__AMBIENT_DREAM_STATE_AT__;
  if (typeof at !== 'number' || at <= 0) return null;
  return Math.max(0, Date.now() - at);
}
