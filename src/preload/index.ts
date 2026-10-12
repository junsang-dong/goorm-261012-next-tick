import { contextBridge, ipcRenderer } from 'electron';
import type { CompletionEvent, NextTickAPI, TimerSnapshot } from '../shared/types';

const api: NextTickAPI = {
  getInitialState: () => ipcRenderer.invoke('get-initial-state'),
  setDuration: (seconds) => ipcRenderer.invoke('set-duration', seconds),
  command: (command) => ipcRenderer.invoke('timer-command', command),
  setPinned: (pinned) => ipcRenderer.invoke('set-pinned', pinned),
  setWindowMode: (mode) => ipcRenderer.invoke('set-window-mode', mode),
  updateSettings: (patch) => ipcRenderer.invoke('update-settings', patch),
  testAlert: () => ipcRenderer.invoke('test-alert'),
  onSnapshot: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: TimerSnapshot) => callback(snapshot);
    ipcRenderer.on('timer-snapshot', listener);
    return () => ipcRenderer.removeListener('timer-snapshot', listener);
  },
  onCompletion: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, completion: CompletionEvent) => callback(completion);
    ipcRenderer.on('timer-completion', listener);
    return () => ipcRenderer.removeListener('timer-completion', listener);
  },
  onStorageError: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on('storage-error', listener);
    return () => ipcRenderer.removeListener('storage-error', listener);
  },
};

contextBridge.exposeInMainWorld('nextTick', api);
