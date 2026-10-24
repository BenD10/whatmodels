<script>
  import { base } from '$app/paths';
  import gpus from '$lib/data/gpus.json';
  import { TIGHT_FIT_CONTEXT_K, calcVramForContext, contextLabel, gpusForModel, tokLabel } from '$lib/calculations.js';
  import { SITE_NAME, SITE_URL, breadcrumbLd, gpuShortName, jsonLdScript } from '$lib/pages.js';

  let { data } = $props();

  const FEATURE_LABELS = { vision: 'Vision', reasoning: 'Reasoning', tool_use: 'Tool use' };
  const MID_CONTEXT_K = 32;

  let model = $derived(data.model);
  let variants = $derived(model.variants); // smallest weights first
  let smallest = $derived(variants[0]);
  let isMoe = $derived(variants.some((v) => v.active_weight_gb != null));
  let showMidContext = $derived(model.max_context_k > MID_CONTEXT_K);

  let runners = $derived(gpusForModel(variants, gpus));
  let runnersWell = $derived(runners.filter((r) => r.status === 'fits'));
  let cheapest = $derived(
    runnersWell.reduce((best, r) => (best == null || r.config.vram < best.config.vram ? r : best), null)
  );

  // Manufacturers in gpus.json order; GPUs within each by memory ascending
  let byManufacturer = $derived.by(() => {
    const groups = new Map();
    for (const r of runners) {
      if (!groups.has(r.gpu.manufacturer)) groups.set(r.gpu.manufacturer, []);
      groups.get(r.gpu.manufacturer).push(r);
    }
    for (const list of groups.values()) list.sort((a, b) => a.config.vram - b.config.vram || a.gpu.name.localeCompare(b.gpu.name));
    return [...groups.entries()];
  });

  let path = $derived(`/model/${model.slug}`);
  let title = $derived(`What GPU do you need to run ${model.name}?`);
  let description = $derived(
    `${model.name} needs ${calcVramForContext(smallest, TIGHT_FIT_CONTEXT_K).toFixed(1)} GB of VRAM at ${smallest.quantization} with ${contextLabel(TIGHT_FIT_CONTEXT_K)} context. ` +
      `See VRAM per quantization and which of ${gpus.length} GPUs can run it, with context and tokens/sec estimates.`
  );

  let jsonLd = $derived({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: title,
        url: `${SITE_URL}${path}`,
        description,
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
      },
      breadcrumbLd([
        { name: SITE_NAME, path: '/' },
        { name: 'Models', path: '/models' },
        { name: model.name, path },
      ]),
    ],
  });
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href="{SITE_URL}{path}" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="{SITE_URL}{path}" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:site_name" content={SITE_NAME} />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />

  <!-- Structured Data -->
  {@html jsonLdScript(jsonLd)}
</svelte:head>

<article class="page">
  <nav class="crumbs" aria-label="Breadcrumb">
    <a href="{base}/models">Models</a> <span aria-hidden="true">/</span> {model.name}
  </nav>

  <header>
    <h2>{title}</h2>
    <div class="badges">
      <span class="badge params">{model.params_b}B params</span>
      <span class="badge params">{contextLabel(model.max_context_k)} max context</span>
      {#each model.features as feat}
        <span class="badge feature feature-{feat}">{FEATURE_LABELS[feat] ?? feat}</span>
      {/each}
    </div>
    <p class="intro">
      {#if cheapest}
        The smallest GPU memory that runs {model.name} well is <strong>{cheapest.config.vram} GB</strong>
        ({cheapest.variant.quantization}, e.g. {cheapest.gpu.name}).
        <strong>{runnersWell.length}</strong> of {gpus.length} GPUs run it well{#if runners.length > runnersWell.length}{' '}and
          <strong>{runners.length - runnersWell.length}</strong> more are a tight fit{/if}.
      {:else if runners.length > 0}
        No single GPU in our database runs {model.name} comfortably; <strong>{runners.length}</strong> can load it with very limited context.
      {:else}
        {model.name} doesn't fit on any single GPU in our database. Try multiple GPUs or system RAM offloading in the full tool.
      {/if}
      {#if isMoe}
        It's a mixture-of-experts model, so all weights must fit in memory but speed depends only on the active experts.
      {/if}
    </p>
    {#if model.mmlu_score != null || model.swe_bench_score != null}
      <p class="scores">
        {#if model.mmlu_score != null}<span>MMLU <strong>{model.mmlu_score}</strong></span>{/if}
        {#if model.swe_bench_score != null}<span>SWE-bench Verified <strong>{model.swe_bench_score}</strong></span>{/if}
      </p>
    {/if}
  </header>

  <section>
    <h3>VRAM needed per quantization</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Quantization</th>
            <th>Weights</th>
            <th>{contextLabel(TIGHT_FIT_CONTEXT_K)} context</th>
            {#if showMidContext}<th>{contextLabel(MID_CONTEXT_K)} context</th>{/if}
            <th>Full {contextLabel(model.max_context_k)}</th>
          </tr>
        </thead>
        <tbody>
          {#each variants as v}
            <tr>
              <td><span class="badge quant">{v.quantization}</span></td>
              <td>{v.weight_gb.toFixed(1)} GB</td>
              <td><strong>{calcVramForContext(v, TIGHT_FIT_CONTEXT_K).toFixed(1)} GB</strong></td>
              {#if showMidContext}<td>{calcVramForContext(v, MID_CONTEXT_K).toFixed(1)} GB</td>{/if}
              <td>{calcVramForContext(v, v.max_context_k).toFixed(1)} GB</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="note">Weights plus fp16 KV cache. Leave ~1 GB headroom for the inference engine.</p>
  </section>

  <section>
    <h3>GPUs that can run {model.name}</h3>
    {#if runners.length === 0}
      <p class="note">None on its own — <a href="{base}/">open the tool</a> to try multiple GPUs or system RAM offloading.</p>
    {:else}
      <p class="note">Best quantization that fits on each GPU, with the context and speed it gets. For chips with several memory sizes, the smallest that works is shown.</p>
      {#each byManufacturer as [manufacturer, list]}
        <h4>{manufacturer}</h4>
        <ul class="gpu-list">
          {#each list as r}
            <li class:tight={r.status === 'tight'}>
              <a href="{base}/gpu/{r.gpu.id}" class="gpu-name">{gpuShortName(r.gpu)}</a>
              <span class="gpu-mem">{r.config.vram} GB</span>
              <span class="badge quant">{r.variant.quantization}</span>
              <span class="gpu-stats">
                {r.variant.maxCtxK > 0 ? contextLabel(r.variant.maxCtxK) : '—'} context{#if r.variant.tokPerSec != null}{' '}· {tokLabel(r.variant.tokPerSec)}{/if}
                {#if r.status === 'tight'}<span class="tight-label">tight fit</span>{/if}
              </span>
            </li>
          {/each}
        </ul>
      {/each}
    {/if}
  </section>

  <a class="cta" href="{base}/">Check your exact setup in the full tool →</a>
</article>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .crumbs {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  a {
    color: var(--accent);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  h2 {
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.25;
    margin-bottom: 0.6rem;
  }

  h3 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.6rem;
  }

  h4 {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    margin: 1rem 0 0.4rem;
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-bottom: 0.75rem;
  }

  .badge {
    font-size: 0.75rem;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    font-weight: 500;
  }

  .badge.params {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-muted);
  }

  .badge.quant {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .badge.feature {
    font-size: 0.68rem;
    font-weight: 600;
  }

  .badge.feature-vision {
    background: rgba(0, 188, 212, 0.15);
    color: #4dd0e1;
  }

  .badge.feature-reasoning {
    background: rgba(233, 30, 99, 0.15);
    color: #f06292;
  }

  .badge.feature-tool_use {
    background: rgba(255, 152, 0, 0.15);
    color: #ffb74d;
  }

  .intro,
  .note {
    color: var(--text-muted);
  }

  .note {
    font-size: 0.8rem;
    margin-top: 0.5rem;
  }

  .intro strong,
  .scores strong {
    color: var(--text);
  }

  .scores {
    display: flex;
    gap: 1.25rem;
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  th,
  td {
    text-align: left;
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  th {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-muted);
  }

  .gpu-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .gpu-list li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.6rem;
    padding: 0.45rem 0.75rem;
    font-size: 0.85rem;
    background: var(--fits-dim);
    border: 1px solid var(--fits-border);
    border-radius: var(--radius-sm);
  }

  .gpu-list li.tight {
    background: var(--tight-dim);
    border-color: var(--tight-border);
  }

  .gpu-name {
    font-weight: 600;
  }

  .gpu-mem {
    color: var(--text-muted);
  }

  .gpu-stats {
    margin-left: auto;
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .tight-label {
    color: var(--tight);
    margin-left: 0.4rem;
  }

  .cta {
    align-self: flex-start;
    padding: 0.55rem 0.9rem;
    font-size: 0.9rem;
    font-weight: 600;
    background: var(--accent-dim);
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
  }

  .cta:hover {
    text-decoration: none;
    background: rgba(107, 138, 255, 0.2);
  }

  @media (max-width: 600px) {
    h2 {
      font-size: 1.2rem;
    }

    .gpu-stats {
      margin-left: 0;
      width: 100%;
    }

    .cta {
      align-self: stretch;
      text-align: center;
    }
  }
</style>
