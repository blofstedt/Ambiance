/**
 * @file Settings > Media: image source, rotation speed, pause. VISUAL.
 */

import { FolderOpen, Image as ImageIcon, Pause, Play } from 'lucide-react';

import { SettingTooltip } from '../TvSlider';
import { CHIP, CHIP_OFF, CHIP_ON, SECTION_HEADING, cx } from '../ui/styles';
import type { Settings } from '../../lib/settings';

const ROTATION_CHOICES = [5, 10, 30, 60];

export interface MediaSectionProps {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  localCount: number;
  onPickLocalFolder: () => void;
  onInteract: () => void;
}

export function MediaSection(props: MediaSectionProps) {
  const { settings, setSetting, localCount, onPickLocalFolder, onInteract } = props;

  const sourceTile = (active: boolean) =>
    cx(
      'tv-focusable flex items-center gap-4 rounded-xl border p-6 transition-all',
      active ? 'border-canvas-gold bg-canvas-gold/10' : 'border-white/10 hover:bg-white/5',
    );

  return (
    <section className="space-y-4">
      <h3 className={SECTION_HEADING}>
        Media &amp; Rotation
        <SettingTooltip text="Where images come from and how often they change." />
      </h3>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <button
          type="button"
          aria-pressed={settings.imageSource === 'curated'}
          onClick={() => {
            setSetting('imageSource', 'curated');
            onInteract();
          }}
          className={sourceTile(settings.imageSource === 'curated')}
        >
          <ImageIcon
            className={cx(
              'h-7 w-7',
              settings.imageSource === 'curated' ? 'text-canvas-gold' : 'text-white/40',
            )}
            aria-hidden="true"
          />
          <span className="text-tv-sm font-bold tracking-widest text-white/70 uppercase">
            Curated
          </span>
        </button>

        <button
          type="button"
          aria-pressed={settings.imageSource === 'local'}
          onClick={() => {
            onPickLocalFolder();
            onInteract();
          }}
          className={sourceTile(settings.imageSource === 'local')}
        >
          <FolderOpen
            className={cx(
              'h-7 w-7',
              settings.imageSource === 'local' ? 'text-canvas-gold' : 'text-white/40',
            )}
            aria-hidden="true"
          />
          <span className="text-left text-tv-sm font-bold tracking-widest text-white/70 uppercase">
            Local Albums
            {localCount > 0 ? (
              <span className="block font-mono text-tv-xs tracking-normal text-canvas-sage normal-case">
                {localCount} image{localCount === 1 ? '' : 's'} loaded
              </span>
            ) : null}
          </span>
        </button>

        <div className="flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-tv-xs font-bold tracking-[0.25em] text-white/50 uppercase">
            <span className="flex items-center gap-2">
              Cycle Time
              <SettingTooltip text="How often the artwork changes." />
            </span>
            <span className="font-mono text-tv-sm text-canvas-sage">
              {settings.rotationMinutes}M
            </span>
          </div>

          <div className="flex gap-2">
            {ROTATION_CHOICES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                aria-pressed={settings.rotationMinutes === minutes}
                onClick={() => {
                  setSetting('rotationMinutes', minutes);
                  onInteract();
                }}
                className={cx(CHIP, settings.rotationMinutes === minutes ? CHIP_ON : CHIP_OFF)}
              >
                {minutes}
              </button>
            ))}
          </div>

          {/* WEB-21: isStatic was read by the rotation effect but no control set it. */}
          <button
            type="button"
            aria-pressed={settings.isStatic}
            onClick={() => {
              setSetting('isStatic', !settings.isStatic);
              onInteract();
            }}
            className={cx(
              'tv-focusable flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-tv-xs font-bold tracking-[0.2em] uppercase transition-all',
              settings.isStatic
                ? 'border-canvas-sage bg-canvas-sage/15 text-canvas-sage'
                : 'border-white/10 text-white/50 hover:bg-white/5',
            )}
          >
            {settings.isStatic ? (
              <Pause className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )}
            {settings.isStatic ? 'Rotation paused' : 'Rotation on'}
          </button>
        </div>
      </div>
    </section>
  );
}