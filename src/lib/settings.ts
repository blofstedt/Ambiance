/**
 * @file Every user preference, with safe coercion on load.
 */
import type { ImageSource, OverlayFont, TemperatureUnit } from './types';
import { load, save } from './storage';

/**
 * WEB-15: single source of truth for every user-adjustable value.
 *
 * Previously these were scattered across seven useState calls, of which only
 * four were persisted, using five differently-named localStorage keys and two
 * different serialisation styles. Rebooting the TV reset cycle time, clock
 * visibility, grain, sensitivity and sleep timer every single time.
 */
export interface Settings {
  // Display
  grainIntensity: number;
  showClock: boolean;
  showWeather: boolean;
  overlayFont: OverlayFont;
  temperatureUnit: TemperatureUnit;

  // Media
  imageSource: ImageSource;
  rotationMinutes: number;
  /** Pause automatic rotation and hold the current image. */
  isStatic: boolean;

  // Power & sleep
  powerSafeMinutes: number;
  motionSensitivity: number;
  oledSaverMinutes: number;
  blackModeEnabled: boolean;
  blackModeThreshold: number;
  keepScreenAwake: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  grainIntensity: 45,
  showClock: true,
  showWeather: false,
  overlayFont: 'serif',
  temperatureUnit: 'c',

  imageSource: 'curated',
  rotationMinutes: 10,
  isStatic: false,

  powerSafeMinutes: 2,
  motionSensitivity: 3,
  oledSaverMinutes: 10,
  blackModeEnabled: false,
  blackModeThreshold: 5,
  keepScreenAwake: true,
};

const NUMERIC_BOUNDS: Partial<Record<keyof Settings, [number, number]>> = {
  grainIntensity: [0, 100],
  rotationMinutes: [1, 720],
  powerSafeMinutes: [1, 60],
  // WEB-05: sensitivity must never be below 1. At 0 the ring buffer degenerates.
  motionSensitivity: [1, 20],
  oledSaverMinutes: [1, 720],
  blackModeThreshold: [0, 50],
};

/**
 * Coerces a persisted document back into a valid Settings object. Anything
 * missing, mistyped or out of range falls back to the default rather than
 * poisoning the running app — important because these values come off disk on
 * an appliance no one can easily debug.
 */
export function normaliseSettings(raw: unknown): Settings {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_SETTINGS };

  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    const value = input[key];
    if (value === undefined || value === null) continue;

    const fallback = DEFAULT_SETTINGS[key];

    if (typeof fallback === 'boolean') {
      if (typeof value === 'boolean') (out[key] as boolean) = value;
      continue;
    }

    if (typeof fallback === 'number') {
      const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
      if (!Number.isFinite(n)) continue;
      const bounds = NUMERIC_BOUNDS[key];
      (out[key] as number) = bounds ? Math.min(bounds[1], Math.max(bounds[0], n)) : n;
      continue;
    }

    if (key === 'overlayFont') {
      if (value === 'serif' || value === 'sans' || value === 'mono' || value === 'script') {
        out.overlayFont = value;
      }
      continue;
    }
    if (key === 'imageSource') {
      if (value === 'curated' || value === 'local') out.imageSource = value;
      continue;
    }
    if (key === 'temperatureUnit') {
      if (value === 'c' || value === 'f') out.temperatureUnit = value;
    }
  }

  return out;
}

export function loadSettings(): Settings {
  return normaliseSettings(load<unknown>('settings', {}));
}

export function saveSettings(settings: Settings): void {
  save('settings', settings);
}
