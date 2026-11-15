<script>
  import { base } from '$app/paths';
  import allModels from '$lib/data/models.json';
  import { TIGHT_FIT_CONTEXT_K, calcVramForContext, contextLabel } from '$lib/calculations.js';
  import { SITE_NAME, SITE_URL, jsonLdScript, modelPages, releasePath } from '$lib/pages.js';
  import { namesList, releaseDateLabel } from '$lib/releases.js';
  import OgImage from '$lib/components/OgImage.svelte';

  let { data } = $props();

  const models = modelPages(allModels);
  let latest = $derived(data.latestRelease);

  const title = 'How much VRAM do you need? Every local LLM, compared';
  const description = `VRAM requirements for ${models.length} open-weight LLMs at every quantization, and which GPUs can run each one.`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    url: `${SITE_URL}/models`,
    description,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
  };
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href="{SITE_URL}/models" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="{SITE_URL}/models" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:site_name" content={SITE_NAME} />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  {@html jsonLdScript(jsonLd)}
</svelte:head>

<OgImage />

<div class="page">
  <h1>Browse by model</h1>
  <p class="intro">Pick a model to see the VRAM it needs and which GPUs can run it. Minimum VRAM is for the smallest quantization with {contextLabel(TIGHT_FIT_CONTEXT_K)} context.</p>
  <p class="whats-new">
    {#if latest.models.length > 0}
      New in the {releaseDateLabel(latest.date)} release:
      <a href="{base}{releasePath(latest.date)}">{namesList(latest.models)}</a>
    {:else}
      <!-- A corrections-only release: link it by its title -->
      Latest data release ({releaseDateLabel(latest.date)}):
      <a href="{base}{releasePath(latest.date)}">{latest.title}</a>
    {/if}
  </p>

  <ul>
    {#each models as m}
      <li>
        <a href="{base}/model/{m.slug}">{m.name}</a>
        <span class="mem">{calcVramForContext(m.variants[0], TIGHT_FIT_CONTEXT_K).toFixed(1)} GB+</span>
      </li>
    {/each}
  </ul>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  h1 {
    font-size: 1.4rem;
    font-weight: 700;
  }

  .intro {
    color: var(--text-muted);
    margin-top: -0.75rem;
  }

  .whats-new {
    margin-top: -0.75rem;
    font-size: 0.85rem;
  }

  .whats-new a {
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }

  a {
    color: var(--accent);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  ul {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 0.3rem 1rem;
  }

  li {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.3rem 0;
    font-size: 0.9rem;
    border-bottom: 1px solid var(--border);
  }

  .mem {
    color: var(--text-muted);
    font-size: 0.8rem;
    white-space: nowrap;
  }

  @media (max-width: 600px) {
    h1 {
      font-size: 1.2rem;
    }
  }
</style>
