import { describe, it, expect } from 'vitest';
import { amazonSearchUrl, marketplaceForTimeZone, MARKETPLACES, AFFILIATE_LINK_ATTRS } from './affiliate.js';

describe('amazonSearchUrl', () => {
  it('builds a tagged amazon.com search link by default', () => {
    const url = new URL(amazonSearchUrl('RTX 4060 Ti 16GB'));
    expect(url.origin + url.pathname).toBe('https://www.amazon.com/s');
    expect(url.searchParams.get('k')).toBe('RTX 4060 Ti 16GB');
    expect(url.searchParams.get('tag')).toBe(MARKETPLACES.us.tag);
  });

  it('builds an amazon.ca link with the Canadian tag', () => {
    const url = new URL(amazonSearchUrl('RTX 5070 Ti', 'ca'));
    expect(url.origin + url.pathname).toBe('https://www.amazon.ca/s');
    expect(url.searchParams.get('tag')).toBe(MARKETPLACES.ca.tag);
  });

  it('leaves the tag off when a marketplace has none', () => {
    const saved = MARKETPLACES.us.tag;
    MARKETPLACES.us.tag = null;
    try {
      expect(new URL(amazonSearchUrl('RTX 4060')).searchParams.has('tag')).toBe(false);
    } finally {
      MARKETPLACES.us.tag = saved;
    }
  });

  it('encodes special characters in the query', () => {
    expect(amazonSearchUrl('Ryzen AI Max+ 395')).toContain('k=Ryzen+AI+Max%2B+395');
  });

  it('marks links as sponsored and opens them in a new tab', () => {
    expect(AFFILIATE_LINK_ATTRS).toEqual({ rel: 'sponsored noopener', target: '_blank' });
  });
});

describe('marketplaceForTimeZone', () => {
  it('sends Canadian time zones to amazon.ca', () => {
    for (const tz of ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg',
      'America/Halifax', 'America/St_Johns', 'America/Regina', 'America/Whitehorse', 'Canada/Eastern']) {
      expect(marketplaceForTimeZone(tz), tz).toBe('ca');
    }
  });

  it('sends everything else, including nearby US zones, to amazon.com', () => {
    for (const tz of ['America/New_York', 'America/Detroit', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo', 'UTC']) {
      expect(marketplaceForTimeZone(tz), tz).toBe('us');
    }
  });

  it('defaults to the US when the zone is unknown', () => {
    expect(marketplaceForTimeZone(undefined)).toBe('us');
  });
});
