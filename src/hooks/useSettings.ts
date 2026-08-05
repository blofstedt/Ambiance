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

  // Coalesce writes; slider drags fire dozens of updates per second.
  useEffect(() => {
    if (writeTimer.current !== null) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      saveSettings(settings);
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
    const flush = () => saveSettings(settings);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [settings]);

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
