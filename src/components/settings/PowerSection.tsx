/**
 * @file Settings > Power: sleep timer, black mode, motion sensitivity, OLED saver. VISUAL.
 */

import { EyeOff, Sun } from 'lucide-react';

import { SettingTooltip, TvSlider } from '../TvSlider';
import {
  CHIP,
  CHIP_OFF,
  CHIP_ON_SAGE,
  SECTION_HEADING,
  TOGGLE,
  TOGGLE_OFF,
  TOGGLE_ON,
  cx,
} from '../ui/styles';
import { ScreensaverCard } from './ScreensaverCard';
import { canOpenScreensaverSettings } from '../../lib/native';
import { BRAND } from '../../lib/theme';
import type { Settings } from '../../lib/settings';

const SENSITIVITY_CHOICES = [1, 3, 5, 10];
const OLED_CHOICES = [5, 10, 30, 60];

export interface PowerSectionProps {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onInteract: () => void;
}

export function PowerSection({ settings, setSetting, onInteract }: PowerSectionProps) {
  return (
    <section className="space-y-4">
      <h3 className={SECTION_HEADING}>
        Power &amp; Sleep
        <SettingTooltip text="Motion, blackout, and panel protection behaviour." />
      </h3>

      <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
        <TvSlider
          label="Sleep Timer"
          tooltip="Minutes without motion before the screen blacks out."
          value={settings.powerSafeMinutes}
          min={1}
          max={60}
          step={1}
          suffix="M"
          gradientClasses="bg-gradient-to-r from-canvas-sage/10 to-canvas-sage/50"
          thumbColor={BRAND.sage}
          onChange={(value) => {
            setSetting('powerSafeMinutes', value);
            onInteract();
          }}
        />

        <TvSlider
          label="Black Threshold"
          tooltip="Below this lux level the screen stays black when Black Mode is on."
          value={settings.blackModeThreshold}
          min={0}
          max={50}
          step={1}
          suffix=" LUX"
          gradientClasses="bg-gradient-to-r from-black to-canvas-sage/30"
          thumbColor={BRAND.shadow}
          onChange={(value) => {
            setSetting('blackModeThreshold', value);
            onInteract();
          }}
        />

        <button
          type="button"
          aria-pressed={settings.blackModeEnabled}
          onClick={() => {
            setSetting('blackModeEnabled', !settings.blackModeEnabled);
            onInteract();
          }}
          className={cx(
            TOGGLE,
            settings.blackModeEnabled ? 'border-canvas-sage bg-black text-canvas-sage' : TOGGLE_OFF,
          )}
        >
          <EyeOff className="h-6 w-6" aria-hidden="true" />
          <span className="text-tv-xs font-bold tracking-widest uppercase">Black Mode</span>
          <span className="text-center text-tv-xs normal-case opacity-60">
            Recommended for OLED and Mini-LED panels
          </span>
        </button>

        <button
          type="button"
          aria-pressed={settings.keepScreenAwake}
          onClick={() => {
            setSetting('keepScreenAwake', !settings.keepScreenAwake);
            onInteract();
          }}
          className={cx(TOGGLE, settings.keepScreenAwake ? TOGGLE_ON : TOGGLE_OFF)}
        >
          <Sun className="h-6 w-6" aria-hidden="true" />
          <span className="text-tv-xs font-bold tracking-widest uppercase">Keep Awake</span>
          <span className="text-center text-tv-xs normal-case opacity-60">
            Stops the TV sleeping on its own timer
          </span>
        </button>
      </div>

      {canOpenScreensaverSettings() ? <ScreensaverCard onInteract={onInteract} /> : null}

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2 text-tv-xs font-bold tracking-widest text-white/40 uppercase">
            Motion Sensitivity
            <SettingTooltip text="How many consecutive motion readings are needed before the display wakes." />
          </div>
          <div className="flex gap-2">
            {SENSITIVITY_CHOICES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={settings.motionSensitivity === value}
                onClick={() => {
                  setSetting('motionSensitivity', value);
                  onInteract();
                }}
                className={cx(CHIP, settings.motionSensitivity === value ? CHIP_ON_SAGE : CHIP_OFF)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-tv-xs font-bold tracking-widest text-white/40 uppercase">
            OLED Saver
            <SettingTooltip text="Minutes of stillness before overlays dim, reducing burn-in risk." />
          </div>
          <div className="flex gap-2">
            {OLED_CHOICES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                aria-pressed={settings.oledSaverMinutes === minutes}
                onClick={() => {
                  setSetting('oledSaverMinutes', minutes);
                  onInteract();
                }}
                className={cx(
                  CHIP,
                  settings.oledSaverMinutes === minutes ? CHIP_ON_SAGE : CHIP_OFF,
                )}
              >
                {minutes}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
