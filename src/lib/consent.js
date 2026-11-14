/**
 * Analytics consent gate.
 *
 * PostHog only loads once we know the visitor may be tracked:
 * - Google's consent message (an IAB TCF CMP served with AdSense) says GDPR
 *   doesn't apply → load, as before;
 * - GDPR applies → load only after the visitor has given the consents below,
 *   and opt out again if they withdraw them;
 * - no CMP within CMP_WAIT_MS (usually an ad blocker) → guess from the time
 *   zone: European zones don't load, everything else does.
 * Do Not Track always wins. Nothing captured before the decision is kept:
 * window.posthog doesn't exist until PostHog is loaded, so analytics.js calls
 * are no-ops until then.
 */

/** How long to wait for the CMP's __tcfapi before falling back to the time zone. */
export const CMP_WAIT_MS = 4000;

/**
 * TCF purposes the visitor must consent to for the site's own use ("purposes
 * for your own use" in AdSense Privacy & messaging, read from the publisher
 * segment of the TC string):
 * 1 Store and/or access information on a device (PostHog's cookie / local storage)
 * 8 Measure content performance
 * 9 Understand audiences through statistics
 */
export const ANALYTICS_PURPOSES = [1, 8, 9];

// Zones that count as the EEA, UK or Switzerland when the CMP isn't there to ask.
// Every Europe/* zone counts, including countries outside the EEA (Russia,
// Belarus, Ukraine, Moldova, Turkey, the western Balkans, the microstates):
// this fallback only runs when the CMP is blocked, so erring towards "ask
// first" costs little. Plus EEA territory outside Europe/* and legacy names.
const CONSENT_TIME_ZONES = new Set([
  // Iceland, Spain, Portugal, Faroe Islands (Denmark), Norway (Jan Mayen, Svalbard)
  'Atlantic/Reykjavik', 'Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Azores',
  'Atlantic/Faroe', 'Atlantic/Faeroe', 'Atlantic/Jan_Mayen', 'Arctic/Longyearbyen',
  // Cyprus, Ceuta and Melilla, and the EU's outermost regions
  'Asia/Nicosia', 'Asia/Famagusta', 'Africa/Ceuta',
  'America/Guadeloupe', 'America/Martinique', 'America/Cayenne', 'America/Marigot',
  'Indian/Reunion', 'Indian/Mayotte',
  // Legacy names
  'GB', 'GB-Eire', 'Eire', 'Iceland', 'Poland', 'Portugal', 'CET', 'MET', 'EET', 'WET',
]);

/**
 * Whether an IANA time zone is treated as the EEA, UK or Switzerland.
 * An unknown zone counts as one (ask first).
 * @param {string|undefined} timeZone
 */
export function isConsentTimeZone(timeZone) {
  if (!timeZone) return true;
  return timeZone.startsWith('Europe/') || CONSENT_TIME_ZONES.has(timeZone);
}

/**
 * The visitor's analytics consent from a TCF v2 TCData object.
 * 'pending' until the CMP has a decision (an existing choice on `tcloaded`, or a
 * new one on `useractioncomplete`); then 'granted' only if every purpose in
 * ANALYTICS_PURPOSES has publisher consent, else 'denied'.
 * @param {object|undefined} tcData
 * @returns {'granted'|'denied'|'pending'}
 */
export function analyticsConsent(tcData) {
  if (!tcData || !['tcloaded', 'useractioncomplete'].includes(tcData.eventStatus)) return 'pending';
  const consents = tcData.publisher?.consents ?? {};
  return ANALYTICS_PURPOSES.every((p) => consents[p] === true) ? 'granted' : 'denied';
}

/**
 * Whether PostHog may run.
 * @param {object} args
 * @param {boolean|undefined} args.gdprApplies  from the CMP (ignored without one)
 * @param {'granted'|'denied'|'pending'} [args.consent]  from analyticsConsent
 * @param {boolean} args.dnt  Do Not Track is on
 * @param {string|undefined} args.timeZone  used only without a CMP
 * @param {boolean} args.cmpAvailable  the CMP answered
 */
export function shouldLoadAnalytics({ gdprApplies, consent, dnt, timeZone, cmpAvailable }) {
  if (dnt) return false;
  if (!cmpAvailable) return !isConsentTimeZone(timeZone);
  if (gdprApplies === false) return true;
  // GDPR applies, or the CMP doesn't know yet: consent required
  return consent === 'granted';
}

/** Do Not Track, read the same way as PostHog's respect_dnt. */
export function doNotTrack(nav = navigator, win = window) {
  return [nav.doNotTrack, nav.msDoNotTrack, win.doNotTrack].some((v) => v === '1' || v === 'yes');
}

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/**
 * Browser only (call from onMount). Waits for the CMP, then calls `start()`
 * when analytics may run and `stop()` if consent is later withdrawn; `start()`
 * runs again if it's given back. Returns a cleanup function.
 * @param {{ start: () => void, stop: () => void, waitMs?: number }} handlers
 */
export function watchAnalyticsConsent({ start, stop, waitMs = CMP_WAIT_MS }) {
  const base = { dnt: doNotTrack(), timeZone: browserTimeZone() };
  if (base.dnt) return () => {};

  let running = false;
  const apply = (allowed) => {
    if (allowed && !running) start();
    if (!allowed && running) stop();
    running = allowed;
  };

  let listenerId;
  const listen = () => {
    window.__tcfapi('addEventListener', 2, (tcData, success) => {
      if (!success || !tcData) return;
      listenerId = tcData.listenerId;
      const consent = analyticsConsent(tcData);
      // Wait for a decision; a pending state never stops a running session
      if (tcData.gdprApplies !== false && consent === 'pending') return;
      apply(shouldLoadAnalytics({ ...base, cmpAvailable: true, gdprApplies: tcData.gdprApplies, consent }));
    });
  };

  const startedAt = Date.now();
  let timer;
  const poll = () => {
    if (typeof window.__tcfapi === 'function') return listen();
    if (Date.now() - startedAt >= waitMs) return apply(shouldLoadAnalytics({ ...base, cmpAvailable: false }));
    timer = setTimeout(poll, 100);
  };
  poll();

  return () => {
    clearTimeout(timer);
    if (listenerId !== undefined) window.__tcfapi?.('removeEventListener', 2, () => {}, listenerId);
  };
}
