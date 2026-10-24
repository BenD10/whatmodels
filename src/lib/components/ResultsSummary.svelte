<script>
  import { base } from '$app/paths';
  import { contextLabel, tokLabel } from '$lib/calculations.js';
  import { modelSlug } from '$lib/pages.js';

  /** @type {{ summary: ReturnType<typeof import('$lib/calculations.js').summarizeResults>, showTopPicks?: boolean }} */
  let { summary, showTopPicks = true } = $props();

  // Status order and wording match the result groups below; icons back up color
  const STATUSES = [
    { key: 'fits', label: 'Run well', icon: '✓' },
    { key: 'tight', label: 'Tight fit', icon: '!' },
    { key: 'noFit', label: "Can't run", icon: '✕' },
  ];

  let segments = $derived(STATUSES.map((s) => ({ ...s, count: summary.counts[s.key] })));

  let ariaLabel = $derived(segments.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(', '));

  let tiles = $derived(
    [
      showTopPicks && summary.bestGeneral && {
        label: 'Best for general use',
        model: summary.bestGeneral,
        meta: `MMLU ${summary.bestGeneral.mmlu_score}`,
      },
      showTopPicks && summary.bestCoding && {
        label: 'Best for coding',
        model: summary.bestCoding,
        meta: `SWE-bench ${summary.bestCoding.swe_bench_score}`,
      },
      summary.largest && {
        label: 'Largest that runs well',
        model: summary.largest,
        meta: `${summary.largest.params_b}B params`,
      },
      summary.fastest && {
        label: 'Fastest good-quality model',
        model: summary.fastest,
        meta: tokLabel(summary.fastest.tokPerSec),
      },
    ].filter(Boolean)
  );
</script>

<section class="overview" aria-label="Results overview">
  <div class="bar" role="img" aria-label={ariaLabel}>
    {#each segments as s}
      {#if s.count > 0}
        <a
          href="#group-{s.key}"
          class="seg seg-{s.key}"
          style="flex-grow: {s.count}"
          title="{s.label}: {s.count} models"
          aria-hidden="true"
          tabindex="-1"
        ></a>
      {/if}
    {/each}
  </div>

  <ul class="legend">
    {#each segments as s}
      <li>
        {#snippet content()}
          <span class="icon icon-{s.key}" aria-hidden="true">{s.icon}</span>
          <span class="legend-count">{s.count}</span>
          <span class="legend-label">{s.label.toLowerCase()}</span>
        {/snippet}
        <!-- An empty status has no group to jump to -->
        {#if s.count > 0}
          <a href="#group-{s.key}" class="legend-item">{@render content()}</a>
        {:else}
          <span class="legend-item empty">{@render content()}</span>
        {/if}
      </li>
    {/each}
  </ul>
  <p class="caption">{summary.total} models, each counted once by the best way it runs on your hardware.</p>

  {#if tiles.length > 0}
    <div class="tiles">
      {#each tiles as t}
        <div class="tile">
          <span class="tile-label">{t.label}</span>
          <a class="tile-value" href="{base}/model/{modelSlug(t.model.name)}">{t.model.name}</a>
          <span class="tile-meta">
            {t.meta} · {t.model.quantization} · {contextLabel(t.model.maxCtxK)} context
          </span>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .overview {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  /* Stacked bar: segments sized by count, 2px surface gap, rounded outer ends */
  .bar {
    display: flex;
    gap: 2px;
    height: 14px;
    border-radius: 4px;
    overflow: hidden;
  }

  .seg {
    min-width: 6px;
    flex-basis: 0;
    transition: opacity 0.15s;
  }

  .seg:hover {
    opacity: 0.8;
  }

  .seg-fits { background: var(--fits); }
  .seg-tight { background: var(--tight); }
  .seg-noFit { background: var(--no-fit); }

  .legend {
    list-style: none;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 1.25rem;
  }

  .legend-item {
    display: inline-flex;
    align-items: baseline;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--text-muted);
    text-decoration: none;
  }

  a.legend-item:hover .legend-label {
    color: var(--text);
    text-decoration: underline;
  }

  .legend-item.empty {
    opacity: 0.6;
  }

  .icon {
    font-weight: 700;
    font-size: 0.8rem;
    width: 1em;
    text-align: center;
  }

  .icon-fits { color: var(--fits); }
  .icon-tight { color: var(--tight); }
  .icon-noFit { color: var(--no-fit); }

  .legend-count {
    font-weight: 700;
    color: var(--text);
  }

  .caption {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: -0.3rem;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.6rem;
    margin-top: 0.25rem;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.65rem 0.85rem;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    min-width: 0;
  }

  .tile-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-muted);
  }

  .tile-value {
    font-weight: 600;
    color: var(--text);
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  .tile-value:hover {
    color: var(--accent);
    text-decoration: underline;
  }

  .tile-meta {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
</style>
