import { describe, it, expect } from 'vitest';
import models from './models.json';
import gpus from './gpus.json';
import releases from './releases.json';
import { DATA_UPDATED } from '../pages.js';

// ---------------------------------------------------------------------------
// Allowed values
// ---------------------------------------------------------------------------

const VALID_FEATURES = ['vision', 'reasoning', 'tool_use'];
const VALID_QUANTIZATIONS = ['Q4_K_M', 'Q4_K_S', 'Q8_0', 'fp16'];
const VALID_MANUFACTURERS = ['NVIDIA', 'AMD', 'Intel', 'Apple'];

// ---------------------------------------------------------------------------
// models.json
// ---------------------------------------------------------------------------

describe('models.json', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  });

  it('has no duplicate IDs', () => {
    const ids = models.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(models)('$id', (model) => {
    // --- required fields exist ---
    it('has a kebab-case string id (dots allowed for versions)', () => {
      expect(typeof model.id).toBe('string');
      expect(model.id).toMatch(/^[a-z0-9]+([-.][a-z0-9]+)*$/);
    });

    it('has a non-empty name', () => {
      expect(typeof model.name).toBe('string');
      expect(model.name.length).toBeGreaterThan(0);
    });

    it('has a valid quantization', () => {
      expect(VALID_QUANTIZATIONS).toContain(model.quantization);
    });

    // --- numeric fields in range ---
    it('has params_b > 0', () => {
      expect(model.params_b).toBeGreaterThan(0);
    });

    it('has weight_gb between 0.1 and 2000', () => {
      expect(model.weight_gb).toBeGreaterThanOrEqual(0.1);
      expect(model.weight_gb).toBeLessThanOrEqual(2000);
    });

    it('has kv_per_1k_gb between 0 and 2', () => {
      expect(model.kv_per_1k_gb).toBeGreaterThanOrEqual(0);
      expect(model.kv_per_1k_gb).toBeLessThanOrEqual(2);
    });

    it('has max_context_k > 0', () => {
      expect(model.max_context_k).toBeGreaterThan(0);
    });

    it('has mmlu_score that is null, undefined, or a number 0–100', () => {
      if (model.mmlu_score != null) {
        expect(model.mmlu_score).toBeGreaterThanOrEqual(0);
        expect(model.mmlu_score).toBeLessThanOrEqual(100);
      }
    });

    it('has swe_bench_score that is null, undefined, or a number 0–100', () => {
      if (model.swe_bench_score != null) {
        expect(model.swe_bench_score).toBeGreaterThanOrEqual(0);
        expect(model.swe_bench_score).toBeLessThanOrEqual(100);
      }
    });

    // --- features ---
    it('has a features array with only known values', () => {
      expect(Array.isArray(model.features)).toBe(true);
      for (const f of model.features) {
        expect(VALID_FEATURES).toContain(f);
      }
    });

    it('has no duplicate features', () => {
      expect(new Set(model.features).size).toBe(model.features.length);
    });

    // --- run-command source ---
    it('has gguf_repo: null or a Hugging Face owner/name', () => {
      expect(model).toHaveProperty('gguf_repo');
      if (model.gguf_repo !== null) {
        expect(model.gguf_repo).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/);
      }
    });

    it('has gguf_shards: a file count when gguf_repo is set, else null', () => {
      if (model.gguf_repo === null) {
        expect(model.gguf_shards).toBeNull();
      } else {
        expect(Number.isInteger(model.gguf_shards)).toBe(true);
        expect(model.gguf_shards).toBeGreaterThanOrEqual(1);
      }
    });

    // --- notes ---
    it('has a non-empty notes string', () => {
      expect(typeof model.notes).toBe('string');
      expect(model.notes.length).toBeGreaterThan(0);
    });

    // --- weight sanity: Q4 < Q8 < fp16 ---
    it('has weight_gb consistent with quantization (lighter quant = smaller file)', () => {
      // Find variants of the same model name
      const variants = models.filter((m) => m.name === model.name);
      if (variants.length <= 1) return;

      const q4 = variants.find((m) => m.quantization === 'Q4_K_M');
      const q8 = variants.find((m) => m.quantization === 'Q8_0');
      const fp16 = variants.find((m) => m.quantization === 'fp16');

      if (q4 && q8) expect(q4.weight_gb).toBeLessThan(q8.weight_gb);
      if (q8 && fp16) expect(q8.weight_gb).toBeLessThan(fp16.weight_gb);
      if (q4 && fp16) expect(q4.weight_gb).toBeLessThan(fp16.weight_gb);
    });
  });

  // --- cross-variant consistency ---
  describe('cross-variant consistency', () => {
    /** Group models by name so we can compare quant variants */
    const byName = Object.groupBy(models, (m) => m.name);

    it.each(Object.entries(byName))(
      '%s variants share the same params_b',
      (_name, variants) => {
        const values = new Set(variants.map((m) => m.params_b));
        expect(values.size).toBe(1);
      },
    );

    it.each(Object.entries(byName))(
      '%s variants share the same max_context_k',
      (_name, variants) => {
        const values = new Set(variants.map((m) => m.max_context_k));
        expect(values.size).toBe(1);
      },
    );

    it.each(Object.entries(byName))(
      '%s variants share the same mmlu_score',
      (_name, variants) => {
        const values = new Set(variants.map((m) => m.mmlu_score));
        expect(values.size).toBe(1);
      },
    );

    it.each(Object.entries(byName))(
      '%s variants share the same swe_bench_score',
      (_name, variants) => {
        const values = new Set(variants.map((m) => m.swe_bench_score));
        expect(values.size).toBe(1);
      },
    );

    it.each(Object.entries(byName))(
      '%s variants share the same kv_per_1k_gb',
      (_name, variants) => {
        const values = new Set(variants.map((m) => m.kv_per_1k_gb));
        expect(values.size).toBe(1);
      },
    );

    it.each(Object.entries(byName))(
      '%s variants share the same features',
      (_name, variants) => {
        const serialized = new Set(variants.map((m) => JSON.stringify([...m.features].sort())));
        expect(serialized.size).toBe(1);
      },
    );

    // MoE tok/s uses active_weight_gb; a variant without it falls back to the
    // full weight_gb and its speed is understated several-fold.
    it.each(Object.entries(byName))(
      '%s variants all have active_weight_gb or none do',
      (_name, variants) => {
        const withActive = variants.filter((m) => m.active_weight_gb != null);
        expect([0, variants.length]).toContain(withActive.length);
      },
    );

    it.each(Object.entries(byName))(
      '%s variants have smaller active_weight_gb for lighter quants',
      (_name, variants) => {
        if (variants.some((m) => m.active_weight_gb == null)) return;
        const sorted = [...variants].sort((a, b) => a.weight_gb - b.weight_gb);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i - 1].active_weight_gb).toBeLessThan(sorted[i].active_weight_gb);
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// gpus.json
// ---------------------------------------------------------------------------

describe('gpus.json', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(gpus)).toBe(true);
    expect(gpus.length).toBeGreaterThan(0);
  });

  it('has no duplicate IDs', () => {
    const ids = gpus.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The `mem` URL param is a size in GB, with legacy option indices as a
  // fallback (memOptionIndex in pages.js). That only works while no size
  // can be mistaken for an index.
  it('has every memory option larger than any option index', () => {
    const multi = gpus.filter((g) => g.vram_options);
    const maxOptions = Math.max(...multi.map((g) => g.vram_options.length));
    for (const gpu of multi) {
      for (const opt of gpu.vram_options) expect(opt.vram_gb).toBeGreaterThan(maxOptions);
    }
  });

  describe.each(gpus)('$id', (gpu) => {
    it('has a kebab-case string id', () => {
      expect(typeof gpu.id).toBe('string');
      expect(gpu.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });

    it('has a non-empty name', () => {
      expect(typeof gpu.name).toBe('string');
      expect(gpu.name.length).toBeGreaterThan(0);
    });

    it('has a valid manufacturer', () => {
      expect(VALID_MANUFACTURERS).toContain(gpu.manufacturer);
    });

    it('has msrp_usd (null or a positive US dollar amount)', () => {
      expect(gpu).toHaveProperty('msrp_usd');
      if (gpu.msrp_usd !== null) {
        expect(typeof gpu.msrp_usd).toBe('number');
        expect(gpu.msrp_usd).toBeGreaterThan(0);
        expect(gpu.msrp_usd).toBeLessThanOrEqual(50000);
      }
    });

    it('has amazon_search (null or a plain search phrase)', () => {
      expect(gpu).toHaveProperty('amazon_search');
      if (gpu.amazon_search !== null) {
        expect(typeof gpu.amazon_search).toBe('string');
        expect(gpu.amazon_search.trim()).not.toBe('');
        // The affiliate tag is added by src/lib/affiliate.js, never stored in the data
        expect(gpu.amazon_search).not.toMatch(/:\/\/|tag=/);
      }
    });

    if (gpu.vram_options) {
      it('has vram_options array (unified memory GPU)', () => {
        expect(Array.isArray(gpu.vram_options)).toBe(true);
        expect(gpu.vram_options.length).toBeGreaterThan(0);
      });

      it('does not have top-level vram_gb or bandwidth_gbps', () => {
        expect(gpu.vram_gb).toBeUndefined();
        expect(gpu.bandwidth_gbps).toBeUndefined();
      });

      it('has valid vram_options entries', () => {
        for (const opt of gpu.vram_options) {
          expect(opt.vram_gb).toBeGreaterThan(0);
          expect(opt.vram_gb).toBeLessThanOrEqual(512);
          expect(opt.bandwidth_gbps).toBeGreaterThan(0);
          expect(opt.bandwidth_gbps).toBeLessThanOrEqual(2000);
        }
      });

      it('has vram_options sorted by vram_gb ascending', () => {
        for (let i = 1; i < gpu.vram_options.length; i++) {
          expect(gpu.vram_options[i].vram_gb).toBeGreaterThan(
            gpu.vram_options[i - 1].vram_gb,
          );
        }
      });
    } else {
      it('has vram_gb between 1 and 256 (discrete GPU)', () => {
        expect(gpu.vram_gb).toBeGreaterThanOrEqual(1);
        expect(gpu.vram_gb).toBeLessThanOrEqual(256);
      });

      it('has bandwidth_gbps between 50 and 2000 (discrete GPU)', () => {
        expect(gpu.bandwidth_gbps).toBeGreaterThanOrEqual(50);
        expect(gpu.bandwidth_gbps).toBeLessThanOrEqual(2000);
      });

      it('does not have vram_options', () => {
        expect(gpu.vram_options).toBeUndefined();
      });
    }
  });
});

// ---------------------------------------------------------------------------
// releases.json ("What's new"; scripts/releases/build_release.py drafts entries)
// ---------------------------------------------------------------------------

describe('releases.json', () => {
  const RELEASE_KEYS = ['corrections', 'date', 'gpus_added', 'models_added', 'summary', 'title'];
  const modelNames = new Set(models.map((m) => m.name));
  const gpuIds = new Set(gpus.map((g) => g.id));

  it('is a non-empty array', () => {
    expect(Array.isArray(releases)).toBe(true);
    expect(releases.length).toBeGreaterThan(0);
  });

  it('has unique ISO dates, newest first', () => {
    const dates = releases.map((r) => r.date);
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // A real calendar day (no 2026-02-30)
      expect(new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10), d).toBe(d);
    }
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('starts with the current data release (add an entry whenever DATA_UPDATED moves)', () => {
    expect(releases[0].date).toBe(DATA_UPDATED);
  });

  describe.each(releases)('$date', (release) => {
    it('has exactly the known keys', () => {
      expect(Object.keys(release).sort()).toEqual(RELEASE_KEYS);
    });

    it('has a title and summary of sensible length, and no draft placeholders', () => {
      expect(release.title.length).toBeGreaterThan(0);
      expect(release.title.length).toBeLessThanOrEqual(80);
      expect(release.summary.length).toBeGreaterThan(20);
      expect(release.summary.length).toBeLessThanOrEqual(300);
      expect(JSON.stringify(release)).not.toMatch(/TODO/);
    });

    it('names only models that exist in models.json, once each', () => {
      for (const name of release.models_added) expect(modelNames, name).toContain(name);
      expect(new Set(release.models_added).size).toBe(release.models_added.length);
    });

    it('names only GPU ids that exist in gpus.json, once each', () => {
      for (const id of release.gpus_added) expect(gpuIds, id).toContain(id);
      expect(new Set(release.gpus_added).size).toBe(release.gpus_added.length);
    });

    it('has corrections as non-empty sentences', () => {
      expect(Array.isArray(release.corrections)).toBe(true);
      for (const c of release.corrections) {
        expect(typeof c).toBe('string');
        expect(c.trim().length).toBeGreaterThan(0);
      }
    });

    it('changes something', () => {
      expect(release.models_added.length + release.gpus_added.length + release.corrections.length).toBeGreaterThan(0);
    });
  });

  it('adds each model and GPU at most once across releases', () => {
    const names = releases.flatMap((r) => r.models_added);
    const ids = releases.flatMap((r) => r.gpus_added);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
