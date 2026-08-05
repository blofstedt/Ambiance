/**
 * @file Screensaver view. Renders a cached snapshot, does NO networking.
 */
import { useEffect, useState } from 'react';

import { ArtworkCanvas } from './components/ArtworkCanvas';
import { Overlays } from './components/Overlays';
import { BUNDLED_ARTWORK } from './lib/artwork';
import { dreamStateAgeMs, readInjectedDreamState, type DreamState } from './lib/native';
import type { Artwork, OverlayFont, TemperatureUnit } from './lib/types';

/**
 * AND-06: read-only rendering surface for AmbientDreamService.
 *
 * The dream WebView has no Capacitor bridge, so it cannot reach the sensor, and
 * it runs on a file:// origin so it shares no localStorage with the main app.
 * Previously it loaded the full App, which meant it started a discovery sweep
 * and a telemetry poll that could never succeed, then rendered the hardcoded
 * default telemetry forever while burning CPU on failing requests.
 *
 * This variant does no networking at all. It renders the snapshot the main
 * activity persisted, falling back to bundled artwork so the screensaver always
 * shows something.
 */

const FALLBACK: DreamState = {
  telemetry: { lux: 0, temp: 0, motion: false },
  luminance: 35,
  warmth: 300,
  grainIntensity: 45,
  showClock: true,
  showWeather: false,
  overlayFont: 'serif',
  temperatureUnit: 'c',
  weatherTemp: null,
  weatherCode: 0,
  weatherLocation: '',
  artworkUrl: null,
  artworkTitle: null,
};

/** Snapshots older than this are too stale to present as current conditions. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export function DreamView() {
  const [state, setState] = useState<DreamState>(() => readInjectedDreamState() ?? FALLBACK);
  const [rotationIndex, setRotationIndex] = useState(0);

  // The service injects state via evaluateJavascript after onPageFinished,
  // which may land after React has already mounted.
  useEffect(() => {
    const onInjected = () => {
      const injected = readInjectedDreamState();
      if (injected) setState(injected);
    };
    window.addEventListener('ambient-dream-state', onInjected);
    return () => window.removeEventListener('ambient-dream-state', onInjected);
  }, []);

  // Gentle rotation through bundled art so a long dream is not one static frame.
  useEffect(() => {
    const timer = setInterval(
      () => setRotationIndex((current) => (current + 1) % BUNDLED_ARTWORK.length),
      10 * 60_000,
    );
    return () => clearInterval(timer);
  }, []);

  const age = dreamStateAgeMs();
  const stale = age !== null && age > STALE_AFTER_MS;

  const artwork: Artwork | null = state.artworkUrl
    ? {
        id: 'dream-current',
        title: state.artworkTitle ?? 'Ambient Canvas',
        artist: '',
        url: state.artworkUrl,
      }
    : (BUNDLED_ARTWORK[rotationIndex % BUNDLED_ARTWORK.length] ?? null);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      <ArtworkCanvas
        artwork={artwork}
        // Screensavers should sit darker than the interactive app.
        luminance={Math.min(state.luminance, 45)}
        warmth={state.warmth}
        grainIntensity={state.grainIntensity}
      />

      <Overlays
        showClock={state.showClock}
        showWeather={state.showWeather && !stale}
        font={state.overlayFont as OverlayFont}
        unit={state.temperatureUnit as TemperatureUnit}
        weatherTemp={stale ? null : state.weatherTemp}
        weatherCode={state.weatherCode}
        weatherLabel={stale ? '' : state.weatherLocation}
        connection="connected"
        isScreenBlack={false}
        isOledDimmed={false}
        overlayOpacity={0.6}
        compact
      />
    </div>
  );
}
