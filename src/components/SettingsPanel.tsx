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
  const content = String.raw`test`;
  return null;
}