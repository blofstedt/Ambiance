/**
 * @file Owns the discovery scan lifecycle: start, abort, retry.
 */

import { useEffect, useRef } from 'react';

import { detectLocalAddress, discoverSensors } from '../lib/discovery';
import type { ConnectionState, SensorInfo } from '../lib/types';

const RETRY_DISCOVERY_MS = 30_000;

export interface UseSensorDiscoveryOptions {
  isScanning: boolean;
  /** Read through a ref by the caller so this hook never depends on the map. */
  knownSensors: () => SensorInfo[];
  hasSelection: boolean;
  connection: ConnectionState;
  onFound: (sensor: SensorInfo) => void;
  onSettled: (found: boolean) => void;
  onRetry: () => void;
}

/**
 * WEB-04: the original discovery effect listed `[isScanning, sensors,
 * selectedSensorId]` as dependencies and then called `saveSensors()` from
 * inside its own success path — so finding a sensor mutated `sensors`, which
 * re-fired the effect, which scanned again. The 250ms telemetry poll wrote to
 * the same state and re-fired it too. The result was continuous, overlapping
 * 2,032-request LAN sweeps for the entire life of the session.
 *
 * The fix has two parts: the caller passes `knownSensors` as a getter backed by
 * a ref (so the map is never a dependency), and every scan runs under an
 * AbortController so a rescan or unmount cancels in-flight probes rather than
 * letting them land on stale state.
 */
export function useSensorDiscovery(options: UseSensorDiscoveryOptions): void {
  const { isScanning, knownSensors, hasSelection, connection, onFound, onSettled, onRetry } =
    options;

  // Callbacks are held in refs so identity changes cannot restart a live scan.
  const onFoundRef = useRef(onFound);
  onFoundRef.current = onFound;
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const knownRef = useRef(knownSensors);
  knownRef.current = knownSensors;

  useEffect(() => {
    if (!isScanning) return;

    const controller = new AbortController();

    const run = async () => {
      const localAddress = (await detectLocalAddress()) ?? undefined;
      if (controller.signal.aborted) return;

      const found = await discoverSensors({
        known: knownRef.current(),
        signal: controller.signal,
        localAddress,
        onFound: (sensor) => onFoundRef.current(sensor),
      });

      if (controller.signal.aborted) return;
      onSettledRef.current(found);
    };

    void run();

    return () => controller.abort();
  }, [isScanning]);

  // Retry periodically while nothing is connected.
  useEffect(() => {
    if (isScanning) return;
    if (hasSelection && connection === 'connected') return;

    const timer = setTimeout(onRetry, RETRY_DISCOVERY_MS);
    return () => clearTimeout(timer);
  }, [isScanning, hasSelection, connection, onRetry]);
}
