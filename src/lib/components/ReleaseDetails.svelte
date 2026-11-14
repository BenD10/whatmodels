<script>
  // One data release's changes: new models, new GPUs, corrections. Shared by
  // /new/ (latest release, under an h2) and /new/<date> (under the h1).
  import { base } from '$app/paths';

  const FEATURE_LABELS = { vision: 'vision', reasoning: 'reasoning', tool_use: 'tool use' };

  /** @type {{ release: object, level?: number }} level is the heading level of each section */
  let { release, level = 2 } = $props();

  let tag = $derived(`h${level}`);
</script>

{#if release.models.length > 0}
  <section>
    <svelte:element this={tag} class="section-title">New models ({release.models.length})</svelte:element>
    <ul class="items">
      {#each release.models as m (m.slug)}
        <li>
          <a href="{base}/model/{m.slug}" class="name">{m.name}</a>
          <span class="meta">
            Needs {m.need} GB to run well ({m.quantization}, {m.contextLabel} context) · {m.paramsLabel} parameters{#if m.features.length > 0}{' '}· {m.features.map((f) => FEATURE_LABELS[f] ?? f).join(', ')}{/if}
          </span>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if release.gpus.length > 0}
  <section>
    <svelte:element this={tag} class="section-title">New GPUs ({release.gpus.length})</svelte:element>
    <ul class="items">
      {#each release.gpus as g (g.id)}
        <li>
          <a href="{base}/gpu/{g.id}" class="name">{g.name}</a>
          <span class="meta">{g.vramLabel}</span>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if release.corrections.length > 0}
  <section>
    <svelte:element this={tag} class="section-title">Corrections and updates</svelte:element>
    <ul class="corrections">
      {#each release.corrections as c}
        <li>{c}</li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .section-title {
    font-size: 1rem;
    font-weight: 600;
  }

  .items {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 0.4rem 1.25rem;
  }

  .items li {
    display: flex;
    flex-direction: column;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--border);
    min-width: 0;
  }

  .name {
    font-weight: 600;
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }

  .name:hover {
    text-decoration-thickness: 2px;
  }

  .meta {
    font-size: 0.82rem;
    color: var(--text);
    opacity: 0.85;
  }

  .corrections {
    padding-left: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-size: 0.92rem;
  }
</style>
