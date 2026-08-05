import { describe, expect, it } from 'vitest';

import { MotionWindow } from '../src/lib/motion';

describe('MotionWindow', () => {
  /**
   * WEB-05 regression. The original implementation used
   * `slice(-(sensitivity - 1))`, and at sensitivity 1 that is `slice(-0)`,
   * which returns the whole array rather than an empty one. The window grew
   * without bound and sustained motion could never be re-established.
   */
  it('treats sensitivity 1 as a single-sample window', () => {
    const window = new MotionWindow(1);

    window.push(true);
    expect(window.isSustainedMotion).toBe(true);

    window.push(false);
    expect(window.isSustainedMotion).toBe(false);
    expect(window.isSustainedStill).toBe(true);

    // The critical case: motion must be detectable again immediately.
    window.push(true);
    expect(window.isSustainedMotion).toBe(true);
  });

  it('never grows beyond its capacity', () => {
    const window = new MotionWindow(3);
    for (let i = 0; i < 500; i += 1) window.push(i % 2 === 0);
    expect(window.samples).toBe(3);
  });

  it('requires a full window before reporting sustained motion', () => {
    const window = new MotionWindow(3);
    window.push(true);
    expect(window.isSustainedMotion).toBe(false);
    window.push(true);
    expect(window.isSustainedMotion).toBe(false);
    window.push(true);
    expect(window.isSustainedMotion).toBe(true);
  });

  it('breaks sustained motion as soon as one still sample arrives', () => {
    const window = new MotionWindow(3);
    window.push(true);
    window.push(true);
    window.push(true);
    window.push(false);
    expect(window.isSustainedMotion).toBe(false);
    expect(window.isSustainedStill).toBe(false);
  });

  it('clamps out-of-range sensitivities instead of degenerating', () => {
    expect(new MotionWindow(0).capacity).toBe(1);
    expect(new MotionWindow(-5).capacity).toBe(1);
    expect(new MotionWindow(Number.NaN).capacity).toBe(1);
    expect(new MotionWindow(9999).capacity).toBe(20);
  });

  it('keeps recent samples when sensitivity is lowered mid-session', () => {
    const window = new MotionWindow(5);
    window.push(false);
    window.push(false);
    window.push(true);
    window.resize(2);
    expect(window.samples).toBe(2);
    expect(window.isSustainedMotion).toBe(false);
  });
});
