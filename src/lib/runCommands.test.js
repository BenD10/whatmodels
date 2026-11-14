import { describe, it, expect } from 'vitest';
import models from './data/models.json';
import { RUN_TAGS, runCommands, runTag } from './runCommands.js';

const row = (over = {}) => ({
  id: 'qwen3.5-27b-q4',
  name: 'Qwen3.5 27B',
  quantization: 'Q4_K_M',
  weight_gb: 15.59,
  gguf_repo: 'unsloth/Qwen3.5-27B-GGUF',
  gguf_shards: 1,
  features: ['tool_use', 'reasoning'],
  ...over,
});

describe('runCommands', () => {
  it('builds the Ollama and llama.cpp commands for a single-file GGUF', () => {
    const r = runCommands(row());
    expect(r.commands).toEqual([
      { tool: 'ollama', label: 'Ollama', command: 'ollama run hf.co/unsloth/Qwen3.5-27B-GGUF:Q4_K_M' },
      { tool: 'llama.cpp', label: 'llama.cpp', command: 'llama-server -hf unsloth/Qwen3.5-27B-GGUF:Q4_K_M' },
    ]);
    expect(r).toMatchObject({ repo: 'unsloth/Qwen3.5-27B-GGUF', tag: 'Q4_K_M', sharded: false, vision: false });
  });

  it('returns null without a verified repo', () => {
    expect(runCommands(row({ gguf_repo: null, gguf_shards: null }))).toBeNull();
    expect(runCommands(row({ gguf_repo: undefined }))).toBeNull();
    expect(runCommands(null)).toBeNull();
  });

  it('refuses repo strings that are not owner/name (nothing shell-like reaches the page)', () => {
    for (const bad of ['unsloth', 'a/b/c', 'unsloth/Foo GGUF', 'x/y;rm -rf ~', '/x', '']) {
      expect(runCommands(row({ gguf_repo: bad }))).toBeNull();
    }
  });

  it('gives sharded GGUFs only the llama.cpp command (the Hub refuses shards to Ollama)', () => {
    // Mistral Large 4 Q8_0: 24 shards; -hf downloads the whole set from the tag
    const r = runCommands(row({ gguf_repo: 'ggml-org/Mistral-Large-4-1T-A52B-GGUF', quantization: 'Q8_0', gguf_shards: 24 }));
    expect(r.sharded).toBe(true);
    expect(r.commands).toEqual([
      { tool: 'llama.cpp', label: 'llama.cpp', command: 'llama-server -hf ggml-org/Mistral-Large-4-1T-A52B-GGUF:Q8_0' },
    ]);
  });

  it('treats a missing shard count as one file', () => {
    expect(runCommands(row({ gguf_shards: undefined })).commands).toHaveLength(2);
  });

  it('keeps UD- quant names whole, so they never collapse to Q4_K_M', () => {
    const r = runCommands(row({ quantization: 'UD-Q4_K_XL' }));
    expect(r.tag).toBe('UD-Q4_K_XL');
    expect(r.commands[0].command).toBe('ollama run hf.co/unsloth/Qwen3.5-27B-GGUF:UD-Q4_K_XL');
    expect(r.commands[1].command).toBe('llama-server -hf unsloth/Qwen3.5-27B-GGUF:UD-Q4_K_XL');
  });

  it('needs no extra flag for a vision model: both tools fetch the mmproj themselves', () => {
    const r = runCommands(row({ id: 'lfm3-vl-2b-q8', quantization: 'Q8_0', gguf_repo: 'LiquidAI/LFM3-VL-2B-GGUF', features: ['vision'] }));
    expect(r.vision).toBe(true);
    expect(r.commands.map((c) => c.command)).toEqual([
      'ollama run hf.co/LiquidAI/LFM3-VL-2B-GGUF:Q8_0',
      'llama-server -hf LiquidAI/LFM3-VL-2B-GGUF:Q8_0',
    ]);
    expect(r.commands.some((c) => c.command.includes('mmproj'))).toBe(false);
  });

  it('maps fp16 rows to the F16 filename tag', () => {
    expect(runCommands(row({ quantization: 'fp16' })).tag).toBe('F16');
  });
});

describe('runTag', () => {
  it('maps every stored quantization', () => {
    expect(RUN_TAGS).toEqual({ Q4_K_M: 'Q4_K_M', Q4_K_S: 'Q4_K_S', Q8_0: 'Q8_0', fp16: 'F16' });
  });

  it('rejects names that are not a filename token', () => {
    expect(runTag('Q4 K M')).toBeNull();
    expect(runTag('')).toBeNull();
    expect(runTag(undefined)).toBeNull();
  });
});

describe('runCommands over models.json', () => {
  it('gives every row with a gguf_repo at least the llama.cpp command', () => {
    for (const m of models.filter((m) => m.gguf_repo)) {
      const r = runCommands(m);
      expect(r, m.id).not.toBeNull();
      expect(r.commands.at(-1).command).toBe(`llama-server -hf ${m.gguf_repo}:${RUN_TAGS[m.quantization]}`);
    }
  });
});
