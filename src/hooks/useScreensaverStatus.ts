/**
 * @file Tracks whether the TV is actually set to run our screensaver.
 */

import { useCallback, useEffect, useState } from 'react';

import { assignScreensaver, readScreensaverStatus, type ScreensaverStatus } from '../lib/native';

/**
 * AND-17: the app can point the user at the system screensaver picker, but it
 * has no way of knowing whether they actually chose Ambient Canvas — and on
 * TVs that hide third-party screensavers, they cannot. Reading the system
 * setting back is the only honest way to tell them where they stand.
 *
 * The value changes outside this app entirely, so it is re-read whenever the
 * TV hands focus back (returning from the settings screen) and on a slow timer
 * while the settings menu is open. The menu unmounts when closed (WEB-13), so
 * the timer stops with it.
 */
const REFRESH_INTERVAL_MS = 3_000;

export interface UseScreensaverStatusResult extends ScreensaverStatus {
  /** Attempts the direct override. True when the screensaver is now ours. */
  turnOn: () => boolean;
  refresh: () => void;
}

export function useScreensaverStatus(): UseScreensaverStatusResult {
  const [status, setStatus] = useState<ScreensaverStatus>(() => readScreensaverStatus());

  /*
   * The settings menu re-renders on every state change, so the polled value is
   * only committed when something actually differs. Otherwise the whole panel
   * would rebuild every three seconds for a reading that changes perhaps once.
   */
  const refresh = useCallback(() => {
    setStatus((current) => {
      const next = readScreensaverStatus();
      return sameStatus(current, next) ? current : next;
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [refresh]);

  const turnOn = useCallback(() => {
    const ok = assignScreensaver();
    // Re-read rather than trusting the return value: the write can succeed and
    // still be overridden by a device policy we cannot see.
    const next = readScreensaverStatus();
    setStatus((current) => (sameStatus(current, next) ? current : next));
    return ok && next.selected;
  }, []);

  return { ...status, turnOn, refresh };
}

function sameStatus(a: ScreensaverStatus, b: ScreensaverStatus): boolean {
  return (
    a.selected === b.selected &&
    a.known === b.known &&
    a.canAssign === b.canAssign &&
    a.packageName === b.packageName
  );
}
