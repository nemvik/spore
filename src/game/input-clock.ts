import type { Input } from './types';

export type ActionInput = Pick<Input, 'feed' | 'bond' | 'tend' | 'pulse' | 'offer' | 'jump' | 'communicate'>;
type Action = keyof ActionInput;
const ACTION_KEYS: ReadonlyMap<string, Action> = new Map([
  ['KeyQ', 'jump'], ['KeyV', 'communicate'], ['KeyE', 'offer'], ['Space', 'feed'], ['KeyR', 'bond'], ['KeyT', 'tend'], ['KeyX', 'pulse'],
]);

/**
 * Records input edges independently of rendering. R/T/X fire once per press;
 * Space remains active while held and preserves a tap released between steps.
 * Call consume only when executing a simulation step, never just to render/read UI.
 * Call clear on mode changes, blur and visibility loss to discard stale input.
 */
export class InputLatch {
  private readonly held = new Set<Action>();
  private readonly pending = new Set<Action>();

  keyDown(code: string): void {
    const action = ACTION_KEYS.get(code);
    if (!action || this.held.has(action)) return;
    this.held.add(action);
    this.pending.add(action);
  }

  keyUp(code: string): void {
    const action = ACTION_KEYS.get(code);
    if (action) this.held.delete(action);
  }

  consume(): ActionInput {
    const input = {
      feed: this.held.has('feed') || this.pending.has('feed'),
      bond: this.pending.has('bond'),
      tend: this.pending.has('tend'),
      pulse: this.pending.has('pulse'),
      ...(this.pending.has('jump') ? {jump:true} : {}),
      ...(this.pending.has('communicate') ? {communicate:true} : {}),
      ...(this.pending.has('offer') ? {offer:true} : {}),
    };
    this.pending.clear();
    return input;
  }

  clear(): void {
    this.held.clear();
    this.pending.clear();
  }
}

export interface FixedStepClockOptions {
  stepSeconds?: number;
  maxStepsPerFrame?: number;
}

/**
 * RAF timestamps in milliseconds become fixed simulation steps in seconds.
 * The default accepts up to 250ms (15 steps) per visible frame: ordinary 80–100ms
 * frames retain their elapsed time. Excess stalled time is deliberately discarded,
 * while the fractional step remainder is retained; there is no growing catch-up debt.
 *
 * Pass active=false while paused/hidden, and reset immediately on mode change or
 * visibility loss. The first timestamp after reset only establishes a new baseline,
 * so resuming cannot simulate the time spent away. Rendering need not stop.
 */
export class FixedStepClock {
  readonly stepSeconds: number;
  readonly maxStepsPerFrame: number;
  private previousMs: number | null = null;
  private remainderSeconds = 0;

  constructor({ stepSeconds = 1 / 60, maxStepsPerFrame = 15 }: FixedStepClockOptions = {}) {
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) throw new RangeError('stepSeconds must be finite and positive.');
    if (!Number.isSafeInteger(maxStepsPerFrame) || maxStepsPerFrame < 1 || !Number.isFinite(stepSeconds * maxStepsPerFrame)) throw new RangeError('maxStepsPerFrame must be a positive safe integer with a finite time bound.');
    this.stepSeconds = stepSeconds;
    this.maxStepsPerFrame = maxStepsPerFrame;
  }

  advance(timestampMs: number, active = true): number {
    if (!active || !Number.isFinite(timestampMs)) {
      this.reset();
      return 0;
    }
    const previous = this.previousMs;
    this.previousMs = timestampMs;
    if (previous === null) return 0;
    if (timestampMs < previous) {
      this.remainderSeconds = 0;
      return 0;
    }
    const elapsedSeconds = (timestampMs - previous) / 1000;
    this.remainderSeconds += Math.min(elapsedSeconds, this.stepSeconds * this.maxStepsPerFrame);
    // A relative tolerance avoids losing an exact boundary to floating-point drift.
    const steps = Math.min(this.maxStepsPerFrame, Math.floor((this.remainderSeconds + this.stepSeconds * 1e-8) / this.stepSeconds));
    this.remainderSeconds = Math.max(0, this.remainderSeconds - steps * this.stepSeconds);
    return steps;
  }

  reset(): void {
    this.previousMs = null;
    this.remainderSeconds = 0;
  }
}
