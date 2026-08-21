/**
 * @file Maps room light -> picture brightness/warmth, with smoothing and hysteresis.
 */
/**
 * Ambient light -> picture profile mapping.
 *
 * WEB-12: profiles are keyed on a bucket of (lux, Kelvin). The sensor polls
 * several times a second and its raw lux reading jitters by a few units even in
 * a still room. Every time the jitter crossed a 20-lux bucket boundary, the
 * effect re-ran and hard-reset the brightness and warmth sliders — including
 * while the user was actively dragging one. The slider visibly snapped back.
 *
 * Two fixes here, plus a third in the hook:
 *   1. Smooth the raw signal with an EMA before bucketing.
 *   2. Require the smoothed value to move past the bucket edge by a margin
 *      before switching buckets (hysteresis).
 *   3. The hook suspends auto-apply entirely while the settings menu is open.
 */

import type { RoomProfile } from './types';

export const LUX_BUCKET_SIZE = 20;
export const TEMP_BUCKET_SIZE = 500;

/** Fraction of a bucket the signal must overshoot before the bucket changes. */
const HYSTERESIS = 0.25;

/** Exponential moving average. alpha closer to 0 = smoother, slower. */
export class Ema {
  private value: number | null = null;
  private readonly alpha: number;

  /*
   * Written as an explicit field rather than a TypeScript parameter property.
   * Parameter properties emit runtime code, so they are not erasable syntax and
   * break any type-stripping-only runtime (Node's --experimental-strip-types,
   * and TypeScript's own --erasableSyntaxOnly). Keeping the whole lib/ tree
   * erasable means these modules can be unit-tested without a bundler.
   */
  constructor(alpha: number) {
    this.alpha = alpha;
  }

  push(sample: number): number {
    if (!Number.isFinite(sample)) return this.value ?? 0;
    this.value = this.value === null ? sample : this.alpha * sample + (1 - this.alpha) * this.value;
    return this.value;
  }

  get current(): number {
    return this.value ?? 0;
  }

  reset(): void {
    this.value = null;
  }
}

export function bucketIndex(value: number, size: number): number {
  return Math.floor(Math.max(0, value) / size);
}

/**
 * Returns the bucket index to use, keeping `previous` unless the value has
 * moved decisively into a new bucket.
 */
export function bucketWithHysteresis(value: number, size: number, previous: number | null): number {
  const raw = bucketIndex(value, size);
  if (previous === null || raw === previous) return raw;

  const margin = size * HYSTERESIS;
  const previousLower = previous * size;
  const previousUpper = previousLower + size;

  // Moving up: must clear the top edge by the margin.
  if (raw > previous && value < previousUpper + margin) return previous;
  // Moving down: must fall below the bottom edge by the margin.
  if (raw < previous && value > previousLower - margin) return previous;

  return raw;
}

export function bucketKey(luxBucket: number, tempBucket: number): string {
  return `${luxBucket * LUX_BUCKET_SIZE}_${tempBucket * TEMP_BUCKET_SIZE}`;
}

export function clampLuminance(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function clampWarmth(value: number): number {
  return Math.min(500, Math.max(-500, Math.round(value)));
}

/**
 * The built-in fallback curve used until the user teaches the app a profile for
 * this lighting condition by adjusting the sliders.
 */
export function innateProfile(lux: number, kelvin: number): RoomProfile {
  let luminance = 60;
  let warmth = 200;

  if (lux < 5) {
    luminance = 25;
    warmth = 450;
  } else if (lux < 20) {
    luminance = 40;
    warmth = 350;
  } else if (lux > 150) {
    luminance = 90;
    warmth = 50;
  }

  // Kelvin of 0 means "too dark to measure"; don't treat it as ice-cold light.
  if (kelvin > 0 && kelvin < 2500) warmth += 100;
  if (kelvin > 4000) warmth -= 100;

  return {
    luminance: clampLuminance(luminance),
    warmth: clampWarmth(warmth),
  };
}
