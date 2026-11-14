import { describe, it, expect } from 'vitest';
import { gpuPagePath } from './handoff.js';

const discrete = { id: 'rtx-5090', name: 'GeForce RTX 5090', vram_gb: 32, bandwidth_gbps: 1792 };
const unified = {
  id: 'm3-ultra',
  name: 'M3 Ultra',
  vram_options: [
    { vram_gb: 96, bandwidth_gbps: 819 },
    { vram_gb: 256, bandwidth_gbps: 819 },
  ],
};

describe('gpuPagePath', () => {
  it('links a discrete GPU to its landing page', () => {
    expect(gpuPagePath(discrete)).toBe('/gpu/rtx-5090');
    expect(gpuPagePath(discrete, '')).toBe('/gpu/rtx-5090');
  });

  it('carries the memory size in GB (not the option index) for unified memory', () => {
    expect(gpuPagePath(unified, 0)).toBe('/gpu/m3-ultra?mem=96');
    expect(gpuPagePath(unified, '1')).toBe('/gpu/m3-ultra?mem=256');
  });

  it('omits mem when no option is picked or the index is out of range', () => {
    expect(gpuPagePath(unified, '')).toBe('/gpu/m3-ultra');
    expect(gpuPagePath(unified, null)).toBe('/gpu/m3-ultra');
    expect(gpuPagePath(unified, 7)).toBe('/gpu/m3-ultra');
  });

  it('returns null without a catalogue GPU (manual VRAM)', () => {
    expect(gpuPagePath(null)).toBeNull();
    expect(gpuPagePath(undefined, 0)).toBeNull();
  });
});
