/**
 * @file Owns persisted preferences.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../lib/settings';
import { setKeepAwake } from '../lib/native';

export interface UseSettingsResult {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

/**
 * WEB-15: one hook owning every persisted preference, replacing seven ad-hoc
 * useState + useEffect(localStorage.setItem) pairs of which three were never
 * written at all.
 */
export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * WEB-27: the flush effect below used to list `[settings]` as its dependency
   * and call saveSettings() from its own cleanup. React runs the cleanup before
   * every re-run, so each keystroke of a slider drag triggered a synchronous,
   * whole-document localStorage write — of the PREVIOUS value, because the
   * cleanup closes over the render it was created in. That is precisely the
   * behaviour the 400ms debounce above exists to prevent, and it undid it
   * completely: dozens of blocking main-thread writes per second on a TV box.
   *
   * The latest value lives in a ref instead, so the listener and the unmount
   * flush both read current state while the effect itself runs exactly once.
   */
  const latest = useRef(settings);
  latest.current = settings;

  // Coalesce writes; slider drags fire dozens of updates per second.
  useEffect(() => {
    if (writeTimer.current !== null) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      saveSettings(latest.current);
      writeTimer.current = null;
    }, 400);

    return () => {
      if (writeTimer.current !== null) {
        clearTimeout(writeTimer.current);
        writeTimer.current = null;
      }
    };
  }, [settings]);

  // Flush on teardown so the last change is never lost.
  useEffect(() => {
    const flush = () => saveSettings(latest.current);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  // AND-04: mirror the keep-awake preference into the native window flag.
  useEffect(() => {
    setKeepAwake(settings.keepScreenAwake);
  }, [settings.keepScreenAwake]);

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((previous) => (previous[key] === value ? previous : { ...previous, [key]: value }));
  }, []);

  const reset = useCallback(() => setSettings({ ...DEFAULT_SETTINGS }), []);

  return { settings, set, reset };
}
