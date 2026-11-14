/**
 * Delay calls to `fn` until `delayMs` have passed without another call; only
 * the last call's arguments are used. The returned function also has:
 * - `flush()`: run the pending call now (no-op if nothing is pending);
 * - `cancel()`: drop the pending call;
 * - `pending()`: whether a call is waiting.
 */
export function debounce(fn, delayMs) {
  let timer = null;
  let lastArgs = null;

  function run() {
    const args = lastArgs;
    timer = null;
    lastArgs = null;
    fn(...args);
  }

  function debounced(...args) {
    lastArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(run, delayMs);
  }

  debounced.flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    run();
  };

  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };

  debounced.pending = () => timer !== null;

  return debounced;
}
