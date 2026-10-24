/**
 * Amazon Associates links. Only search links are built (no product IDs, and no
 * Amazon prices are ever shown), tagged per marketplace.
 *
 * The marketplace is picked in the browser from the time zone: Canadian zones
 * go to amazon.ca, everything else to amazon.com. Prerendered HTML always uses
 * the US store; components switch after mount (see detectMarketplace).
 */

/** Associates tag per marketplace; null means "link without a tag". */
export const MARKETPLACES = {
  us: { domain: 'www.amazon.com', tag: 'whatmodels08-20' },
  ca: { domain: 'www.amazon.ca', tag: 'whatmodels-20' },
};

export const DEFAULT_MARKETPLACE = 'us';

/** Required disclosure, shown next to every block of affiliate links. */
export const AFFILIATE_DISCLOSURE = 'As an Amazon Associate, I earn from qualifying purchases.';

/** Attributes every affiliate link carries: marked as paid, opened in a new tab. */
export const AFFILIATE_LINK_ATTRS = { rel: 'sponsored noopener', target: '_blank' };

// IANA zones (and legacy links) used in Canada
const CANADIAN_TIME_ZONES = new Set([
  'America/St_Johns', 'America/Halifax', 'America/Glace_Bay', 'America/Moncton', 'America/Goose_Bay',
  'America/Toronto', 'America/Montreal', 'America/Nipigon', 'America/Thunder_Bay', 'America/Iqaluit',
  'America/Pangnirtung', 'America/Atikokan', 'America/Blanc-Sablon', 'America/Winnipeg', 'America/Rainy_River',
  'America/Resolute', 'America/Rankin_Inlet', 'America/Regina', 'America/Swift_Current', 'America/Edmonton',
  'America/Cambridge_Bay', 'America/Yellowknife', 'America/Inuvik', 'America/Creston', 'America/Dawson_Creek',
  'America/Fort_Nelson', 'America/Vancouver', 'America/Whitehorse', 'America/Dawson',
]);

/**
 * Marketplace for an IANA time zone name.
 * @param {string|undefined} timeZone
 * @returns {'us'|'ca'}
 */
export function marketplaceForTimeZone(timeZone) {
  if (!timeZone) return DEFAULT_MARKETPLACE;
  return CANADIAN_TIME_ZONES.has(timeZone) || timeZone.startsWith('Canada/') ? 'ca' : 'us';
}

/**
 * The visitor's marketplace, from the browser's time zone. Call only in the
 * browser (e.g. in onMount); during prerender use DEFAULT_MARKETPLACE.
 * @returns {'us'|'ca'}
 */
export function detectMarketplace() {
  try {
    return marketplaceForTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return DEFAULT_MARKETPLACE;
  }
}

/**
 * Amazon search URL for a query in a marketplace, with its Associates tag if one is set.
 * @param {string} query  e.g. "RTX 4060 Ti 16GB"
 * @param {'us'|'ca'} marketplace
 * @returns {string}
 */
export function amazonSearchUrl(query, marketplace = DEFAULT_MARKETPLACE) {
  const { domain, tag } = MARKETPLACES[marketplace] ?? MARKETPLACES[DEFAULT_MARKETPLACE];
  const url = new URL(`https://${domain}/s`);
  url.searchParams.set('k', query);
  if (tag) url.searchParams.set('tag', tag);
  return url.toString();
}
