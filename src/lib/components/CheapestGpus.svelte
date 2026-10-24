<script>
  import { base } from '$app/paths';
  import { tokLabel } from '$lib/calculations.js';
  import { gpuShortName } from '$lib/pages.js';
  import AmazonButton from './AmazonButton.svelte';
  import AffiliateDisclosure from './AffiliateDisclosure.svelte';

  /** @type {{ picks: ReturnType<typeof import('$lib/calculations.js').cheapestGpusFor>, pageType: string, placement: string }} */
  let { picks, pageType, placement } = $props();
</script>

<ul class="gpu-picks">
  {#each picks as p (p.gpu.id)}
    <li>
      <div class="pick-info">
        <a class="pick-name" href="{base}/gpu/{p.gpu.id}">{gpuShortName(p.gpu)}</a>
        <span class="pick-meta">
          {p.gpu.vram_gb} GB{#if p.tokPerSec != null}{' '}· {tokLabel(p.tokPerSec)} at {p.quantization}{/if}
          · Launch MSRP ${p.gpu.msrp_usd.toLocaleString('en-US')}
        </span>
      </div>
      <AmazonButton gpu={p.gpu} {pageType} {placement} compact />
    </li>
  {/each}
</ul>
<AffiliateDisclosure />

<style>
  .gpu-picks {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .gpu-picks li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.45rem 0.65rem;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .pick-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .pick-name {
    font-weight: 600;
    font-size: 0.88rem;
    color: var(--accent);
    text-decoration: none;
  }

  .pick-name:hover {
    text-decoration: underline;
  }

  .pick-meta {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  @media (max-width: 600px) {
    .gpu-picks li {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
