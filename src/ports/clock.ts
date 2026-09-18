/**
 * Port wrapping the system clock so timestamps and durations are deterministic in tests.
 */
export interface Clock {
  now(): Date;
  /** Epoch milliseconds. */
  nowMs(): number;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowMs(): number {
    return Date.now();
  }
}
