/**
 * @file Loading, validating and persisting saved sensors. No React.
 */

import { load, save } from './storage';
import type { SensorInfo, Telemetry } from './types';

/**
 * WEB-18: telemetry used to be seeded with `{lux:15, temp:2800, motion:true}`,
 * so the UI showed a plausible live reading whether or not a sensor existed.
 * Zeros plus an explicit connection state let the UI be honest.
 */
export const EMPTY_TELEMETRY: Telemetry = { lux: 0, temp: 0, motion: false };

/**
 * Rebuilds the saved sensor map, discarding anything malformed.
 *
 * This data comes off disk on an appliance nobody can easily debug, and a
 * single corrupt entry used to be enough to break rendering.
 */
export function loadSensorMap(): Record<string, SensorInfo> {
  const raw = load<Record<string, Partial<SensorInfo>>>('sensors', {});
  const out: Record<string, SensorInfo> = {};

  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') continue;
    out[id] = {
      id,
      name: typeof value.name === 'string' ? value.name : 'Unknown Sensor',
      ip: typeof value.ip === 'string' ? value.ip : '',
      lastSeen: typeof value.lastSeen === 'number' ? value.lastSeen : 0,
      ...(typeof value.hostname === 'string' ? { hostname: value.hostname } : {}),
      ...(typeof value.pairedTvId === 'string' ? { pairedTvId: value.pairedTvId } : {}),
      ...(typeof value.firmwareVersion === 'string'
        ? { firmwareVersion: value.firmwareVersion }
        : {}),
      ...(typeof value.passwordNeedsChange === 'boolean'
        ? { passwordNeedsChange: value.passwordNeedsChange }
        : {}),
    };
  }
  return out;
}

/** Stable identity for this TV, generated once and reused forever. */
export function stableTvId(): string {
  const existing = load<string>('tvId', '');
  if (existing) return existing;

  const generated =
    globalThis.crypto?.randomUUID?.() ??
    `tv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  save('tvId', generated);
  return generated;
}

/**
 * True when an incoming reading carries nothing new.
 *
 * WEB-14: the telemetry poll wrote to state on every successful read. Because
 * `sensors` was an effect dependency, that tore down and rebuilt the polling
 * interval once a second and triggered a fresh render each time. Bailing out on
 * a no-op update is what stops the cycle.
 */
export function isSameSensor(a: SensorInfo | undefined, b: SensorInfo): boolean {
  if (!a) return false;
  return (
    a.name === b.name &&
    a.ip === b.ip &&
    a.hostname === b.hostname &&
    a.pairedTvId === b.pairedTvId &&
    a.passwordNeedsChange === b.passwordNeedsChange
  );
}

/** Merges an incoming reading over a cached entry without losing known-good data. */
export function mergeSensor(existing: SensorInfo | undefined, incoming: SensorInfo): SensorInfo {
  return {
    ...existing,
    ...incoming,
    // A probe by hostname yields no IP; never clobber a good cached address.
    ip: incoming.ip || existing?.ip || '',
    hostname: incoming.hostname ?? existing?.hostname,
  };
}
