/**
 * @file Versioned, debounced localStorage with an in-memory fallback.
 */
/**
 * Namespaced, versioned, write-debounced persistence.
 *
 * WEB-14: the old code called localStorage.setItem on every telemetry poll —
 * four synchronous writes per second, each serialising the whole sensor map, on
 * the main thread of a TV box. Writes are now coalesced.
 *
 * WEB-15: rotationInterval, showClock, grainIntensity, motionSensitivity,
 * powerSafeMinutes, imageSource and isStatic were never persisted at all, so a
 * wall-powered appliance reset itself to defaults on every reboot. All settings
 * now live in one versioned document.
 */

const PREFIX = 'ambient.v3.';
const SCHEMA_VERSION = 3;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

function available(): boolean {
  try {
    const probe = '__ambient_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    // Private mode, disabled storage, or a locked-down TV WebView.
    return false;
  }
}

const STORAGE_OK = typeof window !== 'undefined' && available();

/** In-memory mirror so the app still works when localStorage is unavailable. */
const memory = new Map<string, string>();

function readRaw(key: string): string | null {
  if (!STORAGE_OK) return memory.get(key) ?? null;
  return window.localStorage.getItem(key);
}

function writeRaw(key: string, value: string): void {
  if (!STORAGE_OK) {
    memory.set(key, value);
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Quota exceeded. Degrade to memory rather than throwing mid-render.
    memory.set(key, value);
  }
}

export function load<T>(key: string, fallback: T): T {
  return safeParse<T>(readRaw(PREFIX + key), fallback);
}

export function save<T>(key: string, value: T): void {
  writeRaw(PREFIX + key, JSON.stringify(value));
}

/**
 * Every live debouncedSave writer, flushed together when the WebView suspends.
 *
 * WEB-28: debouncedSave() used to add its own 'pagehide' and 'visibilitychange'
 * listeners on every call and had no way to remove them. Each writer leaked two
 * permanent listeners plus its captured closure, and the visibilitychange one
 * was added with an inline arrow so it could never have been removed even by a
 * caller that tried. On an appliance that stays up for weeks — with React
 * StrictMode double-mounting in development — that grows without bound.
 *
 * One pair of listeners for the whole module, and a writer that can be
 * released, fixes both.
 */
const flushers = new Set<() => void>();

function flushAll(): void {
  for (const flush of flushers) flush();
}

if (typeof window !== 'undefined') {
  // Never lose the last write when the TV suspends the WebView.
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
}

/** A debounced writer plus the handles needed to flush or dispose of it. */
export interface DebouncedWriter<T> {
  (value: T): void;
  /** Write any pending value immediately. */
  flush: () => void;
  /** Stop the timer and unregister from the suspend hooks. */
  dispose: () => void;
}

/**
 * Returns a setter that writes at most once per `waitMs`, with a trailing
 * flush. Used for anything driven by the telemetry loop.
 */
export function debouncedSave<T>(key: string, waitMs = 10_000): DebouncedWriter<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;
  let hasPending = false;

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (hasPending) {
      save(key, pending as T);
      hasPending = false;
      pending = null;
    }
  };

  const write = ((value: T) => {
    pending = value;
    hasPending = true;
    if (timer === null) timer = setTimeout(flush, waitMs);
  }) as DebouncedWriter<T>;

  write.flush = flush;
  write.dispose = () => {
    flush();
    flushers.delete(flush);
  };

  flushers.add(flush);
  return write;
}

/**
 * One-time migration off the old flat, unversioned key names so existing
 * installs keep their paired sensor, learned profiles and TV identity.
 */
const LEGACY_KEYS: Record<string, string> = {
  ambient_sensors_v2: 'sensors',
  ambient_pending_renames_v1: 'pendingRenames',
  selected_sensor_id_v2: 'selectedSensorId',
  ambient_tv_id_v1: 'tvId',
  canvas_profiles: 'profiles',
};

const LEGACY_SETTINGS: Record<string, string> = {
  ambient_oled_saver_minutes_v1: 'oledSaverMinutes',
  ambient_black_mode_v1: 'blackModeEnabled',
  ambient_black_mode_threshold_v1: 'blackModeThreshold',
  ambient_show_weather_v1: 'showWeather',
  ambient_overlay_font_v1: 'overlayFont',
};

export function migrateLegacyStorage(): void {
  if (!STORAGE_OK) return;
  if (load<number>('schemaVersion', 0) >= SCHEMA_VERSION) return;

  for (const [oldKey, newKey] of Object.entries(LEGACY_KEYS)) {
    const raw = window.localStorage.getItem(oldKey);
    if (raw === null) continue;
    // Old values were a mix of JSON and bare strings.
    const parsed = safeParse<unknown>(raw, raw);
    save(newKey, parsed);
  }

  const legacySettings: Record<string, unknown> = {};
  for (const [oldKey, newKey] of Object.entries(LEGACY_SETTINGS)) {
    const raw = window.localStorage.getItem(oldKey);
    if (raw === null) continue;
    if (raw === 'true' || raw === 'false') {
      legacySettings[newKey] = raw === 'true';
    } else {
      // WEB-26: the old code called parseInt without a radix.
      const n = Number.parseInt(raw, 10);
      legacySettings[newKey] = Number.isNaN(n) ? raw : n;
    }
  }
  if (Object.keys(legacySettings).length > 0) {
    save('settings', { ...load<object>('settings', {}), ...legacySettings });
  }

  save('schemaVersion', SCHEMA_VERSION);
}
