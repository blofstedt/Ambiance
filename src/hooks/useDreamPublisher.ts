/**
 * @file Publishes a state snapshot for the screensaver to render.
 */

import { useEffect, useRef } from 'react';

import { publishDreamState, type DreamState } from '../lib/native';

const PUBLISH_INTERVAL_MS = 30_000;

/**
 * AND-06: the screensaver (AmbientDreamService) runs a WebView with no
 * Capacitor bridge, on a file:// origin, so it shares no localStorage with the
 * app and cannot reach the sensor. It previously rendered hardcoded defaults
 * forever while retrying requests that could never succeed.
 *
 * The main activity pushes a snapshot through the native bridge; the dream
 * reads it back on load. Published on change and on a slow timer, so a long
 * idle period still leaves the screensaver with something recent.
 */
export function useDreamPublisher(state: DreamState): void {
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    publishDreamState(stateRef.current);
  }, [state]);

  useEffect(() => {
    const timer = setInterval(() => publishDreamState(stateRef.current), PUBLISH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
}
