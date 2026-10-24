/**
 * "Notify me when new models fit my GPU" signup helpers (Buttondown).
 * Pure functions, shared by NotifySignup.svelte and its tests.
 */

/** Buttondown username (buttondown.com/whatmodels). */
export const BUTTONDOWN_USERNAME = 'whatmodels';

/** Buttondown's embed-subscribe endpoint. Must be a plain <form> action, not fetch(). */
export const BUTTONDOWN_ACTION = `https://buttondown.com/api/emails/embed-subscribe/${BUTTONDOWN_USERNAME}`;

/**
 * VRAM tiers, smallest first. A tier is the largest threshold the user's
 * memory meets, so "vram-12" means "at least 12 GB": anything announced
 * for that tier fits everyone tagged with it.
 */
const VRAM_TIERS = [4, 6, 8, 12, 16, 24];
const TOP_TIER_GB = 32;

/**
 * Tier tag for a memory size: 10 GB → "vram-8", 24 GB → "vram-24",
 * 48 GB → "vram-32plus", 2 GB → "vram-lt4".
 * @param {number|null} vram  Usable memory in GB (pooled for multi-GPU)
 * @returns {string|null} null when no memory is known
 */
export function vramTier(vram) {
  if (vram == null || !(vram > 0)) return null;
  if (vram >= TOP_TIER_GB) return 'vram-32plus';
  const tier = VRAM_TIERS.findLast((t) => vram >= t);
  return tier != null ? `vram-${tier}` : `vram-lt${VRAM_TIERS[0]}`;
}

/**
 * Buttondown tags for a signup: the VRAM tier plus the GPU id when known.
 * @param {number|null} vram
 * @param {string|null} gpuId
 * @returns {string[]}
 */
export function signupTags(vram, gpuId = null) {
  const tags = [];
  const tier = vramTier(vram);
  if (tier) tags.push(tier);
  if (gpuId) tags.push(`gpu-${gpuId}`);
  return tags;
}
