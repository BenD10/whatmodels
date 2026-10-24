import { describe, it, expect } from 'vitest';
import { vramTier, signupTags, BUTTONDOWN_ACTION } from './notify.js';

describe('vramTier', () => {
  it('rounds down to the tier the memory meets', () => {
    expect(vramTier(8)).toBe('vram-8');
    expect(vramTier(10)).toBe('vram-8'); // RTX 3080
    expect(vramTier(11)).toBe('vram-8'); // GTX 1080 Ti
    expect(vramTier(12)).toBe('vram-12');
    expect(vramTier(16)).toBe('vram-16');
    expect(vramTier(20)).toBe('vram-16');
    expect(vramTier(24)).toBe('vram-24');
  });

  it('groups 32 GB and above', () => {
    expect(vramTier(32)).toBe('vram-32plus');
    expect(vramTier(512)).toBe('vram-32plus');
  });

  it('covers small cards', () => {
    expect(vramTier(4)).toBe('vram-4');
    expect(vramTier(6)).toBe('vram-6');
    expect(vramTier(2)).toBe('vram-lt4');
  });

  it('returns null without a usable value', () => {
    expect(vramTier(null)).toBeNull();
    expect(vramTier(0)).toBeNull();
    expect(vramTier(NaN)).toBeNull();
  });
});

describe('signupTags', () => {
  it('tags tier and GPU id', () => {
    expect(signupTags(8, 'rtx-4060')).toEqual(['vram-8', 'gpu-rtx-4060']);
  });

  it('falls back to the tier alone for manual VRAM', () => {
    expect(signupTags(24)).toEqual(['vram-24']);
  });

  it('returns no tags without memory or GPU', () => {
    expect(signupTags(null, null)).toEqual([]);
  });
});

describe('BUTTONDOWN_ACTION', () => {
  it('points at the embed-subscribe endpoint', () => {
    expect(BUTTONDOWN_ACTION).toMatch(/^https:\/\/buttondown\.com\/api\/emails\/embed-subscribe\/[^/]+$/);
  });
});
