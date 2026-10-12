import type { NextTickAPI } from '../shared/types';

declare global {
  interface Window { nextTick: NextTickAPI; }
}

export {};
