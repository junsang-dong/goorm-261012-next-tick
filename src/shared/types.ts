export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';
export type TimerCommand = 'start' | 'pause' | 'resume' | 'reset';
export type WindowMode = 'normal' | 'mini' | 'settings' | 'input';
export type AccentColor = 'orange' | 'blue' | 'green' | 'yellow';

export interface TimerSnapshot {
  revision: number;
  status: TimerStatus;
  durationMs: number;
  remainingMs: number;
  targetEndAt: number | null;
  runId: string | null;
  updatedAt: number;
}

export interface Settings {
  schemaVersion: 1;
  lastDurationSeconds: number;
  alwaysOnTop: boolean;
  soundEnabled: boolean;
  notificationEnabled: boolean;
  accentColor: AccentColor;
}

export interface CompletionEvent {
  runId: string;
  reason: 'elapsed' | 'expired-during-sleep';
}

export interface InitialState {
  snapshot: TimerSnapshot;
  settings: Settings;
  windowMode: WindowMode;
}

export interface NextTickAPI {
  getInitialState(): Promise<InitialState>;
  setDuration(seconds: number): Promise<TimerSnapshot>;
  command(command: TimerCommand): Promise<TimerSnapshot>;
  setPinned(pinned: boolean): Promise<boolean>;
  setWindowMode(mode: WindowMode): Promise<WindowMode>;
  updateSettings(patch: Partial<Pick<Settings, 'soundEnabled' | 'notificationEnabled' | 'accentColor'>>): Promise<Settings>;
  testAlert(): Promise<{ notificationShown: boolean }>;
  onSnapshot(callback: (snapshot: TimerSnapshot) => void): () => void;
  onCompletion(callback: (event: CompletionEvent) => void): () => void;
  onStorageError(callback: (message: string) => void): () => void;
}
