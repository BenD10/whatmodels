import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInputTracker, INPUT_TRACK_DELAY_MS } from './analytics.js';

describe('createInputTracker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('uses an 800 ms quiet period by default', () => {
    expect(INPUT_TRACK_DELAY_MS).toBe(800);
  });

  it('sends one event with the final value of a typing burst', () => {
    const send = vi.fn();
    const t = createInputTracker(send);
    // Typing "24.5": 2 → 24 → 24 (the "." alone doesn't change the number) → 24.5
    for (const v of [2, 24, 24, 24.5]) {
      t.update(v);
      vi.advanceTimersByTime(150);
    }
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(INPUT_TRACK_DELAY_MS);
    expect(send.mock.calls).toEqual([[24.5]]);
  });

  it('coalesces spinner clicks into one event', () => {
    const send = vi.fn();
    const t = createInputTracker(send, { initial: 1 });
    for (const v of [2, 3, 4]) {
      t.update(v);
      vi.advanceTimersByTime(300);
    }
    vi.advanceTimersByTime(INPUT_TRACK_DELAY_MS);
    expect(send.mock.calls).toEqual([[4]]);
  });

  it('skips a value equal to the last one sent', () => {
    const send = vi.fn();
    const t = createInputTracker(send);
    t.update(24);
    vi.advanceTimersByTime(INPUT_TRACK_DELAY_MS);
    // Edit away and back within one burst: the final value is unchanged
    t.update(245);
    t.update(24);
    vi.advanceTimersByTime(INPUT_TRACK_DELAY_MS);
    expect(send.mock.calls).toEqual([[24]]);
  });

  it('skips a value equal to the initial one', () => {
    const send = vi.fn();
    const t = createInputTracker(send, { initial: 1 });
    t.update(2);
    t.update(1);
    vi.advanceTimersByTime(INPUT_TRACK_DELAY_MS);
    expect(send).not.toHaveBeenCalled();
  });

  it('null cancels the pending send', () => {
    const send = vi.fn();
    const t = createInputTracker(send);
    t.update(8);
    t.update(null);
    vi.advanceTimersByTime(INPUT_TRACK_DELAY_MS);
    t.flush();
    expect(send).not.toHaveBeenCalled();
  });

  it('flush sends the pending value at once, and only once', () => {
    const send = vi.fn();
    const t = createInputTracker(send);
    t.update(16);
    t.flush();
    expect(send.mock.calls).toEqual([[16]]);
    vi.advanceTimersByTime(INPUT_TRACK_DELAY_MS);
    t.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('flush with nothing pending sends nothing', () => {
    const send = vi.fn();
    createInputTracker(send).flush();
    expect(send).not.toHaveBeenCalled();
  });
});
