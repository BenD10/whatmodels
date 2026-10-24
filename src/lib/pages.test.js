import { describe, it, expect } from 'vitest';
import {
  slugify,
  modelPages,
  gpuShortName,
  indefiniteArticle,
  gpuVramLabel,
  toolQuery,
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

describe('toolQuery', () => {
  it('builds the main-tool URL params', () => {
    expect(toolQuery({ id: 'rtx-4060' })).toBe('?gpu=rtx-4060');
    expect(toolQuery({ id: 'm3-ultra' }, 2)).toBe('?gpu=m3-ultra&mem=2');
  });
});

describe('jsonLdScript', () => {
  it('escapes < so data cannot close the script tag', () => {
    expect(jsonLdScript({ a: '</script>' })).not.toContain('</script><');
    expect(jsonLdScript({ a: '</script>' })).toContain('\\u003c/script>');
  });
});
