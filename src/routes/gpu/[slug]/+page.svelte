<script>
  import { base } from '$app/paths';
  import allModels from '$lib/data/models.json';
  import { bucketModels, contextLabel, gpuConfigs, groupVariants, summarizeResults, tokLabel, topModelsByScore, upgradeOptionsFor } from '$lib/calculations.js';
  import gpus from '$lib/data/gpus.json';
  import { SITE_NAME, SITE_URL, breadcrumbLd, gpuShortName, gpuVramLabel, indefiniteArticle, jsonLdScript, modelSlug, toolQuery } from '$lib/pages.js';
  import ModelResults from '$lib/components/ModelResults.svelte';
  import NotifySignup from '$lib/components/NotifySignup.svelte';
  import AmazonButton from '$lib/components/AmazonButton.svelte';
  import AffiliateDisclosure from '$lib/components/AffiliateDisclosure.svelte';

  let { data } = $props();

  let gpu = $derived(data.gpu);
  let shortName = $derived(gpuShortName(gpu));
  let configs = $derived(gpuConfigs(gpu));

  // Multi-config GPUs prerender with the largest memory option selected
  let selectedMemIdx = $state(null);
  let config = $derived(configs.find((c) => c.memIdx === selectedMemIdx) ?? configs.at(-1));

  let sortBy = $state('mmlu');

  let results = $derived(bucketModels(allModels, config.vram, config.bandwidth, null, null));
  // One status per model, so "N more are a tight fit" never recounts models that run well
  let counts = $derived(summarizeResults(results).counts);
  let runsWell = $derived(counts.fits);

  // Next GPUs up by VRAM, with how many models each runs well
  let upgrades = $derived(
    upgradeOptionsFor(gpu, gpus).map((g) => ({
      gpu: g,
      runsWell: summarizeResults(bucketModels(allModels, g.vram_gb, g.bandwidth_gbps, null, null)).counts.fits,
    }))
  );
  let runsTight = $derived(counts.tight);
  let bestGeneral = $derived(topModelsByScore(results.fits, 'mmlu_score'));
  let bestCoding = $derived(topModelsByScore(results.fits, 'swe_bench_score'));

  let path = $derived(`/gpu/${gpu.id}`);
  let title = $derived(`What AI models can ${indefiniteArticle(shortName)} ${shortName} (${gpuVramLabel(gpu)}) run?`);

  // Meta description uses the prerendered (largest) config so it is stable
  let description = $derived.by(() => {
    const top = configs.at(-1);
    const r = bucketModels(allModels, top.vram, top.bandwidth, null, null);
    const count = groupVariants(r.fits).length;
    const names = topModelsByScore(r.fits, 'mmlu_score', 2).map((m) => m.name);
    const memory = configs.length > 1 ? `${top.vram} GB` : `${top.vram} GB of VRAM`;
    const examples = names.length > 0 ? `, including ${names.join(' and ')}` : '';
    return `${count} local LLMs run well on the ${gpu.name} with ${memory}${examples}. See max context and estimated tokens/sec for every model.`;
  });

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
        { name: 'GPUs', path: '/gpus' },
        { name: gpu.name, path },
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

{#snippet pickList(picks, scoreKey, scoreName)}
  {#if picks.length > 0}
    <ol>
      {#each picks as m}
        <li>
          <a href="{base}/model/{modelSlug(m.name)}" class="pick-name">{m.name}</a>
          <span class="badge quant">{m.quantization}</span>
          <span class="pick-meta">
            {contextLabel(m.maxCtxK)} context{#if m.tokPerSec != null}{' '}· {tokLabel(m.tokPerSec)}{/if}
            · {scoreName} {m[scoreKey]}
          </span>
        </li>
      {/each}
    </ol>
  {:else}
    <p class="muted">No benchmarked models run well on this configuration.</p>
  {/if}
{/snippet}

<article class="page">
  <nav class="crumbs" aria-label="Breadcrumb">
    <a href="{base}/gpus">GPUs</a> <span aria-hidden="true">/</span> {gpu.manufacturer}
  </nav>

  <header>
    <h2>{title}</h2>
    <p class="intro">
      The {gpu.name} has <strong>{config.vram} GB</strong> of {configs.length > 1 ? 'unified memory' : 'VRAM'}{#if config.bandwidth != null}{' '}and
        <strong>{config.bandwidth} GB/s</strong> memory bandwidth{/if}.
      <strong>{runsWell}</strong> models run well on it{#if runsTight > 0}{' '}and <strong>{runsTight}</strong> more are a tight fit{/if}.
    </p>
  </header>

  {#if configs.length > 1}
    <div class="configs" role="group" aria-label="Memory configuration">
      <span class="configs-label">Memory</span>
      {#each configs as c}
        <button class:active={c === config} aria-pressed={c === config} onclick={() => (selectedMemIdx = c.memIdx)}>{c.vram} GB</button>
      {/each}
    </div>
  {/if}

  <div class="cta-row">
    <a class="cta" href="{base}/{toolQuery(gpu, config.memIdx)}">
      Fine-tune for your setup (context, speed, system RAM, multiple GPUs) →
    </a>
    {#if gpu.amazon_search}
      <AmazonButton {gpu} pageType="gpu" placement="gpu_header" />
    {/if}
  </div>
  {#if gpu.amazon_search}
    <AffiliateDisclosure />
  {/if}

  <section class="picks">
    <div class="pick-card">
      <h3>Best for general use</h3>
      <p class="muted">Highest MMLU score among models that run well</p>
      {@render pickList(bestGeneral, 'mmlu_score', 'MMLU')}
    </div>
    <div class="pick-card">
      <h3>Best for coding</h3>
      <p class="muted">Highest SWE-bench Verified score among models that run well</p>
      {@render pickList(bestCoding, 'swe_bench_score', 'SWE-bench')}
    </div>
  </section>

  {#if upgrades.length > 0}
    <section class="upgrades">
      <h3 class="section-title">Upgrade options</h3>
      <p class="muted">The cheapest GPUs with more VRAM than the {shortName}, by launch MSRP.</p>
      <ul class="upgrade-list">
        {#each upgrades as u (u.gpu.id)}
          <li>
            <div class="upgrade-info">
              <a class="pick-name" href="{base}/gpu/{u.gpu.id}">{gpuShortName(u.gpu)}</a>
              <span class="pick-meta">
                {u.gpu.vram_gb} GB · Launch MSRP ${u.gpu.msrp_usd.toLocaleString('en-US')} ·
                {u.runsWell} models run well{#if u.runsWell > runsWell}{' '}(+{u.runsWell - runsWell}){/if}
              </span>
            </div>
            <AmazonButton gpu={u.gpu} pageType="gpu" placement="gpu_upgrade" compact />
          </li>
        {/each}
      </ul>
      <AffiliateDisclosure />
    </section>
  {/if}

  <section>
    <h3 class="section-title">Every model on the {shortName}{#if configs.length > 1}{' '}({config.vram} GB){/if}</h3>
    <ModelResults vram={config.vram} bandwidth={config.bandwidth} bind:sortBy showTopPicks={false} pageType="gpu">
      {#snippet beforeNoFit()}
        <NotifySignup vram={config.vram} gpuId={gpu.id} gpuName={shortName} pageType="gpu" />
      {/snippet}
    </ModelResults>
  </section>
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

  .crumbs a,
  .pick-name {
    color: var(--accent);
    text-decoration: none;
  }

  .crumbs a:hover,
  .pick-name:hover {
    text-decoration: underline;
  }

  h2 {
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.25;
    margin-bottom: 0.5rem;
  }

  .intro {
    color: var(--text-muted);
  }

  .intro strong {
    color: var(--text);
  }

  .configs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
  }

  .configs-label {
    color: var(--text-muted);
    font-weight: 500;
    margin-right: 0.25rem;
  }

  .configs button {
    padding: 0.3rem 0.7rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }

  .configs button:hover {
    border-color: var(--accent);
  }

  .configs button.active {
    background: var(--accent-dim);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }

  .cta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
  }

  .cta-row + :global(.disclosure) {
    margin-top: -1.1rem;
  }

  .upgrade-list {
    list-style: none;
    padding: 0;
    margin-top: 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .upgrade-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.55rem 0.85rem;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .upgrade-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .cta {
    align-self: flex-start;
    padding: 0.55rem 0.9rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-dim);
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    text-decoration: none;
    transition: background 0.15s;
  }

  .cta:hover {
    background: rgba(107, 138, 255, 0.2);
  }

  .picks {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .pick-card {
    padding: 1rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: rgba(0, 0, 0, 0.2);
  }

  .pick-card h3,
  .section-title {
    font-size: 1rem;
    font-weight: 600;
  }

  .section-title {
    margin-bottom: 0.75rem;
  }

  .muted {
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  ol {
    margin-top: 0.6rem;
    padding-left: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  li {
    font-size: 0.9rem;
  }

  .pick-name {
    font-weight: 600;
    margin-right: 0.35rem;
  }

  .pick-meta {
    display: block;
    color: var(--text-muted);
    font-size: 0.78rem;
  }

  .badge.quant {
    font-size: 0.72rem;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    font-weight: 500;
    background: var(--accent-dim);
    color: var(--accent);
  }

  @media (max-width: 600px) {
    h2 {
      font-size: 1.2rem;
    }

    .picks {
      grid-template-columns: 1fr;
    }

    .cta {
      align-self: stretch;
      text-align: center;
    }

    .cta-row > :global(*) {
      flex: 1 1 100%;
      text-align: center;
    }

    .upgrade-list li {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
