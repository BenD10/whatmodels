/**
 * Page titles in searchers' words ("<model> VRAM requirements", "which GPUs
 * can run it"). Kept out of pages.js so title wording can change on its own.
 */

import { SITE_NAME } from './pages.js';

/** Longest heading before the site suffix, so search results don't truncate it. */
export const MAX_TITLE_CHARS = 65;

/**
 * Heading for a model page: the longest wording that fits in MAX_TITLE_CHARS,
 * falling back to shorter patterns for long model names.
 * @param {string} name  Model display name, e.g. "Qwen3.8 27B"
 * @returns {string}
 */
export function modelPageHeading(name) {
  const patterns = [
    `${name} VRAM requirements: which GPUs can run it locally?`,
    `${name} VRAM requirements: which GPUs can run it?`,
    `${name} VRAM requirements: GPUs that run it`,
  ];
  return patterns.find((p) => p.length <= MAX_TITLE_CHARS) ?? `${name} VRAM requirements`;
}

/**
 * Document <title> for a model page: the heading plus the site name.
 * @param {string} name
 * @returns {string}
 */
export function modelPageTitle(name) {
  return `${modelPageHeading(name)} | ${SITE_NAME}`;
}
