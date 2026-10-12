import { describe, expect, it, vi } from 'vitest';
import { TimerService } from '../main/timer-service';

describe('TimerService', () => {
  it('starts with the configured duration', () => {
    const timer = new TimerService(900, () => 1_000);
    expect(timer.getSnapshot()).toMatchObject({ status: 'idle', durationMs: 900_000, remainingMs: 900_000 });
  });

  it('rejects invalid durations without changing the current duration', () => {
    const timer = new TimerService(900, () => 1_000);
    expect(() => timer.setDuration(0)).toThrow();
    expect(() => timer.setDuration(6_000)).toThrow();
    expect(() => timer.setDuration(1.5)).toThrow();
    expect(timer.getSnapshot().durationMs).toBe(900_000);
  });

  it('uses the target end time rather than decrementing ticks', () => {
    let now = 10_000;
    const timer = new TimerService(60, () => now);
    timer.command('start');
    now += 12_345;
    expect(timer.getSnapshot().remainingMs).toBe(47_655);
  });

  it('preserves remaining milliseconds while paused and resumes the same run', () => {
    let now = 10_000;
    const timer = new TimerService(60, () => now);
    const started = timer.command('start');
    now += 9_250;
    const paused = timer.command('pause');
    now += 50_000;
    expect(timer.getSnapshot().remainingMs).toBe(paused.remainingMs);
    const resumed = timer.command('resume');
    expect(resumed.runId).toBe(started.runId);
    expect(resumed.targetEndAt).toBe(now + paused.remainingMs);
  });

  it('resets and invalidates the active run', () => {
    const timer = new TimerService(15, () => 1_000);
    timer.command('start');
    expect(timer.command('reset')).toMatchObject({ status: 'idle', remainingMs: 15_000, runId: null });
  });

  it('completes and emits exactly once per run', () => {
    let now = 1_000;
    const timer = new TimerService(1, () => now);
    const listener = vi.fn();
    timer.on('completion', listener);
    timer.command('start');
    now = 2_001;
    expect(timer.getSnapshot().status).toBe('completed');
    timer.getSnapshot();
    timer.command('pause');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ reason: 'elapsed' }));
  });

  it('marks expiry during sleep with the correct reason', () => {
    let now = 1_000;
    const timer = new TimerService(1, () => now);
    const listener = vi.fn();
    timer.on('completion', listener);
    timer.command('start');
    now = 5_000;
    timer.handleResumeFromSleep();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ reason: 'expired-during-sleep' }));
  });
});
