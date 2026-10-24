/**
 * Lightweight PostHog event helpers.
 * Safe to call during SSR / dev (no-ops when posthog isn't loaded).
 */

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
