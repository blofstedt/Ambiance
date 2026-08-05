import { describe, expect, it } from 'vitest';

import { formatTemperature, shortLocationName, weatherIconFor } from '../src/lib/weather';

describe('weatherIconFor', () => {
  /**
   * WEB-10 regression. The original chain was:
   *   if (code < 70 || (code >= 80 && code <= 82)) return rain;
   *   if (code < 80 || code >= 85)                 return snow;
   *   return thunderstorm;
   * Codes 95-99 satisfy `code >= 85`, so the snow branch caught every
   * thunderstorm and the thunderstorm branch was unreachable.
   */
  it('maps thunderstorm codes to thunderstorm, not snow', () => {
    expect(weatherIconFor(95)).toBe('thunderstorm');
    expect(weatherIconFor(96)).toBe('thunderstorm');
    expect(weatherIconFor(99)).toBe('thunderstorm');
  });

  it('maps the documented WMO ranges', () => {
    expect(weatherIconFor(0)).toBe('clear');
    expect(weatherIconFor(1)).toBe('partly-cloudy');
    expect(weatherIconFor(2)).toBe('partly-cloudy');
    expect(weatherIconFor(3)).toBe('cloudy');
    expect(weatherIconFor(45)).toBe('fog');
    expect(weatherIconFor(48)).toBe('fog');
    expect(weatherIconFor(53)).toBe('drizzle');
    expect(weatherIconFor(63)).toBe('rain');
    expect(weatherIconFor(81)).toBe('rain');
    expect(weatherIconFor(73)).toBe('snow');
    expect(weatherIconFor(86)).toBe('snow');
  });

  it('degrades safely on nonsense input', () => {
    expect(weatherIconFor(Number.NaN)).toBe('cloudy');
    expect(weatherIconFor(-1)).toBe('cloudy');
  });
});

describe('formatTemperature', () => {
  // WEB-25: unit conversion did not exist; the overlay was Celsius-only.
  it('converts to Fahrenheit', () => {
    expect(formatTemperature(0, 'f')).toBe('32°F');
    expect(formatTemperature(100, 'f')).toBe('212°F');
    expect(formatTemperature(-40, 'f')).toBe('-40°F');
  });

  it('renders a placeholder rather than NaN when there is no reading', () => {
    expect(formatTemperature(null, 'c')).toBe('--°C');
    expect(formatTemperature(null, 'f')).toBe('--°F');
    expect(formatTemperature(Number.NaN, 'c')).toBe('--°C');
  });
});

describe('shortLocationName', () => {
  it('truncates long names with an ellipsis', () => {
    const result = shortLocationName('Saint-Jean-sur-Richelieu', 'Quebec', 'CA');
    expect(result.length).toBeLessThanOrEqual(22);
    expect(result.endsWith('…')).toBe(true);
  });

  it('falls back when nothing is known', () => {
    expect(shortLocationName()).toBe('Unknown Location');
  });
});
