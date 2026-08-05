/**
 * @file Sensor transport. ALL sensor HTTP goes through here (native, bypasses CORS).
 */
/**
 * Sensor HTTP transport.
 *
 * WEB-02 / FW-01: sensor traffic is plaintext HTTP to a LAN address, issued
 * from an https WebView origin. That combination is blocked twice over by the
 * browser — once by mixed-content rules and once by CORS. The firmware's
 * Origin-echo logic could never satisfy CORS either, because it only emits
 * Access-Control-Allow-Origin when the request Origin string contains the
 * sensor's own IP or hostname, which is never true of a WebView origin.
 *
 * CapacitorHttp issues requests through native libraries, which are outside the
 * browser security model entirely, so neither restriction applies.
 *
 * The plugin's global fetch/XHR patch is deliberately left disabled (see
 * capacitor.config.ts) because it interferes with other plugins' file handling.
 * We call the explicit API here and leave the rest of the app on standard
 * fetch. On desktop/dev builds this transparently falls back to fetch.
 */

import { CapacitorHttp, Capacitor } from '@capacitor/core';
import type { SensorCredentials } from './types';

export interface HttpResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  credentials?: SensorCredentials | null;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT = 2500;

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** RFC 7617 Basic credentials. btoa is fine here: sensor passwords are ASCII. */
function basicAuthHeader(credentials: SensorCredentials): string {
  const raw = `${credentials.user}:${credentials.password}`;
  try {
    return `Basic ${btoa(raw)}`;
  } catch {
    // Non-Latin1 password. Encode via UTF-8 bytes.
    const bytes = new TextEncoder().encode(raw);
    let binary = '';
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return `Basic ${btoa(binary)}`;
  }
}

function buildHeaders(options: RequestOptions): Record<string, string> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.credentials) headers['Authorization'] = basicAuthHeader(options.credentials);
  return headers;
}

function parseBody<T>(data: unknown): T | null {
  if (data === null || data === undefined) return null;
  if (typeof data === 'string') {
    if (data.trim() === '') return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }
  return data as T;
}

async function viaNative<T>(url: string, options: RequestOptions): Promise<HttpResult<T>> {
  const response = await CapacitorHttp.request({
    url,
    method: options.method ?? 'GET',
    headers: buildHeaders(options),
    data: options.body,
    connectTimeout: options.timeoutMs ?? DEFAULT_TIMEOUT,
    readTimeout: options.timeoutMs ?? DEFAULT_TIMEOUT,
    // The firmware never sets cookies; skip the cookie jar entirely.
    disableRedirects: false,
  });

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    data: parseBody<T>(response.data),
  };
}

async function viaFetch<T>(url: string, options: RequestOptions): Promise<HttpResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT);

  // Honour an externally supplied signal as well as our own timeout.
  const external = options.signal;
  const onExternalAbort = () => controller.abort();
  external?.addEventListener('abort', onExternalAbort);

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: buildHeaders(options),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      // The firmware is stateless; never send credentials implicitly.
      credentials: 'omit',
      cache: 'no-store',
    });

    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      data: parseBody<T>(text),
    };
  } finally {
    clearTimeout(timeout);
    external?.removeEventListener('abort', onExternalAbort);
  }
}

export async function sensorRequest<T = unknown>(
  url: string,
  options: RequestOptions = {},
): Promise<HttpResult<T>> {
  try {
    return isNative() ? await viaNative<T>(url, options) : await viaFetch<T>(url, options);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : 'network error',
    };
  }
}
