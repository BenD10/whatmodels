<script>
  import allModels from '$lib/data/models.json';

  let { vram, bandwidth = null, minContextK = null, minTokPerSec = null } = $props();

  /**
   * For a given model and user VRAM, calculate the max context (in K tokens)
   * that fits. Capped at the model's trained max_context_k.
   */
  function calcMaxContext(model, userVram) {
    const availableForKv = userVram - model.weight_gb;
    if (availableForKv <= 0) return 0;
    const maxTokensK = availableForKv / model.kv_per_1k_gb;
    return Math.min(Math.floor(maxTokensK), model.max_context_k);
  }

  /**
   * Estimate decode tokens/sec from memory bandwidth.
   * During autoregressive generation, every token requires reading all weights
   * plus additional memory for KV cache reads, activations, and engine overhead.
   * tok/s ≈ bandwidth / (weight_gb + overhead)
   *
   * The overhead constant (≈ 1 GB) was empirically derived from real-world
   * benchmarks on consumer GPUs using llama.cpp-based engines.
   */
  const INFERENCE_OVERHEAD_GB = 1.0;

  function calcTokPerSec(model, bw) {
    if (bw == null) return null;
    return Math.round(bw / (model.weight_gb + INFERENCE_OVERHEAD_GB));
  }

  function contextLabel(k) {
    if (k >= 1000) return `${(k / 1000).toFixed(0)}M`;
    return `${k}K`;
  }

  function tokLabel(tps) {
    if (tps == null) return null;
    return `~${tps} tok/s`;
  }

  let results = $derived.by(() => {
    if (vram == null) return null;

    const entries = allModels.map((m) => {
      const maxCtxK = calcMaxContext(m, vram);
      const totalAtMinCtx = m.weight_gb + m.kv_per_1k_gb; // 1K min context
      const fitsAtAll = vram >= totalAtMinCtx;
      const meetsMinCtx = minContextK != null ? maxCtxK >= minContextK : true;
      const tokPerSec = calcTokPerSec(m, bandwidth);
      const meetsMinSpeed = minTokPerSec != null && tokPerSec != null ? tokPerSec >= minTokPerSec : true;
      return { ...m, maxCtxK, fitsAtAll, meetsMinCtx, meetsMinSpeed, tokPerSec };
    });

    const fits = [];
    const tight = [];
    const noFit = [];

    for (const e of entries) {
      if (!e.fitsAtAll) {
        noFit.push(e);
      } else if (!e.meetsMinCtx || !e.meetsMinSpeed) {
        tight.push(e);
      } else if (e.maxCtxK < 4) {
        // Less than 4K context is a tight fit regardless
        tight.push(e);
      } else {
        fits.push(e);
      }
    }

    fits.sort((a, b) => b.maxCtxK - a.maxCtxK);
    tight.sort((a, b) => b.maxCtxK - a.maxCtxK);
    noFit.sort((a, b) => (b.vram ?? 0) - (a.vram ?? 0));

    return { fits, tight, noFit };
  });

  let totalFit = $derived(results ? results.fits.length + results.tight.length : 0);
</script>

{#if results == null}
  <section class="empty">
    <p>Select a GPU or enter your VRAM to see which models you can run.</p>
  </section>
{:else}
  <section class="results">
    <p class="summary">
      <strong>{totalFit}</strong> of {allModels.length} model configurations can run on
      <strong>{vram} GB</strong>
      {#if minContextK != null} with at least <strong>{contextLabel(minContextK)}</strong> context{/if}
      {#if minTokPerSec != null} at <strong>{minTokPerSec}+ tok/s</strong>{/if}
    </p>

    {#if results.fits.length > 0}
      <div class="group fits">
        <h3>Runs well</h3>
        <ul>
          {#each results.fits as m}
            <li>
              <div class="model-row">
                <div class="model-info">
                  <span class="model-name">{m.name}</span>
                  <span class="badge quant">{m.quantization}</span>
                  <span class="badge params">{m.params_b}B</span>
                </div>
                <div class="model-stats">
                  <span class="stat">
                    <span class="stat-label">Weights</span>
                    <span class="stat-value">{m.weight_gb} GB</span>
                  </span>
                  <span class="stat context">
                    <span class="stat-label">Max context</span>
                    <span class="stat-value">{contextLabel(m.maxCtxK)}</span>
                  </span>
                  {#if m.tokPerSec != null}
                    <span class="stat speed">
                      <span class="stat-label">Est. speed</span>
                      <span class="stat-value">{tokLabel(m.tokPerSec)}</span>
                    </span>
                  {/if}
                </div>
              </div>
              {#if m.notes}<p class="notes">{m.notes}</p>{/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if results.tight.length > 0}
      <div class="group tight">
        <h3>Tight fit</h3>
        <ul>
          {#each results.tight as m}
            <li>
              <div class="model-row">
                <div class="model-info">
                  <span class="model-name">{m.name}</span>
                  <span class="badge quant">{m.quantization}</span>
                  <span class="badge params">{m.params_b}B</span>
                </div>
                <div class="model-stats">
                  <span class="stat">
                    <span class="stat-label">Weights</span>
                    <span class="stat-value">{m.weight_gb} GB</span>
                  </span>
                  <span class="stat context">
                    <span class="stat-label">Max context</span>
                    <span class="stat-value">{m.maxCtxK > 0 ? contextLabel(m.maxCtxK) : '—'}</span>
                  </span>
                  {#if m.tokPerSec != null}
                    <span class="stat speed">
                      <span class="stat-label">Est. speed</span>
                      <span class="stat-value">{tokLabel(m.tokPerSec)}</span>
                    </span>
                  {/if}
                </div>
              </div>
              {#if !m.meetsMinCtx && m.fitsAtAll}
                <p class="reason">Only {contextLabel(m.maxCtxK)} context — below your {contextLabel(minContextK)} minimum</p>
              {:else if m.maxCtxK < 4}
                <p class="reason">Very limited context window ({contextLabel(m.maxCtxK)})</p>
              {/if}
              {#if !m.meetsMinSpeed && m.tokPerSec != null}
                <p class="reason">~{m.tokPerSec} tok/s — below your {minTokPerSec} tok/s minimum</p>
              {/if}
              {#if m.notes}<p class="notes">{m.notes}</p>{/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if results.noFit.length > 0}
      <div class="group no-fit">
        <h3>Doesn't fit</h3>
        <ul>
          {#each results.noFit as m}
            <li>
              <div class="model-row">
                <div class="model-info">
                  <span class="model-name">{m.name}</span>
                  <span class="badge quant">{m.quantization}</span>
                  <span class="badge params">{m.params_b}B</span>
                </div>
                <div class="model-stats">
                  <span class="stat">
                    <span class="stat-label">Weights</span>
                    <span class="stat-value">{m.weight_gb} GB</span>
                  </span>
                  <span class="stat context">
                    <span class="stat-label">Need</span>
                    <span class="stat-value">{(m.weight_gb + m.kv_per_1k_gb).toFixed(1)} GB+</span>
                  </span>
                </div>
              </div>
              <p class="reason">Weights alone need {m.weight_gb} GB — {(m.weight_gb - vram).toFixed(1)} GB over budget</p>
              {#if m.notes}<p class="notes">{m.notes}</p>{/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </section>
{/if}

<style>
  .empty {
    padding: 2rem;
    text-align: center;
    color: var(--text-muted);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .summary {
    font-size: 0.95rem;
    color: var(--text-muted);
  }

  .summary strong {
    color: var(--text);
  }

  /* Groups */
  .group {
    padding: 1rem 1.25rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .group.fits {
    background: var(--fits-dim);
    border-color: var(--fits-border);
  }

  .group.tight {
    background: var(--tight-dim);
    border-color: var(--tight-border);
  }

  .group.no-fit {
    background: var(--no-fit-dim);
    border-color: var(--no-fit-border);
  }

  .group h3 {
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.75rem;
  }

  .group.fits h3 { color: var(--fits); }
  .group.tight h3 { color: var(--tight); }
  .group.no-fit h3 { color: var(--no-fit); }

  /* List */
  ul {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  li {
    padding: 0.65rem 0.85rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-sm);
  }

  .model-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .model-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .model-name {
    font-weight: 600;
  }

  .badge {
    font-size: 0.75rem;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    font-weight: 500;
  }

  .badge.quant {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .badge.params {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-muted);
  }

  .model-stats {
    display: flex;
    gap: 1rem;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-size: 0.8rem;
    line-height: 1.3;
  }

  .stat-label {
    color: var(--text-muted);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .stat-value {
    font-weight: 600;
  }

  .stat.context .stat-value {
    color: var(--accent);
  }

  .stat.speed .stat-value {
    color: var(--fits);
  }

  .reason {
    margin-top: 0.3rem;
    font-size: 0.8rem;
    font-style: italic;
    color: var(--text-muted);
  }

  .notes {
    margin-top: 0.2rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    opacity: 0.7;
  }
</style>
