import { describe, it, expect } from 'vitest';
import models from './data/models.json';
import { MAX_TITLE_CHARS, modelPageHeading, modelPageTitle } from './titles.js';

describe('modelPageHeading', () => {
  it('uses the full searchers\' wording for short names', () => {
    // "Qwen3.8 27B" (11) + 51 = 62 chars
    expect(modelPageHeading('Qwen3.8 27B')).toBe('Qwen3.8 27B VRAM requirements: which GPUs can run it locally?');
  });

  it('drops "locally" when the full wording would pass the limit', () => {
    // 17 + 51 = 68 > 65; 17 + 43 = 60
    expect(modelPageHeading('DeepSeek V4 Flash')).toBe('DeepSeek V4 Flash VRAM requirements: which GPUs can run it?');
  });

  it('uses the short pattern for long names', () => {
    // 25 + 43 = 68 > 65; 25 + 37 = 62
    expect(modelPageHeading('Nemotron 3.5 Bolt 74B A9B')).toBe('Nemotron 3.5 Bolt 74B A9B VRAM requirements: GPUs that run it');
  });

  it('falls back to "<name> VRAM requirements" for the longest names', () => {
    // 31 + 37 = 68 > 65
    expect(modelPageHeading('Nemotron 3.5 Super VL 120B A12B')).toBe('Nemotron 3.5 Super VL 120B A12B VRAM requirements');
  });

  it('always says "VRAM requirements" and stays within the limit for every catalogue model', () => {
    for (const name of new Set(models.map((m) => m.name))) {
      const heading = modelPageHeading(name);
      expect(heading.startsWith(`${name} VRAM requirements`)).toBe(true);
      expect(heading.length, heading).toBeLessThanOrEqual(MAX_TITLE_CHARS);
    }
  });
});

describe('modelPageTitle', () => {
  it('appends the site name to the heading', () => {
    expect(modelPageTitle('Qwen3.8 27B')).toBe('Qwen3.8 27B VRAM requirements: which GPUs can run it locally? | What Models?');
  });
});
