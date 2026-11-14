import { describe, it, expect } from 'vitest';
import {
  slugify,
  modelPages,
  gpuShortName,
  indefiniteArticle,
  gpuVramLabel,
  toolQuery,
  memOptionIndex,
  memParam,
  jsonLdScript,
} from './pages.js';

describe('slugify', () => {
  it('lowercases and collapses punctuation', () => {
    expect(slugify('Qwen3.5 27B')).toBe('qwen3-5-27b');
    expect(slugify('DGX Spark (GB 10)')).toBe('dgx-spark-gb-10');
  });
});

describe('modelPages', () => {
  it('groups variants by name with a slug', () => {
    const pages = modelPages([
      { name: 'B Model', weight_gb: 8, max_context_k: 128 },
      { name: 'A Model', weight_gb: 2, max_context_k: 32 },
      { name: 'B Model', weight_gb: 4, max_context_k: 128 },
    ]);
    expect(pages.map((p) => p.slug)).toEqual(['a-model', 'b-model']);
    expect(pages[1].variants.map((v) => v.weight_gb)).toEqual([4, 8]);
  });
});

describe('gpu naming', () => {
  it('drops the GeForce prefix', () => {
    expect(gpuShortName({ name: 'GeForce RTX 4060' })).toBe('RTX 4060');
    expect(gpuShortName({ name: 'Radeon RX 7900 XTX' })).toBe('Radeon RX 7900 XTX');
  });

  it('picks a/an by how the name is read', () => {
    expect(indefiniteArticle('RTX 4060')).toBe('an');
    expect(indefiniteArticle('GTX 1080')).toBe('a');
    expect(indefiniteArticle('M3 Ultra')).toBe('an');
    expect(indefiniteArticle('Radeon RX 7600')).toBe('a');
    expect(indefiniteArticle('Arc B580')).toBe('an');
    expect(indefiniteArticle('Tesla P40')).toBe('a');
  });

  it('labels VRAM for fixed and multi-config GPUs', () => {
    expect(gpuVramLabel({ vram_gb: 8 })).toBe('8 GB');
    expect(gpuVramLabel({ vram_options: [{ vram_gb: 96 }, { vram_gb: 512 }] })).toBe('96–512 GB');
  });
});

const m3Ultra = { id: 'm3-ultra', vram_options: [{ vram_gb: 96 }, { vram_gb: 256 }, { vram_gb: 512 }] };

describe('toolQuery', () => {
  it('builds the main-tool URL params with memory in GB', () => {
    expect(toolQuery({ id: 'rtx-4060' })).toBe('?gpu=rtx-4060');
    expect(toolQuery(m3Ultra, 2)).toBe('?gpu=m3-ultra&mem=512');
    expect(toolQuery(m3Ultra, 0)).toBe('?gpu=m3-ultra&mem=96');
  });
});

describe('memOptionIndex', () => {
  it('matches a size in GB to its option', () => {
    expect(memOptionIndex(m3Ultra, '96')).toBe(0);
    expect(memOptionIndex(m3Ultra, '512')).toBe(2);
  });

  it('falls back to a legacy option index', () => {
    expect(memOptionIndex(m3Ultra, '0')).toBe(0);
    expect(memOptionIndex(m3Ultra, '1')).toBe(1);
    expect(memOptionIndex(m3Ultra, '2')).toBe(2);
  });

  it('returns null for anything else', () => {
    for (const raw of [null, '', '3', '-1', '1.5', '128', 'abc', 'Infinity', '1e9']) {
      expect(memOptionIndex(m3Ultra, raw)).toBeNull();
    }
    expect(memOptionIndex({ id: 'rtx-4060', vram_gb: 8 }, '0')).toBeNull();
    expect(memOptionIndex(undefined, '96')).toBeNull();
  });
});

describe('memParam', () => {
  it('turns an option index into its size in GB', () => {
    expect(memParam(m3Ultra, 1)).toBe(256);
    expect(memParam(m3Ultra, '2')).toBe(512);
  });

  it('returns null when there is no option', () => {
    expect(memParam(m3Ultra, '')).toBeNull();
    expect(memParam(m3Ultra, null)).toBeNull();
    expect(memParam(m3Ultra, 3)).toBeNull();
    expect(memParam({ id: 'rtx-4060', vram_gb: 8 }, 0)).toBeNull();
  });
});

describe('jsonLdScript', () => {
  it('escapes < so data cannot close the script tag', () => {
    expect(jsonLdScript({ a: '</script>' })).not.toContain('</script><');
    expect(jsonLdScript({ a: '</script>' })).toContain('\\u003c/script>');
  });
});
