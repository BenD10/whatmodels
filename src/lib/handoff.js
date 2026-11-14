/**
 * Links from the home tool to a GPU's landing page: the reverse of the
 * landing page's "open in the tool" link (`toolQuery` in pages.js).
 */

import { memParam } from './pages.js';

/**
 * Path (without base) of a GPU's landing page, carrying the selected memory
 * size for unified-memory chips: `/gpu/m3-ultra?mem=96`.
 * @param {object|null} gpu
 * @param {number|string|null} memIdx  Index into gpu.vram_options, or null/''
 * @returns {string|null} null when no catalogue GPU is selected
 */
export function gpuPagePath(gpu, memIdx = null) {
  if (!gpu?.id) return null;
  const mem = memParam(gpu, memIdx);
  return mem != null ? `/gpu/${gpu.id}?mem=${mem}` : `/gpu/${gpu.id}`;
}
