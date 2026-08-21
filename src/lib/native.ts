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

  /* --- over-the-air updates (see lib/updates.ts and UpdateInstaller.java) --- */
  getVersionName?(): string;
  getVersionCode?(): number;
  /** Begins a background download. Progress is read back via getUpdateStatus. */
  startUpdateDownload?(url: string, sha256: string, versionName: string): void;
  /** JSON-encoded UpdateStatus. Polled while a download is running. */
  getUpdateStatus?(): string;
  /** Hands the verified APK to the system package installer. */
  installDownloadedUpdate?(): void;
  cancelUpdateDownload?(): void;
  /** API 26+: whether this app currently holds the install-packages right. */
  canInstallPackages?(): boolean;
  /** Opens the system screen where that right is granted. */
  openInstallPermissionSettings?(): void;
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

/* ------------------------------------------------------------------ updates */

/**
 * Progress of a native APK download, as reported by UpdateInstaller.
 *
 * This is polled rather than pushed. A JavascriptInterface can only be called
 * FROM the WebView, so pushing would mean evaluateJavascript() from a worker
 * thread, and the states here change a few times a second at most.
 */
export type UpdateDownloadState =
  | 'idle'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'installing'
  | 'error';

export interface UpdateStatus {
  state: UpdateDownloadState;
  /** 0-100. -1 when the server sent no Content-Length. */
  progress: number;
  /** Plain-English failure text, already suitable for the screen. */
  error: string;
  versionName: string;
}

export const IDLE_UPDATE_STATUS: UpdateStatus = {
  state: 'idle',
  progress: 0,
  error: '',
  versionName: '',
};

/** True when this build can actually install an update (i.e. runs on Android). */
export function canSelfUpdate(): boolean {
  const target = bridge();
  return Boolean(target?.startUpdateDownload && target?.getUpdateStatus);
}

/**
 * The running app's own version. Zeros off-device, which callers treat as
 * "updating is not available here" rather than "you are on version 0".
 */
export function installedVersion(): { versionCode: number; versionName: string } {
  const target = bridge();
  try {
    return {
      versionCode: target?.getVersionCode?.() ?? 0,
      versionName: target?.getVersionName?.() ?? '',
    };
  } catch {
    return { versionCode: 0, versionName: '' };
  }
}

export function startUpdateDownload(url: string, sha256: string, versionName: string): void {
  try {
    bridge()?.startUpdateDownload?.(url, sha256, versionName);
  } catch {
    /* no bridge; the UI never offers this off-device */
  }
}

export function readUpdateStatus(): UpdateStatus {
  const target = bridge();
  if (!target?.getUpdateStatus) return IDLE_UPDATE_STATUS;

  try {
    const parsed = JSON.parse(target.getUpdateStatus()) as Partial<UpdateStatus>;
    return {
      state: parsed.state ?? 'idle',
      progress: typeof parsed.progress === 'number' ? parsed.progress : 0,
      error: typeof parsed.error === 'string' ? parsed.error : '',
      versionName: typeof parsed.versionName === 'string' ? parsed.versionName : '',
    };
  } catch {
    return IDLE_UPDATE_STATUS;
  }
}

export function installDownloadedUpdate(): void {
  try {
    bridge()?.installDownloadedUpdate?.();
  } catch {
    /* no bridge */
  }
}

export function cancelUpdateDownload(): void {
  try {
    bridge()?.cancelUpdateDownload?.();
  } catch {
    /* no bridge */
  }
}

/**
 * Android 8+ requires an explicit per-app grant before anything can install a
 * package. Without it the installer closes instantly with no explanation, which
 * on a TV looks exactly like a crash.
 */
export function canInstallPackages(): boolean {
  try {
    return bridge()?.canInstallPackages?.() ?? false;
  } catch {
    return false;
  }
}

export function openInstallPermissionSettings(): void {
  try {
    bridge()?.openInstallPermissionSettings?.();
  } catch {
    /* no bridge */
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
