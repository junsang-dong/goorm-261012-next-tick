import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { CompletionEvent, TimerCommand, TimerSnapshot } from '../shared/types';
import { MAX_DURATION_SECONDS, MIN_DURATION_SECONDS } from '../shared/constants';

type TimerEvents = {
  snapshot: [TimerSnapshot];
  completion: [CompletionEvent];
};

export class TimerService extends EventEmitter<TimerEvents> {
  private snapshot: TimerSnapshot;
  private interval: NodeJS.Timeout | null = null;
  private notifiedRunId: string | null = null;

  constructor(durationSeconds: number, private readonly now = Date.now) {
    super();
    const timestamp = now();
    this.snapshot = {
      revision: 0,
      status: 'idle',
      durationMs: durationSeconds * 1000,
      remainingMs: durationSeconds * 1000,
      targetEndAt: null,
      runId: null,
      updatedAt: timestamp,
    };
  }

  getSnapshot(): TimerSnapshot {
    if (this.snapshot.status === 'running') this.recalculate('elapsed');
    return { ...this.snapshot };
  }

  startTicking(): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.recalculate('elapsed'), 250);
  }

  stopTicking(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  setDuration(seconds: number): TimerSnapshot {
    this.recalculate('elapsed');
    if (!Number.isInteger(seconds) || seconds < MIN_DURATION_SECONDS || seconds > MAX_DURATION_SECONDS) {
      throw new Error('시간은 1초부터 99분 59초까지 설정할 수 있습니다.');
    }
    if (this.snapshot.status === 'running' || this.snapshot.status === 'paused') {
      throw new Error('실행 중에는 시간을 변경할 수 없습니다. 먼저 초기화해 주세요.');
    }
    this.notifiedRunId = null;
    this.update({
      status: 'idle', durationMs: seconds * 1000, remainingMs: seconds * 1000,
      targetEndAt: null, runId: null,
    });
    return this.getSnapshot();
  }

  command(command: TimerCommand): TimerSnapshot {
    this.recalculate('elapsed');
    if (command === 'start' && (this.snapshot.status === 'idle' || this.snapshot.status === 'completed')) {
      const runId = randomUUID();
      this.notifiedRunId = null;
      this.update({
        status: 'running', runId, remainingMs: this.snapshot.durationMs,
        targetEndAt: this.now() + this.snapshot.durationMs,
      });
    } else if (command === 'pause' && this.snapshot.status === 'running') {
      const remainingMs = Math.max(0, (this.snapshot.targetEndAt ?? this.now()) - this.now());
      if (remainingMs <= 0) this.complete('elapsed');
      else this.update({ status: 'paused', remainingMs, targetEndAt: null });
    } else if (command === 'resume' && this.snapshot.status === 'paused') {
      this.update({ status: 'running', targetEndAt: this.now() + this.snapshot.remainingMs });
    } else if (command === 'reset') {
      this.notifiedRunId = null;
      this.update({ status: 'idle', remainingMs: this.snapshot.durationMs, targetEndAt: null, runId: null });
    }
    return this.getSnapshot();
  }

  handleResumeFromSleep(): void {
    if (this.snapshot.status !== 'running') return;
    this.recalculate('expired-during-sleep');
  }

  private recalculate(reason: CompletionEvent['reason']): void {
    if (this.snapshot.status !== 'running' || this.snapshot.targetEndAt === null) return;
    const remainingMs = Math.max(0, this.snapshot.targetEndAt - this.now());
    if (remainingMs <= 0) this.complete(reason);
    else if (Math.abs(remainingMs - this.snapshot.remainingMs) >= 150) this.update({ remainingMs });
  }

  private complete(reason: CompletionEvent['reason']): void {
    if (this.snapshot.status !== 'running' || !this.snapshot.runId) return;
    const runId = this.snapshot.runId;
    this.update({ status: 'completed', remainingMs: 0, targetEndAt: null });
    if (this.notifiedRunId === runId) return;
    this.notifiedRunId = runId;
    this.emit('completion', { runId, reason });
  }

  private update(patch: Partial<TimerSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      revision: this.snapshot.revision + 1,
      updatedAt: this.now(),
    };
    this.emit('snapshot', { ...this.snapshot });
  }
}
