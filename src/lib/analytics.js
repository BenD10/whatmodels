/**
 * Lightweight PostHog event helpers.
 * Safe to call during SSR / dev (no-ops when posthog isn't loaded).
 */

import { debounce } from './debounce.js';

/** Quiet period after the last keystroke or spinner click before an input is tracked. */
export const INPUT_TRACK_DELAY_MS = 800;

function capture(event, properties) {
  if (typeof window !== 'undefined' && window.posthog) {
    window.posthog.capture(event, properties);
  }
}

export function trackGpuSelected(gpuName, vramGb, bandwidthGbps) {
  capture('gpu_selected', {
    gpu_name: gpuName,
    vram_gb: vramGb,
    bandwidth_gbps: bandwidthGbps,
  });
}

export function trackManualVram(vramGb) {
  capture('manual_vram_entered', { vram_gb: vramGb });
}

export function trackFilterChanged(filterName, value) {
  capture('filter_changed', { filter_name: filterName, value });
}

/**
 * Wrap a tracking call for a free-form input (number or text field) so that a
 * burst of keystrokes or spinner clicks sends one event with the final value.
 *
 * - `update(value)`: the input's current value; sent after `delayMs` of quiet.
 *   `null` (empty or invalid input) cancels any pending send.
 * - `flush()`: send the pending value now (call on blur and on unmount).
 * - A value equal to the last one sent (or to `initial`) is not sent again.
 */
export function createInputTracker(send, { delayMs = INPUT_TRACK_DELAY_MS, initial } = {}) {
  let lastSent = initial ?? null;
  const sendIfChanged = debounce((value) => {
    if (value === lastSent) return;
    lastSent = value;
    send(value);
  }, delayMs);

  return {
    update(value) {
      if (value == null) sendIfChanged.cancel();
      else sendIfChanged(value);
    },
    flush: sendIfChanged.flush,
    cancel: sendIfChanged.cancel,
  };
}

// Events that should fire at most once per page view. Cleared on every
// client-side navigation by resetPageView() (called from +layout.svelte).
const firedThisPageView = new Set();

export function resetPageView() {
  firedThisPageView.clear();
}

export function trackNotifyFormViewed(vramTier, pageType) {
  if (firedThisPageView.has('notify_form_viewed')) return;
  firedThisPageView.add('notify_form_viewed');
  capture('notify_form_viewed', { vram_tier: vramTier, page_type: pageType });
}

export function trackNotifyFormSubmitted(vramTier, pageType) {
  capture('notify_form_submitted', { vram_tier: vramTier, page_type: pageType });
}

export function trackAffiliateClick(gpuId, pageType, placement, marketplace) {
  capture('affiliate_click', { gpu_id: gpuId, page_type: pageType, placement, marketplace });
}
