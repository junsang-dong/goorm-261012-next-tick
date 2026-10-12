import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, powerMonitor } from 'electron';
import path from 'node:path';
import type { CompletionEvent, Settings, TimerCommand, WindowMode } from '../shared/types';
import { MAX_DURATION_SECONDS, MIN_DURATION_SECONDS } from '../shared/constants';
import { TimerService } from './timer-service';
import { SettingsStore } from './settings-store';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow: BrowserWindow | null = null;
let timer: TimerService;
let settings: Settings;
let store: SettingsStore;
let windowMode: WindowMode = 'normal';
let quitting = false;

const dimensions: Record<WindowMode, { width: number; height: number }> = {
  normal: { width: 380, height: 550 },
  mini: { width: 300, height: 190 },
  settings: { width: 380, height: 760 },
  input: { width: 380, height: 650 },
};

function isTrusted(event: Electron.IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url;
  if (!url) return false;
  return MAIN_WINDOW_VITE_DEV_SERVER_URL ? url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL) : url.startsWith('file://');
}

function requireTrusted(event: Electron.IpcMainInvokeEvent): void {
  if (!isTrusted(event)) throw new Error('허용되지 않은 호출입니다.');
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = null;
    if (app.isReady()) createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow(): void {
  const size = dimensions.normal;
  mainWindow = new BrowserWindow({
    ...size,
    minWidth: 300,
    minHeight: 190,
    resizable: false,
    show: false,
    backgroundColor: '#050505',
    title: 'NextTick',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 13 },
    alwaysOnTop: settings.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
}

function showNotification(title = '집중 시간이 끝났어요', body = '수고했어요. 잠깐 숨을 고르고 다음 틱을 시작해 보세요.'): boolean {
  if (!settings.notificationEnabled || !Notification.isSupported()) return false;
  try {
    const notification = new Notification({ title, body, silent: true });
    notification.on('click', showWindow);
    notification.show();
    return true;
  } catch {
    return false;
  }
}

async function persistSettings(): Promise<void> {
  try {
    await store.save(settings);
  } catch {
    mainWindow?.webContents.send('storage-error', '설정을 저장하지 못했습니다. 현재 실행에는 변경 사항이 유지됩니다.');
  }
}

function emitCompletion(event: CompletionEvent): void {
  showNotification(
    event.reason === 'expired-during-sleep' ? '잠자기 중 타이머가 끝났어요' : '집중 시간이 끝났어요',
    event.reason === 'expired-during-sleep' ? 'Mac을 사용하는 동안 종료 시각이 지났습니다.' : undefined,
  );
  mainWindow?.webContents.send('timer-completion', event);
}

function registerIpc(): void {
  ipcMain.handle('get-initial-state', (event) => {
    requireTrusted(event);
    return { snapshot: timer.getSnapshot(), settings, windowMode };
  });
  ipcMain.handle('set-duration', async (event, seconds: unknown) => {
    requireTrusted(event);
    if (!Number.isInteger(seconds) || (seconds as number) < MIN_DURATION_SECONDS || (seconds as number) > MAX_DURATION_SECONDS) {
      throw new Error('올바른 시간을 입력해 주세요.');
    }
    const snapshot = timer.setDuration(seconds as number);
    settings = { ...settings, lastDurationSeconds: seconds as number };
    await persistSettings();
    return snapshot;
  });
  ipcMain.handle('timer-command', (event, command: unknown) => {
    requireTrusted(event);
    if (!['start', 'pause', 'resume', 'reset'].includes(command as string)) throw new Error('올바르지 않은 명령입니다.');
    return timer.command(command as TimerCommand);
  });
  ipcMain.handle('set-pinned', async (event, pinned: unknown) => {
    requireTrusted(event);
    if (typeof pinned !== 'boolean') throw new Error('올바르지 않은 핀 설정입니다.');
    mainWindow?.setAlwaysOnTop(pinned);
    const actual = mainWindow?.isAlwaysOnTop() ?? false;
    settings = { ...settings, alwaysOnTop: actual };
    await persistSettings();
    return actual;
  });
  ipcMain.handle('set-window-mode', (event, mode: unknown) => {
    requireTrusted(event);
    if (!['normal', 'mini', 'settings', 'input'].includes(mode as string)) throw new Error('올바르지 않은 창 모드입니다.');
    windowMode = mode as WindowMode;
    const size = dimensions[windowMode];
    mainWindow?.setSize(size.width, size.height, true);
    return windowMode;
  });
  ipcMain.handle('update-settings', async (event, patch: unknown) => {
    requireTrusted(event);
    if (!patch || typeof patch !== 'object') throw new Error('올바르지 않은 설정입니다.');
    const input = patch as Record<string, unknown>;
    const allowed = ['soundEnabled', 'notificationEnabled', 'accentColor'];
    const invalidBoolean = ['soundEnabled', 'notificationEnabled'].some((key) => key in input && typeof input[key] !== 'boolean');
    const invalidAccent = 'accentColor' in input && !['orange', 'blue', 'green', 'yellow'].includes(input.accentColor as string);
    if (Object.keys(input).some((key) => !allowed.includes(key)) || invalidBoolean || invalidAccent) {
      throw new Error('허용되지 않은 설정입니다.');
    }
    settings = { ...settings, ...input } as Settings;
    await persistSettings();
    return settings;
  });
  ipcMain.handle('test-alert', (event) => {
    requireTrusted(event);
    return { notificationShown: showNotification('NextTick 알림 테스트', '알림이 정상적으로 준비되었습니다.') };
  });
}

async function confirmQuit(): Promise<boolean> {
  if (!timer || timer.getSnapshot().status !== 'running') return true;
  const options: Electron.MessageBoxOptions = {
    type: 'question',
    buttons: ['계속 집중', '종료'],
    defaultId: 0,
    cancelId: 0,
    title: 'NextTick 종료',
    message: '집중 타이머가 실행 중입니다.',
    detail: '종료하면 현재 타이머가 중단됩니다.',
  };
  const result = mainWindow
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);
  return result.response === 1;
}

function buildMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'NextTick', submenu: [
      { label: 'NextTick 보기', click: showWindow },
      { type: 'separator' },
      { label: '종료', accelerator: 'CmdOrCtrl+Q', click: async () => { if (await confirmQuit()) { quitting = true; app.quit(); } } },
    ] },
    { label: '편집', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
  ]));
}

app.on('second-instance', showWindow);
app.on('activate', showWindow);
app.on('before-quit', async (event) => {
  if (quitting) return;
  event.preventDefault();
  if (await confirmQuit()) { quitting = true; app.quit(); }
});
app.on('window-all-closed', () => { /* macOS utility stays active until explicit quit */ });

app.whenReady().then(async () => {
  store = new SettingsStore(app.getPath('userData'));
  settings = await store.load();
  timer = new TimerService(settings.lastDurationSeconds);
  timer.on('snapshot', (snapshot) => mainWindow?.webContents.send('timer-snapshot', snapshot));
  timer.on('completion', emitCompletion);
  timer.startTicking();
  registerIpc();
  createWindow();
  buildMenu();
  powerMonitor.on('resume', () => timer.handleResumeFromSleep());
});
