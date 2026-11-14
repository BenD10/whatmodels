<script>
  import { base } from '$app/paths';
  import allModels from '$lib/data/models.json';
  import gpus from '$lib/data/gpus.json';
  import { bucketModels, contextLabel, summarizeResults, tokLabel, topModelsByScore, upgradeOptionsFor } from '$lib/calculations.js';
  import { tierCard, tierOgPath } from '$lib/og.js';
  import { SITE_NAME, SITE_URL, VRAM_TIERS, breadcrumbLd, gpuShortName, jsonLdScript, modelItemListLd, modelSlug, tierPath } from '$lib/pages.js';
  import { gpuPagePath, nextTier, representativeBandwidth, tierDescription, tierPageFacts, tierTitle, tierToolQuery, tierUnlocks } from '$lib/vram-tiers.js';
  import ModelResults from '$lib/components/ModelResults.svelte';
  import NotifySignup from '$lib/components/NotifySignup.svelte';
  import AmazonButton from '$lib/components/AmazonButton.svelte';
  import AffiliateDisclosure from '$lib/components/AffiliateDisclosure.svelte';
  import OgImage from '$lib/components/OgImage.svelte';

  let { data } = $props();

  let size = $derived(data.size);
  // Shared with the preview image, so the two never disagree
  let facts = $derived(tierPageFacts(size, gpus, allModels));
  let configs = $derived(facts.configs);
  let discrete = $derived(configs.filter((c) => !c.unified));
  let unified = $derived(configs.filter((c) => c.unified));
  let bandwidth = $derived(facts.bandwidth);

  let sortBy = $state('mmlu');

  let results = $derived(facts.results);
  let counts = $derived(summarizeResults(results).counts);
  let bestGeneral = $derived(topModelsByScore(results.fits, 'mmlu_score', 5));
  let bestCoding = $derived(topModelsByScore(results.fits, 'swe_bench_score', 5));

  // Upgrade nudge: the next tier and what it adds, then the cheapest cards with more VRAM
  let next = $derived(nextTier(size));
  let unlocks = $derived(
    next == null ? null : tierUnlocks(allModels, { vram: size, bandwidth }, { vram: next, bandwidth: representativeBandwidth(gpus, next) })
  );
  let upgrades = $derived(
    upgradeOptionsFor({ vram_gb: size }, gpus).map((g) => ({
      gpu: g,
      runsWell: summarizeResults(bucketModels(allModels, g.vram_gb, g.bandwidth_gbps, null, null)).counts.fits,
    }))
  );

  let path = $derived(tierPath(size));
  let title = $derived(tierTitle(size));
  let description = $derived(
    tierDescription(size, { runsWell: facts.runsWell, tight: facts.tight, topNames: facts.topNames, gpuCount: configs.length })
  );
  let ogAlt = $derived(tierCard(size, facts).alt);

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
        { name: `${size} GB VRAM`, path },
      ]),
      // bucketModels sorts by MMLU-Pro, best first; omitted when nothing runs well
      modelItemListLd(`Local LLMs that run well in ${size} GB of VRAM`, results.fits),
    ].filter(Boolean),
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
    <p class="muted">None of the models that run well in {size} GB has a published {scoreName} score yet. See the full list below.</p>
  {/if}
{/snippet}

{#snippet gpuList(list)}
  <ul class="gpu-list">
    {#each list as c (`${c.gpu.id}-${c.vram}`)}
      <li>
        <a href="{base}{gpuPagePath(c.gpu, c.memIdx)}">{gpuShortName(c.gpu)}</a>
        {#if c.bandwidth != null}<span class="mem">{c.bandwidth} GB/s</span>{/if}
      </li>
    {/each}
  </ul>
{/snippet}

<OgImage path={tierOgPath(size)} alt={ogAlt} />

<article class="page">
  <nav class="crumbs" aria-label="Breadcrumb">
    <a href="{base}/gpus">GPUs</a> <span aria-hidden="true">/</span> By VRAM
  </nav>

  <div class="tiers" role="group" aria-label="VRAM tier">
    <span class="tiers-label">VRAM</span>
    {#each VRAM_TIERS as t}
      <a href="{base}{tierPath(t)}" class:active={t === size} aria-current={t === size ? 'page' : undefined}>{t} GB</a>
    {/each}
  </div>

  <header>
    <h1>{title}</h1>
    <p class="intro">
      With <strong>{size} GB</strong> of VRAM or unified memory, <strong>{counts.fits}</strong> models run well{#if counts.tight > 0}{' '}and
        <strong>{counts.tight}</strong> more are a tight fit{/if}. {counts.noFit} don't fit.
    </p>
    <p class="intro speed-basis">
      {#if bandwidth != null}
        Speeds assume <strong>{bandwidth} GB/s</strong>, the median memory bandwidth of the {configs.length} GPUs and memory
        configurations with exactly {size} GB. Yours may be faster or slower: pick your GPU for exact numbers.
      {:else}
        No GPU in our database has exactly {size} GB, so speeds are left out. Pick your GPU for tokens/sec estimates.
      {/if}
    </p>
  </header>

  <div class="cta-row">
    <a class="cta" href="{base}/{tierToolQuery(size)}">
      Fine-tune for your setup (context, speed, system RAM, multiple GPUs) →
    </a>
  </div>

  <section class="picks">
    <div class="pick-card">
      <h3>Best overall</h3>
      <p class="muted">Highest MMLU-Pro score among models that run well</p>
      {@render pickList(bestGeneral, 'mmlu_score', 'MMLU')}
    </div>
    <div class="pick-card">
      <h3>Best for coding</h3>
      <p class="muted">Highest SWE-bench Verified score among models that run well</p>
      {@render pickList(bestCoding, 'swe_bench_score', 'SWE-bench')}
    </div>
  </section>

  <section class="gpus">
    <h3 class="section-title">GPUs with {size} GB of memory</h3>
    {#if configs.length === 0}
      <p class="muted">No GPU in our database has exactly {size} GB.</p>
    {:else}
      <div class="gpu-cols">
        {#if discrete.length > 0}
          <div>
            <h4>Graphics cards</h4>
            {@render gpuList(discrete)}
          </div>
        {/if}
        {#if unified.length > 0}
          <div>
            <h4>Unified memory (Apple Silicon, Ryzen AI Max, RTX Spark)</h4>
            {@render gpuList(unified)}
          </div>
        {/if}
      </div>
    {/if}
  </section>

  {#if (unlocks && unlocks.count > 0) || upgrades.length > 0}
    <section class="upgrades">
      <h3 class="section-title">Upgrade options</h3>
      {#if unlocks && unlocks.count > 0}
        <p class="unlock">
          <a class="pick-name" href="{base}{tierPath(next)}">{next} GB</a> runs <strong>{unlocks.count}</strong> more
          {unlocks.count === 1 ? 'model' : 'models'} well{#if unlocks.top.length > 0}, including
            {#each unlocks.top as m, i}<a href="{base}/model/{modelSlug(m.name)}">{m.name}</a>{i < unlocks.top.length - 2 ? ', ' : i === unlocks.top.length - 2 ? ' and ' : ''}{/each}{/if}.
        </p>
      {/if}
      {#if upgrades.length > 0}
        <p class="muted">The cheapest GPUs with more than {size} GB, by launch MSRP.</p>
        <ul class="upgrade-list">
          {#each upgrades as u (u.gpu.id)}
            <li>
              <div class="upgrade-info">
                <a class="pick-name" href="{base}/gpu/{u.gpu.id}">{gpuShortName(u.gpu)}</a>
                <span class="pick-meta">
                  {u.gpu.vram_gb} GB · Launch MSRP ${u.gpu.msrp_usd.toLocaleString('en-US')} ·
                  {u.runsWell} models run well{#if u.runsWell > counts.fits}{' '}(+{u.runsWell - counts.fits}){/if}
                </span>
              </div>
              <AmazonButton gpu={u.gpu} pageType="vram" placement="vram_upgrade" compact />
            </li>
          {/each}
        </ul>
        <AffiliateDisclosure />
      {/if}
    </section>
  {/if}

  <section>
    <h3 class="section-title">Every model in {size} GB</h3>
    <ModelResults vram={size} {bandwidth} bind:sortBy showTopPicks={false} pageType="vram">
      {#snippet beforeNoFit()}
        <NotifySignup vram={size} pageType="vram" />
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
  .pick-name,
  .unlock a,
  .gpu-list a {
    color: var(--accent);
    text-decoration: none;
  }

  .crumbs a:hover,
  .pick-name:hover,
  .unlock a:hover,
  .gpu-list a:hover {
    text-decoration: underline;
  }

  h1 {
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.25;
    margin-bottom: 0.5rem;
  }

  .intro {
    color: var(--text-muted);
  }

  .intro strong,
  .unlock strong {
    color: var(--text);
  }

  .speed-basis {
    margin-top: 0.4rem;
    font-size: 0.85rem;
  }

  .tiers {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    margin-top: -0.75rem;
  }

  .tiers-label {
    color: var(--text-muted);
    font-weight: 500;
    margin-right: 0.25rem;
  }

  .tiers a {
    padding: 0.3rem 0.7rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    text-decoration: none;
    transition: border-color 0.15s, background 0.15s;
  }

  .tiers a:hover {
    border-color: var(--accent);
  }

  .tiers a.active {
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

  h4 {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    margin-bottom: 0.4rem;
  }

  .gpu-cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem 1.5rem;
  }

  .gpu-list {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.2rem 1rem;
  }

  .gpu-list li {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.3rem 0;
    font-size: 0.88rem;
    border-bottom: 1px solid var(--border);
  }

  .mem {
    color: var(--text-muted);
    font-size: 0.78rem;
    white-space: nowrap;
  }

  .unlock {
    font-size: 0.9rem;
    color: var(--text-muted);
    margin-bottom: 0.6rem;
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

  ol li {
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
    h1 {
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
