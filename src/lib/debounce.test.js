import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce.js';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls once with the last arguments after the delay', () => {
    const fn = vi.fn();
    const d = debounce(fn, 800);
    d(2);
    vi.advanceTimersByTime(500);
    d(24);
    vi.advanceTimersByTime(799);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(24);
  });

  it('calls again for a burst after the previous one settled', () => {
    const fn = vi.fn();
    const d = debounce(fn, 800);
    d(1);
    vi.advanceTimersByTime(800);
    d(2);
    vi.advanceTimersByTime(800);
    expect(fn.mock.calls).toEqual([[1], [2]]);
  });

  it('flush runs the pending call immediately, once', () => {
    const fn = vi.fn();
    const d = debounce(fn, 800);
    d('a', 'b');
    expect(d.pending()).toBe(true);
    d.flush();
    expect(fn).toHaveBeenCalledWith('a', 'b');
    expect(d.pending()).toBe(false);
    vi.advanceTimersByTime(800);
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel drops the pending call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 800);
    d(1);
    d.cancel();
    vi.advanceTimersByTime(1000);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
    expect(d.pending()).toBe(false);
  });
});
