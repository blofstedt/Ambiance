import { describe, expect, it } from 'vitest';

import {
  Ema,
  LUX_BUCKET_SIZE,
  bucketWithHysteresis,
  clampWarmth,
  innateProfile,
} from '../src/lib/profile';

describe('bucketWithHysteresis', () => {
  /**
   * WEB-12 regression. Raw lux jitter around a bucket boundary used to flip the
   * bucket on every sample, and each flip hard-reset the brightness and warmth
   * sliders from the stored profile - including while the user was dragging.
   */
  it('does not change bucket on jitter around a boundary', () => {
    let bucket = bucketWithHysteresis(19.6, LUX_BUCKET_SIZE, null);
    expect(bucket).toBe(0);

    // 20.4 is technically bucket 1, but only just over the edge.
    bucket = bucketWithHysteresis(20.4, LUX_BUCKET_SIZE, bucket);
    expect(bucket).toBe(0);

    bucket = bucketWithHysteresis(19.8, LUX_BUCKET_SIZE, bucket);
    expect(bucket).toBe(0);
  });

  it('does change bucket on a decisive move', () => {
    const bucket = bucketWithHysteresis(31, LUX_BUCKET_SIZE, 0);
    expect(bucket).toBe(1);
  });

  it('is symmetric when the level falls', () => {
    let bucket = bucketWithHysteresis(45, LUX_BUCKET_SIZE, null);
    expect(bucket).toBe(2);
    bucket = bucketWithHysteresis(39.5, LUX_BUCKET_SIZE, bucket);
    expect(bucket).toBe(2);
    bucket = bucketWithHysteresis(33, LUX_BUCKET_SIZE, bucket);
    expect(bucket).toBe(1);
  });
});

describe('Ema', () => {
  it('smooths a noisy signal toward its mean', () => {
    const ema = new Ema(0.2);
    for (let i = 0; i < 200; i += 1) ema.push(i % 2 === 0 ? 48 : 52);
    expect(ema.current).toBeGreaterThan(49);
    expect(ema.current).toBeLessThan(51);
  });

  it('ignores non-finite samples', () => {
    const ema = new Ema(0.5);
    ema.push(10);
    ema.push(Number.NaN);
    expect(ema.current).toBe(10);
  });
});

describe('innateProfile', () => {
  it('is dark and warm in a dark room', () => {
    const profile = innateProfile(2, 2200);
    expect(profile.luminance).toBeLessThanOrEqual(30);
    expect(profile.warmth).toBeGreaterThan(400);
  });

  it('is bright and neutral in a bright room', () => {
    const profile = innateProfile(400, 5200);
    expect(profile.luminance).toBeGreaterThanOrEqual(85);
    expect(profile.warmth).toBeLessThan(100);
  });

  it('does not treat an unmeasurable 0K reading as cold light', () => {
    // Firmware reports temp 0 when lux <= 1, meaning "unknown", not "0 Kelvin".
    const withZero = innateProfile(1, 0);
    const withWarm = innateProfile(1, 2600);
    expect(withZero.warmth).toBe(withWarm.warmth);
  });

  it('always returns in-range values', () => {
    for (const lux of [0, 3, 19, 100, 5000]) {
      for (const k of [0, 1800, 3000, 6500]) {
        const profile = innateProfile(lux, k);
        expect(profile.luminance).toBeGreaterThanOrEqual(0);
        expect(profile.luminance).toBeLessThanOrEqual(100);
        expect(profile.warmth).toBeGreaterThanOrEqual(-500);
        expect(profile.warmth).toBeLessThanOrEqual(500);
      }
    }
  });
});

describe('clampWarmth', () => {
  it('bounds the bipolar scale', () => {
    expect(clampWarmth(9999)).toBe(500);
    expect(clampWarmth(-9999)).toBe(-500);
  });
});
