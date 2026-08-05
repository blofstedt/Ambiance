/**
 * @file Weather fetch, WMO code -> icon mapping, unit formatting.
 */
/**
 * Weather via Open-Meteo, with reverse geocoding via BigDataCloud.
 */

import type { TemperatureUnit } from './types';

export type WeatherIconName =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunderstorm';

/**
 * WEB-10: the previous mapping was a chain of range checks that mis-sorted the
 * WMO code table:
 *
 *   if (code < 70 || (code >= 80 && code <= 82)) return rain;
 *   if (code < 80 || code >= 85)                 return snow;   // <-- bug
 *   return thunderstorm;
 *
 * Codes 95-99 are thunderstorms, but they satisfy `code >= 85`, so the snow
 * branch caught them first and the thunderstorm branch was unreachable for
 * every real code. Storms displayed a snow cloud. Code 3 (overcast) also fell
 * into the "partly cloudy" branch, and the fog range swallowed drizzle.
 *
 * Replaced with an explicit lookup over the actual WMO 4677 table.
 */
export function weatherIconFor(code: number): WeatherIconName {
  if (!Number.isFinite(code)) return 'cloudy';

  // 0 clear, 1 mainly clear, 2 partly cloudy, 3 overcast
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly-cloudy';
  if (code === 3) return 'cloudy';

  // 45, 48 fog
  if (code === 45 || code === 48) return 'fog';

  // 51-57 drizzle (incl. freezing drizzle)
  if (code >= 51 && code <= 57) return 'drizzle';

  // 61-67 rain, 80-82 rain showers
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 80 && code <= 82) return 'rain';

  // 71-77 snow, 85-86 snow showers
  if (code >= 71 && code <= 77) return 'snow';
  if (code === 85 || code === 86) return 'snow';

  // 95, 96, 99 thunderstorm
  if (code >= 95) return 'thunderstorm';

  return 'cloudy';
}

/** WEB-25: the display was hardcoded to Celsius with no way to change it. */
export function formatTemperature(celsius: number | null, unit: TemperatureUnit): string {
  if (celsius === null || !Number.isFinite(celsius)) return unit === 'f' ? '--°F' : '--°C';
  if (unit === 'f') return `${Math.round((celsius * 9) / 5 + 32)}°F`;
  return `${Math.round(celsius)}°C`;
}

export function shortLocationName(
  city?: string,
  subdivision?: string,
  countryCode?: string,
): string {
  const primary = (city ?? '').trim();
  const secondary = (subdivision ?? countryCode ?? '').trim();
  const full = [primary, secondary].filter(Boolean).join(', ');
  if (!full) return 'Unknown Location';
  if (full.length <= 22) return full;
  return `${full.slice(0, 21).trimEnd()}…`;
}

export interface WeatherReading {
  temperatureC: number;
  code: number;
  location: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export function getCurrentPosition(timeoutMs = 8000): Promise<Coordinates | null> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 300_000 },
    );
  });
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * WEB-11: the old code did
 *   setWeatherTemp(Math.round(data.current_weather.temperature));
 * with no guard, inside an async geolocation success callback. Any malformed or
 * rate-limited response threw a TypeError that no try/catch could reach —
 * the surrounding try only wrapped the synchronous call to getCurrentPosition.
 * It surfaced as an unhandled rejection and the overlay silently froze on stale
 * data.
 */
export async function fetchWeather(coords: Coordinates): Promise<WeatherReading | null> {
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}` +
    `&longitude=${coords.longitude}&current_weather=true&temperature_unit=celsius`;

  const payload = await fetchJson(weatherUrl, 8000);
  if (!payload || typeof payload !== 'object') return null;

  const current = (payload as { current_weather?: unknown }).current_weather;
  if (!current || typeof current !== 'object') return null;

  const { temperature, weathercode } = current as Record<string, unknown>;
  if (typeof temperature !== 'number' || !Number.isFinite(temperature)) return null;

  const location = await reverseGeocode(coords);

  return {
    temperatureC: temperature,
    code: typeof weathercode === 'number' ? weathercode : 0,
    location,
  };
}

async function reverseGeocode(coords: Coordinates): Promise<string> {
  const url =
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}` +
    `&longitude=${coords.longitude}&localityLanguage=en`;

  const payload = await fetchJson(url, 6000);
  if (!payload || typeof payload !== 'object') return 'Location Found';

  const data = payload as Record<string, unknown>;
  const city = typeof data.city === 'string' && data.city ? data.city : undefined;
  const locality = typeof data.locality === 'string' ? data.locality : undefined;
  const subdivision =
    typeof data.principalSubdivisionCode === 'string'
      ? data.principalSubdivisionCode
      : typeof data.principalSubdivision === 'string'
        ? data.principalSubdivision
        : undefined;
  const country = typeof data.countryCode === 'string' ? data.countryCode : undefined;

  if (!city && !locality) return 'Unknown Location';
  return shortLocationName(city ?? locality, subdivision, country);
}
