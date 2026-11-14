import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isConsentTimeZone,
  analyticsConsent,
  shouldLoadAnalytics,
  doNotTrack,
  watchAnalyticsConsent,
  CMP_WAIT_MS,
} from './consent.js';

/** TCData with publisher consent for the given purposes. */
const tc = (eventStatus, purposes = [], extra = {}) => ({
  eventStatus,
  gdprApplies: true,
  publisher: { consents: Object.fromEntries(purposes.map((p) => [p, true])) },
  ...extra,
});

describe('isConsentTimeZone', () => {
  it.each([
    'Europe/Berlin', 'Europe/London', 'Europe/Dublin', 'Europe/Zurich', 'Europe/Paris', 'Europe/Oslo',
    'Europe/Vaduz', 'Europe/Busingen', 'Europe/Mariehamn',
  ])('EEA, UK or Swiss zone %s counts', (tz) => {
    expect(isConsentTimeZone(tz)).toBe(true);
  });

  it.each([
    'Atlantic/Reykjavik', 'Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Azores', 'Atlantic/Faroe',
    'Arctic/Longyearbyen', 'Asia/Nicosia', 'Asia/Famagusta', 'Africa/Ceuta', 'America/Guadeloupe',
    'America/Martinique', 'America/Cayenne', 'Indian/Reunion', 'Indian/Mayotte',
  ])('EEA territory outside Europe/* (%s) counts', (tz) => {
    expect(isConsentTimeZone(tz)).toBe(true);
  });

  it.each(['GB', 'Eire', 'Poland', 'Portugal', 'Iceland', 'CET', 'WET'])('legacy name %s counts', (tz) => {
    expect(isConsentTimeZone(tz)).toBe(true);
  });

  // Deliberately included: outside the EEA, but only used when the CMP is blocked
  it.each(['Europe/Moscow', 'Europe/Istanbul', 'Europe/Minsk', 'Europe/Kyiv', 'Europe/Belgrade', 'Europe/Kaliningrad'])(
    'non-EEA European zone %s also counts',
    (tz) => {
      expect(isConsentTimeZone(tz)).toBe(true);
    }
  );

  it.each([
    'America/New_York', 'America/Toronto', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Kolkata',
    'Australia/Sydney', 'Africa/Lagos', 'UTC', 'Etc/UTC', 'Atlantic/Bermuda',
  ])('%s does not count', (tz) => {
    expect(isConsentTimeZone(tz)).toBe(false);
  });

  it('an unknown zone counts (ask first)', () => {
    expect(isConsentTimeZone(undefined)).toBe(true);
    expect(isConsentTimeZone('')).toBe(true);
  });
});

describe('analyticsConsent', () => {
  it('is pending without TC data or before a decision', () => {
    expect(analyticsConsent(undefined)).toBe('pending');
    expect(analyticsConsent(tc('cmpuishown', [1, 8, 9]))).toBe('pending');
    expect(analyticsConsent(tc(undefined, [1, 8, 9]))).toBe('pending');
  });

  it.each(['tcloaded', 'useractioncomplete'])('is granted on %s with publisher consent for 1, 8 and 9', (status) => {
    expect(analyticsConsent(tc(status, [1, 8, 9]))).toBe('granted');
  });

  it.each([[[]], [[1]], [[1, 8]], [[1, 9]], [[8, 9]], [[1, 7, 10]]])('is denied with only purposes %j', (purposes) => {
    expect(analyticsConsent(tc('useractioncomplete', purposes))).toBe('denied');
  });

  it('ignores vendor-level purpose consents: only publisher consent counts', () => {
    const data = tc('tcloaded', [], { purpose: { consents: { 1: true, 8: true, 9: true } } });
    expect(analyticsConsent(data)).toBe('denied');
  });

  it('ignores legitimate interest', () => {
    const data = tc('tcloaded', [1], { publisher: { consents: { 1: true }, legitimateInterests: { 8: true, 9: true } } });
    expect(analyticsConsent(data)).toBe('denied');
  });

  it('is denied when the publisher segment is missing', () => {
    expect(analyticsConsent({ eventStatus: 'tcloaded', gdprApplies: true })).toBe('denied');
  });
});

describe('shouldLoadAnalytics', () => {
  const base = { dnt: false, timeZone: 'America/New_York', cmpAvailable: true };

  it('never loads with Do Not Track', () => {
    expect(shouldLoadAnalytics({ ...base, dnt: true, gdprApplies: false })).toBe(false);
    expect(shouldLoadAnalytics({ ...base, dnt: true, gdprApplies: true, consent: 'granted' })).toBe(false);
    expect(shouldLoadAnalytics({ ...base, dnt: true, cmpAvailable: false })).toBe(false);
  });

  it('loads when the CMP says GDPR does not apply, whatever the time zone', () => {
    expect(shouldLoadAnalytics({ ...base, gdprApplies: false })).toBe(true);
    expect(shouldLoadAnalytics({ ...base, gdprApplies: false, timeZone: 'Europe/Berlin' })).toBe(true);
  });

  it('needs granted consent when GDPR applies, whatever the time zone', () => {
    expect(shouldLoadAnalytics({ ...base, gdprApplies: true, consent: 'granted' })).toBe(true);
    expect(shouldLoadAnalytics({ ...base, gdprApplies: true, consent: 'denied' })).toBe(false);
    expect(shouldLoadAnalytics({ ...base, gdprApplies: true, consent: 'pending' })).toBe(false);
    expect(shouldLoadAnalytics({ ...base, gdprApplies: true })).toBe(false);
  });

  it('treats an unknown gdprApplies as applying', () => {
    expect(shouldLoadAnalytics({ ...base, gdprApplies: undefined, consent: 'pending' })).toBe(false);
    expect(shouldLoadAnalytics({ ...base, gdprApplies: undefined, consent: 'granted' })).toBe(true);
  });

  it('without a CMP, falls back to the time zone', () => {
    expect(shouldLoadAnalytics({ ...base, cmpAvailable: false })).toBe(true);
    expect(shouldLoadAnalytics({ ...base, cmpAvailable: false, timeZone: 'Europe/Berlin' })).toBe(false);
    expect(shouldLoadAnalytics({ ...base, cmpAvailable: false, timeZone: undefined })).toBe(false);
    // gdprApplies and consent are ignored without a CMP
    expect(shouldLoadAnalytics({ ...base, cmpAvailable: false, timeZone: 'Europe/Berlin', gdprApplies: false })).toBe(false);
  });
});

describe('doNotTrack', () => {
  it.each([
    [{ doNotTrack: '1' }, {}, true],
    [{ doNotTrack: 'yes' }, {}, true],
    [{ msDoNotTrack: '1' }, {}, true],
    [{}, { doNotTrack: '1' }, true],
    [{ doNotTrack: '0' }, {}, false],
    [{ doNotTrack: 'unspecified' }, {}, false],
    [{}, {}, false],
  ])('navigator %j, window %j → %s', (nav, win, expected) => {
    expect(doNotTrack(nav, win)).toBe(expected);
  });
});

describe('watchAnalyticsConsent', () => {
  let listener;
  const start = vi.fn();
  const stop = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    start.mockReset();
    stop.mockReset();
    listener = undefined;
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {});
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({ resolvedOptions: () => ({ timeZone: 'America/New_York' }) });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const installCmp = () => {
    window.__tcfapi = vi.fn((cmd, version, cb) => {
      if (cmd === 'addEventListener') listener = cb;
    });
  };
  const emit = (data) => listener({ listenerId: 1, ...data }, true);

  it('starts when the CMP says GDPR does not apply', () => {
    installCmp();
    watchAnalyticsConsent({ start, stop });
    emit({ eventStatus: 'tcloaded', gdprApplies: false });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('waits for a choice, starts on accept, stops on withdrawal, restarts on accept', () => {
    installCmp();
    watchAnalyticsConsent({ start, stop });
    emit(tc('cmpuishown'));
    expect(start).not.toHaveBeenCalled();
    emit(tc('useractioncomplete', [1, 8, 9]));
    expect(start).toHaveBeenCalledTimes(1);
    emit(tc('cmpuishown'));
    expect(stop).not.toHaveBeenCalled();
    emit(tc('useractioncomplete', [1]));
    expect(stop).toHaveBeenCalledTimes(1);
    emit(tc('useractioncomplete', [1, 8, 9]));
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('never starts when consent is refused', () => {
    installCmp();
    watchAnalyticsConsent({ start, stop });
    emit(tc('tcloaded', [1, 8]));
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it('ignores an unsuccessful callback', () => {
    installCmp();
    watchAnalyticsConsent({ start, stop });
    listener({ eventStatus: 'tcloaded', gdprApplies: false }, false);
    expect(start).not.toHaveBeenCalled();
  });

  it('picks up a CMP that appears before the deadline', () => {
    watchAnalyticsConsent({ start, stop });
    vi.advanceTimersByTime(1000);
    installCmp();
    vi.advanceTimersByTime(100);
    emit(tc('tcloaded', [1, 8, 9]));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('without a CMP, starts after the wait outside Europe', () => {
    watchAnalyticsConsent({ start, stop });
    vi.advanceTimersByTime(CMP_WAIT_MS - 200);
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('without a CMP, never starts in a European time zone', () => {
    Intl.DateTimeFormat.mockReturnValue({ resolvedOptions: () => ({ timeZone: 'Europe/Berlin' }) });
    watchAnalyticsConsent({ start, stop });
    vi.advanceTimersByTime(CMP_WAIT_MS * 2);
    expect(start).not.toHaveBeenCalled();
  });

  it('does nothing at all with Do Not Track', () => {
    navigator.doNotTrack = '1';
    installCmp();
    watchAnalyticsConsent({ start, stop });
    expect(window.__tcfapi).not.toHaveBeenCalled();
    vi.advanceTimersByTime(CMP_WAIT_MS * 2);
    expect(start).not.toHaveBeenCalled();
  });

  it('cleanup stops the wait and removes the listener', () => {
    const cleanupBeforeCmp = watchAnalyticsConsent({ start, stop });
    cleanupBeforeCmp();
    vi.advanceTimersByTime(CMP_WAIT_MS * 2);
    expect(start).not.toHaveBeenCalled();

    installCmp();
    const cleanup = watchAnalyticsConsent({ start, stop });
    emit(tc('cmpuishown'));
    cleanup();
    expect(window.__tcfapi).toHaveBeenCalledWith('removeEventListener', 2, expect.any(Function), 1);
  });
});
