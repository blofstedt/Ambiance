/**
 * @file Finds sensors on the LAN. Known hosts first, then a bounded own-subnet sweep.
 */
/**
 * Sensor discovery.
 *
 * WEB-04: the old scanNetwork() swept eight hardcoded /24 subnets — 2,032 HTTP
 * requests per run. Worse, it lived in a useEffect whose dependency array
 * included `sensors`, and its own success path called saveSensors(), which
 * mutated `sensors` and re-triggered the effect. The 250ms telemetry poll also
 * wrote to `sensors` on every successful read. The result was overlapping
 * full-LAN sweeps firing continuously for as long as the app was open, which
 * saturates a TV box's network stack and looks like a port scan to any router
 * with intrusion detection.
 *
 * Strategy now, cheapest-first:
 *   1. Re-probe sensors we already know (0-3 requests).
 *   2. mDNS — the firmware already advertises _http._tcp with id/name/paired
 *      TXT records via MDNS.addServiceTxt(). This was implemented on the device
 *      and never used by the app.
 *   3. Sweep only the subnet this TV is actually on, bounded and abortable.
 *   4. Manual IP entry, always available.
 */

import { probeTarget } from './sensor';
import { sensorFromStatus, subnetOf } from './sensor-utils';
import type { SensorInfo } from './types';

export interface DiscoveryOptions {
  known: SensorInfo[];
  signal: AbortSignal;
  onFound: (sensor: SensorInfo) => void;
  /** Dotted-quad of this device on the LAN, when known. */
  localAddress?: string | undefined;
  /** Hard ceiling on the number of hosts probed in the sweep phase. */
  maxSweepHosts?: number;
}

export { subnetOf };

const SWEEP_CONCURRENCY = 16;
const SWEEP_TIMEOUT_MS = 700;

/** Common consumer-router defaults, used only when we cannot detect our own subnet. */
const FALLBACK_SUBNETS = ['192.168.1', '192.168.0', '10.0.0'];

/**
 * mDNS resolution.
 *
 * Capacitor has no first-party mDNS plugin, so this resolves the hostname
 * pattern the firmware registers (`ambient-<mac>.local`) for sensors we have
 * seen before, and otherwise defers to the sweep. A dedicated NSD plugin can be
 * dropped in behind this function without touching callers.
 */
async function probeKnownHostnames(
  known: SensorInfo[],
  signal: AbortSignal,
  onFound: (sensor: SensorInfo) => void,
): Promise<boolean> {
  let found = false;

  await Promise.all(
    known.map(async (sensor) => {
      if (signal.aborted) return;
      const candidates = [
        sensor.hostname ? `${sensor.hostname.replace(/\.local$/, '')}.local` : null,
        sensor.ip || null,
      ].filter((v): v is string => v !== null);

      for (const target of candidates) {
        if (signal.aborted) return;
        const result = await probeTarget(target, 1500, signal);
        if (result) {
          onFound(sensorFromStatus(result.status, result.target));
          found = true;
          return;
        }
      }
    }),
  );

  return found;
}

async function sweepSubnet(
  subnet: string,
  signal: AbortSignal,
  onFound: (sensor: SensorInfo) => void,
  budget: { remaining: number },
): Promise<boolean> {
  let found = false;
  const hosts: number[] = [];
  for (let i = 1; i <= 254; i += 1) hosts.push(i);

  for (let index = 0; index < hosts.length; index += SWEEP_CONCURRENCY) {
    if (signal.aborted || budget.remaining <= 0) break;

    const batch = hosts.slice(index, index + SWEEP_CONCURRENCY);
    budget.remaining -= batch.length;

    const results = await Promise.all(
      batch.map((host) => probeTarget(`${subnet}.${host}`, SWEEP_TIMEOUT_MS, signal)),
    );

    for (const result of results) {
      if (!result) continue;
      onFound(sensorFromStatus(result.status, result.target));
      found = true;
    }

    // Stop early: a household has one sensor per room, not 254.
    if (found) break;
  }

  return found;
}

/**
 * Runs a full discovery pass. Resolves to true if at least one sensor answered.
 * Always honours `signal`, so a rescan or unmount cancels in-flight probes
 * instead of leaving them to land on stale state.
 */
export async function discoverSensors(options: DiscoveryOptions): Promise<boolean> {
  const { known, signal, onFound, localAddress, maxSweepHosts = 254 } = options;

  if (signal.aborted) return false;

  // 1 + 2: known devices by hostname then cached IP.
  if (known.length > 0) {
    const found = await probeKnownHostnames(known, signal, onFound);
    if (found || signal.aborted) return found;
  }

  // 3: bounded sweep of our own subnet only.
  const budget = { remaining: maxSweepHosts };
  const ownSubnet = localAddress ? subnetOf(localAddress) : null;
  const knownSubnets = known
    .map((sensor) => (sensor.ip ? subnetOf(sensor.ip) : null))
    .filter((value): value is string => value !== null);

  const candidates = [
    ...new Set([ownSubnet, ...knownSubnets, ...(ownSubnet ? [] : FALLBACK_SUBNETS)]),
  ].filter((value): value is string => value !== null);

  for (const subnet of candidates) {
    if (signal.aborted || budget.remaining <= 0) break;
    const found = await sweepSubnet(subnet, signal, onFound, budget);
    if (found) return true;
  }

  return false;
}

/**
 * Best-effort discovery of this device's own LAN address via WebRTC ICE
 * candidates, so the sweep targets the right subnet instead of guessing.
 * Returns null on platforms that hide host candidates (mDNS-obfuscated ICE),
 * in which case the caller falls back to FALLBACK_SUBNETS.
 */
export async function detectLocalAddress(timeoutMs = 1200): Promise<string | null> {
  if (typeof RTCPeerConnection === 'undefined') return null;

  return new Promise<string | null>((resolve) => {
    let settled = false;
    let pc: RTCPeerConnection | null = null;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      try {
        pc?.close();
      } catch {
        /* already closed */
      }
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    try {
      pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('ambient');
      pc.onicecandidate = (event) => {
        const candidate = event.candidate?.candidate;
        if (!candidate) return;
        const match = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/.exec(candidate);
        const ip = match?.[1];
        if (!ip) return;
        // Ignore loopback and the 0.0.0.0 placeholder.
        if (ip.startsWith('127.') || ip === '0.0.0.0') return;
        clearTimeout(timer);
        finish(ip);
      };
      /*
       * A bare `.then()` here left the rejection unhandled: a WebView that
       * refuses to create an offer (no network interface at boot, a locked-down
       * TV build) raised an unhandled promise rejection and then made the caller
       * wait out the full timeout for a null it could have had immediately.
       */
      pc.createOffer()
        .then((offer) => pc?.setLocalDescription(offer))
        .catch(() => {
          clearTimeout(timer);
          finish(null);
        });
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}
