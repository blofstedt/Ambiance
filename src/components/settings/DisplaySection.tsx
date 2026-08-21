/**
 * @file Settings > Display: brightness, warmth, grain, overlays, font, units. VISUAL.
 */

import { Clock, Cloud } from 'lucide-react';

import { SettingTooltip, TvSlider } from '../TvSlider';
import {
  CHIP,
  CHIP_OFF,
  CHIP_ON,
  SECTION_HEADING,
  TOGGLE,
  TOGGLE_OFF,
  TOGGLE_ON,
  cx,
} from '../ui/styles';
import { BRAND } from '../../lib/theme';
import type { Settings } from '../../lib/settings';
import type { OverlayFont, TemperatureUnit } from '../../lib/types';

const FONTS: OverlayFont[] = ['serif', 'sans', 'mono', 'script'];
const UNITS: TemperatureUnit[] = ['c', 'f'];

export interface DisplaySectionProps {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  luminance: number;
  warmth: number;
  onLuminanceChange: (value: number) => void;
  onWarmthChange: (value: number) => void;
  onCommitProfile: () => void;
  onToggleWeather: () => void;
  onInteract: () => void;
}

export function DisplaySection(props: DisplaySectionProps) {
  const {
    settings,
    setSetting,
    luminance,
    warmth,
    onLuminanceChange,
    onWarmthChange,
    onCommitProfile,
    onToggleWeather,
    onInteract,
  } = props;

  return (
    <section className="space-y-4">
      <h3 className={SECTION_HEADING}>
        Display
        <SettingTooltip text="Picture tuning and overlay controls for the artwork screen." />
      </h3>

      <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
        <TvSlider
          label="Brightness"
          tooltip="Artwork brightness after ambient adjustments are applied."
          value={luminance}
          min={0}
          max={100}
          step={5}
          suffix="%"
          gradientClasses="bg-gradient-to-r from-black/50 to-white/50"
          thumbColor={BRAND.gold}
          onChange={(value) => {
            onLuminanceChange(value);
            onInteract();
          }}
          onSave={onCommitProfile}
        />

        <TvSlider
          label="Warmth"
          tooltip="Warms or cools the image tone to match room lighting."
          value={warmth}
          min={-500}
          max={500}
          step={50}
          suffix="K"
          gradientClasses="bg-gradient-to-r from-blue-400/25 via-white/10 to-orange-400/25"
          thumbColor={BRAND.warm}
          thumbLeftCalc={`calc(${50 + (warmth / 500) * 50}% - 0.625rem)`}
          onChange={(value) => {
            onWarmthChange(value);
            onInteract();
          }}
          onSave={onCommitProfile}
        />

        <TvSlider
          label="Grain"
          tooltip="Adds paper-like texture over the artwork."
          value={settings.grainIntensity}
          min={0}
          max={100}
          step={5}
          suffix="%"
          gradientClasses="bg-gradient-to-r from-transparent to-white/30"
          thumbColor={BRAND.sage}
          onChange={(value) => {
            setSetting('grainIntensity', value);
            onInteract();
          }}
        />

        <div className="flex gap-4">
          <button
            type="button"
            aria-pressed={settings.showClock}
            onClick={() => {
              setSetting('showClock', !settings.showClock);
              onInteract();
            }}
            title="Toggle the clock overlay."
            className={cx(TOGGLE, 'flex-1', settings.showClock ? TOGGLE_ON : TOGGLE_OFF)}
          >
            <Clock className="h-6 w-6" aria-hidden="true" />
            <span className="text-tv-xs font-bold tracking-widest uppercase">Clock</span>
          </button>

          <button
            type="button"
            aria-pressed={settings.showWeather}
            onClick={() => {
              onToggleWeather();
              onInteract();
            }}
            title="Toggle the weather overlay. Requires location permission."
            className={cx(TOGGLE, 'flex-1', settings.showWeather ? TOGGLE_ON : TOGGLE_OFF)}
          >
            <Cloud className="h-6 w-6" aria-hidden="true" />
            <span className="text-tv-xs font-bold tracking-widest uppercase">Weather</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-5 py-3">
        <span className="flex items-center gap-2 text-tv-xs font-bold tracking-[0.25em] text-white/55 uppercase">
          Overlay Font
          <SettingTooltip text="Text style used by the time and weather overlays." />
        </span>
        <div className="flex gap-2">
          {FONTS.map((font) => (
            <button
              key={font}
              type="button"
              aria-pressed={settings.overlayFont === font}
              onClick={() => {
                setSetting('overlayFont', font);
                onInteract();
              }}
              className={cx(
                CHIP,
                'tracking-widest uppercase',
                settings.overlayFont === font ? CHIP_ON : CHIP_OFF,
              )}
            >
              {font}
            </button>
          ))}
        </div>

        {/* WEB-25: temperature was hardcoded to Celsius with no way to change it. */}
        <span className="flex items-center gap-2 text-tv-xs font-bold tracking-[0.25em] text-white/55 uppercase">
          Units
        </span>
        <div className="flex gap-2">
          {UNITS.map((unit) => (
            <button
              key={unit}
              type="button"
              aria-pressed={settings.temperatureUnit === unit}
              onClick={() => {
                setSetting('temperatureUnit', unit);
                onInteract();
              }}
              className={cx(
                CHIP,
                'uppercase',
                settings.temperatureUnit === unit ? CHIP_ON : CHIP_OFF,
              )}
            >
              °{unit}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
