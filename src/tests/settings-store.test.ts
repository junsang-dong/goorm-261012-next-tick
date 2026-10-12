import { describe, expect, it } from 'vitest';
import { normalizeSettings } from '../main/settings-store';
import { DEFAULT_SETTINGS } from '../shared/constants';

describe('normalizeSettings', () => {
  it('uses defaults for corrupt values', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ lastDurationSeconds: -1, alwaysOnTop: 'yes' })).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and normalizes the schema version', () => {
    expect(normalizeSettings({
      schemaVersion: 99,
      lastDurationSeconds: 5400,
      alwaysOnTop: true,
      soundEnabled: false,
      notificationEnabled: false,
      accentColor: 'blue',
    })).toEqual({
      schemaVersion: 1,
      lastDurationSeconds: 5400,
      alwaysOnTop: true,
      soundEnabled: false,
      notificationEnabled: false,
      accentColor: 'blue',
    });
  });

  it('falls back to orange for an unknown accent color', () => {
    expect(normalizeSettings({ accentColor: 'purple' }).accentColor).toBe('orange');
  });
});
