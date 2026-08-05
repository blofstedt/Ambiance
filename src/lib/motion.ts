/**
 * @file Fixed-size motion history. Decides "is someone in the room".
 */
/**
 * Fixed-size motion history.
 *
 * WEB-05: the original was
 *
 *   motionHistoryRef.current = [
 *     ...motionHistoryRef.current.slice(-(motionSensitivity - 1)),
 *     telemetry.motion
 *   ];
 *
 * With motionSensitivity === 1 that becomes `slice(-0)`, and -0 is 0 in
 * JavaScript, so slice returns a copy of the ENTIRE array rather than an empty
 * one. The buffer therefore grew without bound for the whole session, and
 * `.every(m => m === true)` could only ever be satisfied if literally every
 * sample since boot had been motion. The Sensitivity=1 preset — the most
 * responsive setting, and the one anyone with a small room would pick — never
 * woke the screen at all.
 *
 * It also ran inside a useEffect keyed on `telemetry.motion`, so it only
 * sampled when the value *changed*, not once per reading. "5 consecutive
 * samples" actually meant "5 consecutive changes", which is a different and
 * much rarer thing.
 */
export class MotionWindow {
  private buffer: boolean[] = [];
  private size: number;

  constructor(size: number) {
    this.size = MotionWindow.clampSize(size);
  }

  private static clampSize(size: number): number {
    if (!Number.isFinite(size)) return 1;
    return Math.max(1, Math.min(20, Math.floor(size)));
  }

  /** Changing sensitivity keeps the most recent samples rather than resetting. */
  resize(size: number): void {
    const next = MotionWindow.clampSize(size);
    if (next === this.size) return;
    this.size = next;
    this.trim();
  }

  private trim(): void {
    if (this.buffer.length > this.size) {
      this.buffer = this.buffer.slice(this.buffer.length - this.size);
    }
  }

  push(value: boolean): void {
    this.buffer.push(value === true);
    this.trim();
  }

  clear(): void {
    this.buffer = [];
  }

  get samples(): number {
    return this.buffer.length;
  }

  get capacity(): number {
    return this.size;
  }

  /** Window is full and every sample is motion. */
  get isSustainedMotion(): boolean {
    return this.buffer.length >= this.size && this.buffer.every((v) => v);
  }

  /** Window is full and every sample is still. */
  get isSustainedStill(): boolean {
    return this.buffer.length >= this.size && this.buffer.every((v) => !v);
  }
}
