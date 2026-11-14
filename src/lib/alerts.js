/**
 * New-model alert drafts: which models a data release added, which of them
 * run well at each Buttondown VRAM tier, and the Markdown emails for each tier.
 * Pure functions; scripts/alerts/draft-alerts.mjs does the git and file IO.
 */

import { bestVariantFor, contextLabel, groupVariants, TIGHT_FIT_CONTEXT_K } from './calculations.js';
import { VRAM_TIERS, TOP_TIER_GB, vramTier } from './notify.js';
import { modelSlug, SITE_URL } from './pages.js';

/**
 * Floor used for the "vram-lt4" tier. Its real floor is 0 GB, where nothing
 * runs, so it is evaluated at 2 GB, the smallest memory size the site lists.
 */
export const LT4_FLOOR_GB = 2;

/**
 * Alert tiers, smallest first: the Buttondown `vram_tier` value and the VRAM
 * each tier's email is evaluated at. Names come from vramTier() so they always
 * match what the signup form stores.
 * @type {Array<{ tier: string, floorGB: number }>}
 */
export const ALERT_TIERS = [LT4_FLOOR_GB, ...VRAM_TIERS, TOP_TIER_GB].map((floorGB) => ({
  tier: vramTier(floorGB),
  floorGB,
}));

const FEATURE_LABELS = { vision: 'Vision', reasoning: 'Reasoning', tool_use: 'Tool use' };

/**
 * Model groups present in `toModels` whose base model (name) is not in
 * `fromModels`. New quantizations of an existing model don't count.
 * @param {Array} fromModels  models.json rows at the older ref
 * @param {Array} toModels    models.json rows at the newer ref
 * @returns {Array} groupVariants() groups, in models.json order
 */
export function newModelGroups(fromModels, toModels) {
  const known = new Set(fromModels.map((m) => m.name));
  return groupVariants(toModels).filter((g) => !known.has(g.name));
}

/** Sort by MMLU-Pro descending (unknown last), then name — the site's default order. */
function byScoreThenName(a, b) {
  const sa = a.group.mmlu_score;
  const sb = b.group.mmlu_score;
  if (sa != null && sb != null && sa !== sb) return sb - sa;
  if (sa == null && sb != null) return 1;
  if (sa != null && sb == null) return -1;
  return a.group.name.localeCompare(b.group.name);
}

/**
 * The new models that run well (bucketModels "fits": no offload, at least
 * TIGHT_FIT_CONTEXT_K of context) at a given VRAM, bandwidth unknown. Each
 * pick carries the highest-precision variant that runs well, as on the model
 * pages (bestVariantFor).
 * @param {Array} groups  Output of newModelGroups()
 * @param {number} floorGB
 * @returns {Array<{ group: object, variant: object }>} variant is a bucketModels entry (has maxCtxK)
 */
export function picksForTier(groups, floorGB) {
  const picks = [];
  for (const group of groups) {
    const best = bestVariantFor(group.variants, floorGB, null);
    if (best?.status === 'fits') picks.push({ group, variant: best.variant });
  }
  return picks.sort(byScoreThenName);
}

/** "16 GB", or "32 GB or more" for the top tier. */
export function tierLabel(floorGB) {
  return floorGB >= TOP_TIER_GB ? `${floorGB} GB or more` : `${floorGB} GB`;
}

/** Subject line: "3 new models that run well on 16 GB". */
export function subjectLine(count, floorGB) {
  const what = count === 1 ? 'new model that runs' : 'new models that run';
  return `${count} ${what} well on ${floorGB} GB`;
}

function scoreText(score) {
  return score == null ? 'not published' : `${score}`;
}

/**
 * Markdown for one model in an email.
 * @param {{ group: object, variant: object }} pick
 * @param {number} floorGB
 */
export function renderModel({ group, variant }, floorGB) {
  const url = `${SITE_URL}/model/${modelSlug(group.name)}`;
  const features = group.features.length > 0
    ? group.features.map((f) => FEATURE_LABELS[f] ?? f).join(', ')
    : 'None listed';
  return [
    `### [${group.name}](${url})`,
    '',
    `- Best quantization: ${variant.quantization}, ${variant.weight_gb} GB of weights (${group.params_b}B parameters)`,
    `- Max context at ${floorGB} GB: ${contextLabel(variant.maxCtxK)} tokens`,
    `- Features: ${features}`,
    `- MMLU-Pro: ${scoreText(group.mmlu_score)} · SWE-bench Verified: ${scoreText(group.swe_bench_score)}`,
  ].join('\n');
}

/**
 * Full Markdown draft for one tier. The first line is the subject; the body
 * follows the horizontal rule.
 * @param {{ tier: string, floorGB: number }} tier
 * @param {Array<{ group: object, variant: object }>} picks  Non-empty
 */
export function renderTierEmail({ tier, floorGB }, picks) {
  const n = picks.length;
  const intro = n === 1
    ? `We added a new model to What Models Can I Run? that runs well with ${tierLabel(floorGB)} of VRAM: it fits in memory with at least ${TIGHT_FIT_CONTEXT_K}K tokens of context, without offloading to system RAM.`
    : `We added ${n} new models to What Models Can I Run? that run well with ${tierLabel(floorGB)} of VRAM: each fits in memory with at least ${TIGHT_FIT_CONTEXT_K}K tokens of context, without offloading to system RAM.`;
  return [
    `Subject: ${subjectLine(n, floorGB)}`,
    '',
    '---',
    '',
    intro,
    '',
    picks.map((p) => renderModel(p, floorGB)).join('\n\n'),
    '',
    '---',
    '',
    `Enter your exact GPU to see speeds and every other model that fits: ${SITE_URL}`,
    '',
    `You're getting this because you signed up for new-model alerts for ${floorGB === LT4_FLOOR_GB ? `less than ${VRAM_TIERS[0]} GB` : tierLabel(floorGB)} of VRAM (${tier}). [Unsubscribe]({{ unsubscribe_url }})`,
    '',
  ].join('\n');
}

/**
 * Work out every tier's draft for a release.
 * @param {Array} fromModels
 * @param {Array} toModels
 * @returns {{ newGroups: Array, tiers: Array<{ tier: string, floorGB: number, picks: Array, email: string|null }>, unplaced: Array }}
 *   `unplaced` are new models that run well at no tier floor (too big even for 32 GB).
 */
export function draftAlerts(fromModels, toModels) {
  const newGroups = newModelGroups(fromModels, toModels);
  const placed = new Set();
  const tiers = ALERT_TIERS.map((t) => {
    const picks = picksForTier(newGroups, t.floorGB);
    for (const p of picks) placed.add(p.group.name);
    return { ...t, picks, email: picks.length > 0 ? renderTierEmail(t, picks) : null };
  });
  const unplaced = newGroups.filter((g) => !placed.has(g.name));
  return { newGroups, tiers, unplaced };
}

/**
 * README.md for a drafts folder: which tiers get an email and how to send them.
 * @param {ReturnType<typeof draftAlerts>} result
 * @param {{ from: string, to: string, date: string }} meta  Refs as given plus resolved SHAs, e.g. "ef9d11a"
 */
export function renderReadme({ newGroups, tiers, unplaced }, { from, to, date }) {
  const sending = tiers.filter((t) => t.email);
  const skipped = tiers.filter((t) => !t.email);
  const lines = [
    `# New-model alert drafts, ${date}`,
    '',
    `Data change: \`${from}..${to}\`. New models: ${newGroups.length}.`,
    '',
  ];
  if (newGroups.length > 0) {
    lines.push(...newGroups.map((g) => `- ${g.name}`), '');
  }
  if (sending.length > 0) {
    lines.push(
      '## Emails to send',
      '',
      'Send each file as its own Buttondown email to the subscribers filtered by `metadata vram_tier = <tier>`. The first line is the subject; paste everything below the first `---` as the body.',
      '',
      '| Tier | Evaluated at | Models | File | Buttondown filter |',
      '| --- | --- | --- | --- | --- |',
      ...sending.map((t) => `| ${t.tier} | ${t.floorGB} GB | ${t.picks.length} | [${t.tier}.md](${t.tier}.md) | \`metadata vram_tier = ${t.tier}\` |`),
      '',
    );
  } else {
    lines.push('No tier has a new model that runs well, so there is nothing to send.', '');
  }
  if (skipped.length > 0) {
    lines.push(
      '## Skipped (nothing new runs well)',
      '',
      ...skipped.map((t) => `- ${t.tier} (${t.floorGB} GB)`),
      '',
    );
  }
  if (unplaced.length > 0) {
    lines.push(
      '## New models in no email',
      '',
      `These don't run well even at ${TOP_TIER_GB} GB, the top tier's floor:`,
      '',
      ...unplaced.map((g) => `- ${g.name}`),
      '',
    );
  }
  lines.push(
    '## How tiers are evaluated',
    '',
    `A model goes in a tier's email when its best variant runs well (the site's "runs well" bucket: fits in VRAM with at least ${TIGHT_FIT_CONTEXT_K}K context, no offload, bandwidth unknown) at the tier's floor, i.e. the least memory anyone in that tier has.`,
    `\`vram-lt4\` has no real floor (0 GB), so it is evaluated at ${LT4_FLOOR_GB} GB. Subscribers with less than ${LT4_FLOOR_GB} GB may not be able to run what it lists.`,
    '',
  );
  return lines.join('\n');
}
