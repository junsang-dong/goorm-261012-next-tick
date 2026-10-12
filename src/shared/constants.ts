import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  lastDurationSeconds: 30 * 60,
  alwaysOnTop: false,
  soundEnabled: true,
  notificationEnabled: true,
  accentColor: 'orange',
};

export const PRESETS = [15, 30, 45, 90] as const;
export const MIN_DURATION_SECONDS = 1;
export const MAX_DURATION_SECONDS = 99 * 60 + 59;
