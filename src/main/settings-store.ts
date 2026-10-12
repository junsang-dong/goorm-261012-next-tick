import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AccentColor, Settings } from '../shared/types';
import { DEFAULT_SETTINGS, MAX_DURATION_SECONDS, MIN_DURATION_SECONDS } from '../shared/constants';

export function normalizeSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SETTINGS };
  const input = value as Partial<Settings>;
  const accentColors: AccentColor[] = ['orange', 'blue', 'green', 'yellow'];
  return {
    schemaVersion: 1,
    lastDurationSeconds: Number.isInteger(input.lastDurationSeconds) &&
      (input.lastDurationSeconds as number) >= MIN_DURATION_SECONDS &&
      (input.lastDurationSeconds as number) <= MAX_DURATION_SECONDS
      ? input.lastDurationSeconds as number : DEFAULT_SETTINGS.lastDurationSeconds,
    alwaysOnTop: typeof input.alwaysOnTop === 'boolean' ? input.alwaysOnTop : DEFAULT_SETTINGS.alwaysOnTop,
    soundEnabled: typeof input.soundEnabled === 'boolean' ? input.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
    notificationEnabled: typeof input.notificationEnabled === 'boolean' ? input.notificationEnabled : DEFAULT_SETTINGS.notificationEnabled,
    accentColor: accentColors.includes(input.accentColor as AccentColor) ? input.accentColor as AccentColor : DEFAULT_SETTINGS.accentColor,
  };
}

export class SettingsStore {
  private readonly filePath: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'settings.json');
  }

  async load(): Promise<Settings> {
    try {
      return normalizeSettings(JSON.parse(await fs.readFile(this.filePath, 'utf8')));
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  save(settings: Settings): Promise<void> {
    this.queue = this.queue.then(async () => {
      const tempPath = `${this.filePath}.tmp`;
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(tempPath, JSON.stringify(settings, null, 2), 'utf8');
      await fs.rename(tempPath, this.filePath);
    });
    return this.queue;
  }
}
