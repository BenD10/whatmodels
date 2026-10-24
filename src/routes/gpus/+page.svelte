<script>
  import { base } from '$app/paths';
  import gpus from '$lib/data/gpus.json';
  import { SITE_NAME, SITE_URL, gpuShortName, gpuVramLabel, jsonLdScript } from '$lib/pages.js';

  const title = 'Which AI models can your GPU run? Every GPU, compared';
  const description = `Pick your graphics card or Apple Silicon chip to see which local LLMs fit in its memory, with context length and tokens/sec estimates. ${gpus.length} GPUs covered.`;

  // Manufacturers in gpus.json order, GPUs within each by memory descending
  const byManufacturer = (() => {
    const groups = new Map();
    for (const g of gpus) {
      if (!groups.has(g.manufacturer)) groups.set(g.manufacturer, []);
      groups.get(g.manufacturer).push(g);
    }
    const maxVram = (g) => g.vram_gb ?? Math.max(...g.vram_options.map((o) => o.vram_gb));
    for (const list of groups.values()) list.sort((a, b) => maxVram(b) - maxVram(a) || a.name.localeCompare(b.name));
    return [...groups.entries()];
  })();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    url: `${SITE_URL}/gpus`,
    description,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
  };
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href="{SITE_URL}/gpus" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="{SITE_URL}/gpus" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:site_name" content={SITE_NAME} />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  {@html jsonLdScript(jsonLd)}
</svelte:head>

<div class="page">
  <h2>Browse by GPU</h2>
  <p class="intro">Pick a GPU to see every model it can run. For a custom setup, use the <a href="{base}/">full tool</a>.</p>

  {#each byManufacturer as [manufacturer, list]}
    <section>
      <h3>{manufacturer}</h3>
      <ul>
        {#each list as gpu}
          <li>
            <a href="{base}/gpu/{gpu.id}">{gpuShortName(gpu)}</a>
            <span class="mem">{gpuVramLabel(gpu)}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  h2 {
    font-size: 1.4rem;
    font-weight: 700;
  }

  h3 {
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }

  .intro {
    color: var(--text-muted);
    margin-top: -0.75rem;
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
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
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
    h2 {
      font-size: 1.2rem;
    }
  }
</style>
