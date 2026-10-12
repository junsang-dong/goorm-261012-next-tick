import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AccentColor, CompletionEvent, Settings, TimerCommand, TimerSnapshot, WindowMode } from '../shared/types';
import { DEFAULT_SETTINGS, PRESETS } from '../shared/constants';

const fallbackSnapshot: TimerSnapshot = {
  revision: 0, status: 'idle', durationMs: 30 * 60_000, remainingMs: 30 * 60_000,
  targetEndAt: null, runId: null, updatedAt: Date.now(),
};

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}

function playChime(): void {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const gain = context.createGain();
  gain.connect(context.destination);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.25);
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(context.currentTime + index * 0.13);
    oscillator.stop(context.currentTime + 0.75 + index * 0.13);
  });
  window.setTimeout(() => void context.close(), 1600);
}

function Icon({ name }: { name: 'pin' | 'settings' | 'mini' | 'back' }) {
  const paths = {
    pin: <><path d="m14 4 6 6-3 1-4 4-1 5-3-3-5 1 4-4 1-3 5-7Z"/><path d="m5 21 5-5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.2 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.4v-4h.1A1.7 1.7 0 0 0 4.2 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.66 3.8l.06.06A1.7 1.7 0 0 0 8.6 4.2a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1v-.1h4v.1a1.7 1.7 0 0 0 1 1.7 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.6a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7 1Z"/></>,
    mini: <><rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 15h8"/></>,
    back: <path d="m15 18-6-6 6-6"/>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function WindowTitlebar() {
  return <div className="window-titlebar" aria-hidden="true"><span>NextTick</span></div>;
}

export function App() {
  const [snapshot, setSnapshot] = useState(fallbackSnapshot);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [mode, setMode] = useState<WindowMode>('normal');
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [minutes, setMinutes] = useState('30');
  const [seconds, setSeconds] = useState('00');
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    window.nextTick.getInitialState().then((initial) => {
      setSnapshot(initial.snapshot);
      setSettings(initial.settings);
      setMode(initial.windowMode);
      setReady(true);
    }).catch((error) => setMessage(errorMessage(error)));
    const removeSnapshot = window.nextTick.onSnapshot((next) => setSnapshot((current) => next.revision >= current.revision ? next : current));
    const removeCompletion = window.nextTick.onCompletion((_event: CompletionEvent) => {
      if (settingsRef.current.soundEnabled) playChime();
    });
    const removeStorageError = window.nextTick.onStorageError(setMessage);
    return () => { removeSnapshot(); removeCompletion(); removeStorageError(); };
  }, []);

  const busy = snapshot.status === 'running' || snapshot.status === 'paused';
  const progress = snapshot.durationMs > 0 ? Math.min(1, Math.max(0, 1 - snapshot.remainingMs / snapshot.durationMs)) : 0;
  const statusText = { idle: '준비됨', running: '집중 중', paused: '잠시 멈춤', completed: '완료' }[snapshot.status];

  const runCommand = useCallback(async (command: TimerCommand) => {
    try { setMessage(''); setSnapshot(await window.nextTick.command(command)); }
    catch (error) { setMessage(errorMessage(error)); }
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, button, select, textarea') || mode === 'settings' || mode === 'input') return;
      if (event.code === 'Space') {
        event.preventDefault();
        const command = snapshot.status === 'running' ? 'pause' : snapshot.status === 'paused' ? 'resume' : 'start';
        void runCommand(command);
      } else if (event.key.toLowerCase() === 'r') void runCommand('reset');
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, runCommand, snapshot.status]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [mode]);

  const changeMode = async (nextMode: WindowMode) => {
    try { setMode(await window.nextTick.setWindowMode(nextMode)); setMessage(''); }
    catch (error) { setMessage(errorMessage(error)); }
  };

  const selectDuration = async (totalSeconds: number) => {
    try {
      setSnapshot(await window.nextTick.setDuration(totalSeconds));
      setMessage('');
      if (mode === 'input') await changeMode('normal');
    } catch (error) { setMessage(errorMessage(error)); }
  };

  const togglePinned = async () => {
    try {
      const alwaysOnTop = await window.nextTick.setPinned(!settings.alwaysOnTop);
      setSettings((current) => ({ ...current, alwaysOnTop }));
    }
    catch (error) { setMessage(errorMessage(error)); }
  };

  const updateToggle = async (key: 'soundEnabled' | 'notificationEnabled') => {
    try { setSettings(await window.nextTick.updateSettings({ [key]: !settings[key] })); setMessage(''); }
    catch (error) { setMessage(errorMessage(error)); }
  };

  const updateAccent = async (accentColor: AccentColor) => {
    try { setSettings(await window.nextTick.updateSettings({ accentColor })); setMessage(''); }
    catch (error) { setMessage(errorMessage(error)); }
  };

  const mainAction = useMemo(() => {
    if (snapshot.status === 'running') return { label: '일시정지', command: 'pause' as const };
    if (snapshot.status === 'paused') return { label: '계속하기', command: 'resume' as const };
    if (snapshot.status === 'completed') return { label: '다시 시작', command: 'start' as const };
    return { label: '집중 시작', command: 'start' as const };
  }, [snapshot.status]);

  if (!ready) return <main className="app loading">NextTick 준비 중…</main>;

  if (mode === 'mini') {
    return <main className="app mini-app" data-accent={settings.accentColor}>
      <WindowTitlebar />
      <header className="mini-header"><span className={`status-dot ${snapshot.status}`} />NextTick · {statusText}
        <div className="header-actions">
          <button className={`icon-button ${settings.alwaysOnTop ? 'active' : ''}`} onClick={togglePinned} aria-label="항상 위"><Icon name="pin" /></button>
          <button className="icon-button" onClick={() => changeMode('normal')} aria-label="기본 모드"><Icon name="back" /></button>
        </div>
      </header>
      <section className="mini-timer">
        <strong>{formatTime(snapshot.remainingMs)}</strong>
        <button className="round-action" onClick={() => runCommand(mainAction.command)}>{snapshot.status === 'running' ? 'Ⅱ' : '▶'}</button>
      </section>
      <div className="mini-progress"><span style={{ width: `${progress * 100}%` }} /></div>
    </main>;
  }

  return <main className="app" data-accent={settings.accentColor}>
    <WindowTitlebar />
    <header className="app-header">
      <div><p className="eyebrow">MINI FOCUS TIMER</p><h1>NextTick<span className="orange-dot">.</span></h1></div>
      <div className="header-actions">
        <button className={`icon-button ${settings.alwaysOnTop ? 'active' : ''}`} onClick={togglePinned} aria-label={settings.alwaysOnTop ? '항상 위 해제' : '항상 위'} title="항상 위"><Icon name="pin" /></button>
        <button className="icon-button" onClick={() => changeMode('mini')} aria-label="미니 모드" title="미니 모드"><Icon name="mini" /></button>
        <button className={`icon-button ${mode === 'settings' ? 'active' : ''}`} onClick={() => changeMode(mode === 'settings' ? 'normal' : 'settings')} aria-label="설정" title="설정"><Icon name="settings" /></button>
      </div>
    </header>

    <section className={`timer-card ${snapshot.status}`} aria-label={`타이머 ${statusText}`}>
      <div className="card-topline"><span>{statusText}</span><span>{Math.round(progress * 100)}%</span></div>
      <button className="time-button" onClick={() => !busy && changeMode('input')} disabled={busy} aria-label="시간 직접 입력">
        {formatTime(snapshot.remainingMs)}
      </button>
      <div className="arc" aria-hidden="true">
        <svg viewBox="0 0 300 72" preserveAspectRatio="none">
          <path className="arc-track" d="M10 65 Q150 -15 290 65" pathLength="100" />
          <path className="arc-fill" d="M10 65 Q150 -15 290 65" pathLength="100" style={{ strokeDashoffset: 100 - progress * 100 }} />
        </svg>
      </div>
    </section>

    {mode === 'settings' ? <section className="panel settings-panel">
      <div className="panel-title"><div><p className="eyebrow dark">PREFERENCES</p><h2>설정</h2></div><button className="text-button" onClick={() => changeMode('normal')}>완료</button></div>
      <div className="color-setting">
        <div className="color-label"><b>포인트 컬러</b><small>집중할 때 끌리는 색을 선택하세요</small></div>
        <div className="color-options">
          {(['orange', 'blue', 'green', 'yellow'] as AccentColor[]).map((color) => <button
            key={color}
            className={`color-swatch ${color} ${settings.accentColor === color ? 'selected' : ''}`}
            onClick={() => updateAccent(color)}
            aria-label={`${{ orange: '오렌지', blue: '블루', green: '그린', yellow: '옐로우' }[color]} 포인트 컬러`}
            aria-pressed={settings.accentColor === color}
          ><span /></button>)}
        </div>
      </div>
      <label className="toggle-row"><span><b>완료 소리</b><small>부드러운 3음 차임을 재생합니다</small></span><input type="checkbox" checked={settings.soundEnabled} onChange={() => updateToggle('soundEnabled')} /><i /></label>
      <label className="toggle-row"><span><b>시스템 알림</b><small>macOS 알림 센터에 표시합니다</small></span><input type="checkbox" checked={settings.notificationEnabled} onChange={() => updateToggle('notificationEnabled')} /><i /></label>
      <button className="secondary wide" onClick={async () => { if (settings.soundEnabled) playChime(); await window.nextTick.testAlert(); }}>알림 테스트</button>
      <p className="shortcut-note">Space 시작·멈춤 · R 초기화</p>
    </section> : mode === 'input' ? <section className="panel input-panel">
      <div className="panel-title"><div><p className="eyebrow dark">CUSTOM TIMER</p><h2>시간 직접 입력</h2></div><button className="text-button" onClick={() => changeMode('normal')}>취소</button></div>
      <div className="duration-fields">
        <label><span>분</span><input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="분" /><small>0–99</small></label>
        <b>:</b>
        <label><span>초</span><input inputMode="numeric" value={seconds} onChange={(e) => setSeconds(e.target.value)} aria-label="초" /><small>0–59</small></label>
      </div>
      <button className="primary wide" onClick={() => {
        if (!/^\d+$/.test(minutes) || !/^\d+$/.test(seconds)) return setMessage('분과 초에는 정수만 입력해 주세요.');
        const min = Number(minutes), sec = Number(seconds);
        if (min > 99 || sec > 59 || min * 60 + sec < 1) return setMessage('1초부터 99분 59초까지 입력할 수 있습니다.');
        void selectDuration(min * 60 + sec);
      }}>이 시간으로 설정</button>
    </section> : <>
      <section className="presets" aria-label="타이머 프리셋">
        {PRESETS.map((preset) => <button key={preset} className={snapshot.durationMs === preset * 60_000 ? 'selected' : ''} disabled={busy} onClick={() => selectDuration(preset * 60)}><b>{preset}</b><span>MIN</span></button>)}
      </section>
      <section className="controls">
        <button className="primary" onClick={() => runCommand(mainAction.command)}>{mainAction.label}<span>→</span></button>
        <button className="secondary" onClick={() => runCommand('reset')} disabled={snapshot.status === 'idle'}>초기화</button>
      </section>
    </>}

    {message && <p className="message" role="alert">{message}<button onClick={() => setMessage('')} aria-label="메시지 닫기">×</button></p>}
    <footer><span>OFFLINE</span><span>FOCUS, ONE TICK AT A TIME</span></footer>
  </main>;
}
