/**
 * @file The settings menu shell. Sections live in components/settings/. VISUAL.
 */

import { useEffect, useRef } from 'react';

import { DisplaySection } from './settings/DisplaySection';
import { MediaSection } from './settings/MediaSection';
import { PowerSection } from './settings/PowerSection';
import { UpdatesSection } from './settings/UpdatesSection';
import { SensorPanel, type SensorPanelProps } from './SensorPanel';
import type { Settings } from '../lib/settings';
import type { UseAppUpdateResult } from '../hooks/useAppUpdate';

export interface SettingsPanelProps {
  open: boolean;
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  luminance: number;
  warmth: number;
  onLuminanceChange: (value: number) => void;
  onWarmthChange: (value: number) => void;
  onCommitProfile: () => void;
  onInteract: () => void;
  onClose: () => void;
  onPickLocalFolder: () => void;
  localCount: number;
  onToggleWeather: () => void;
  sensorPanel: SensorPanelProps;
  update: UseAppUpdateResult;
}

export function SettingsPanel(props: SettingsPanelProps) {
  const {
    open,
    settings,
    setSetting,
    luminance,
    warmth,
    onLuminanceChange,
    onWarmthChange,
    onCommitProfile,
    onInteract,
    onClose,
    onPickLocalFolder,
    localCount,
    onToggleWeather,
    sensorPanel,
    update,
  } = props;

  const panelRef = useRef<HTMLDivElement>(null);

  /*
   * WEB-13: this panel was previously always mounted and merely hidden with
   * `opacity-0 pointer-events-none`. pointer-events does not affect keyboard or
   * D-pad focus, so arrowing from the artwork screen walked straight into an
   * invisible menu and the TV appeared frozen. Conditional rendering (below)
   * removes the problem at the source.
   */
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>('[tabindex], button, input')?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/45 p-[3vw] backdrop-blur-[2px]"
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Backspace') {
          const target = event.target as HTMLElement;
          if (target.tagName === 'INPUT' && event.key === 'Backspace') return;
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {/* WEB-19: bounded and scrollable; the old panel overflowed unreachably. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Ambient Canvas settings"
        className="tv-scroll flex max-h-[88vh] w-[min(1400px,88vw)] flex-col gap-8 rounded-3xl border border-white/10 bg-canvas-surface/70 p-[2.5vw] shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
      >
        <DisplaySection
          settings={settings}
          setSetting={setSetting}
          luminance={luminance}
          warmth={warmth}
          onLuminanceChange={onLuminanceChange}
          onWarmthChange={onWarmthChange}
          onCommitProfile={onCommitProfile}
          onToggleWeather={onToggleWeather}
          onInteract={onInteract}
        />

        <MediaSection
          settings={settings}
          setSetting={setSetting}
          localCount={localCount}
          onPickLocalFolder={onPickLocalFolder}
          onInteract={onInteract}
        />

        <PowerSection settings={settings} setSetting={setSetting} onInteract={onInteract} />

        <SensorPanel {...sensorPanel} />

        <UpdatesSection update={update} onInteract={onInteract} />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="tv-focusable rounded-full border border-canvas-gold bg-canvas-gold/10 px-10 py-3 text-tv-xs font-bold tracking-[0.3em] text-canvas-gold uppercase transition-colors hover:bg-canvas-gold/20"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
