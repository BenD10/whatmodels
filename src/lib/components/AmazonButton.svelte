<script>
  import { onMount } from 'svelte';
  import { AFFILIATE_LINK_ATTRS, DEFAULT_MARKETPLACE, amazonSearchUrl, detectMarketplace } from '$lib/affiliate.js';
  import { trackAffiliateClick } from '$lib/analytics.js';

  /** @type {{ gpu: { id: string, amazon_search: string|null }, pageType: string, placement: string, compact?: boolean }} */
  let { gpu, pageType, placement, compact = false } = $props();

  // Prerendered HTML links to the US store; the visitor's store is resolved in the browser
  let marketplace = $state(DEFAULT_MARKETPLACE);
  onMount(() => {
    marketplace = detectMarketplace();
  });

  let href = $derived(gpu.amazon_search ? amazonSearchUrl(gpu.amazon_search, marketplace) : null);
</script>

{#if href}
  <a
    class="amazon-btn"
    class:compact
    {href}
    rel={AFFILIATE_LINK_ATTRS.rel}
    target={AFFILIATE_LINK_ATTRS.target}
    data-marketplace={marketplace}
    onclick={() => trackAffiliateClick(gpu.id, pageType, placement, marketplace)}
  >
    Check price on Amazon
  </a>
{/if}

<style>
  .amazon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.55rem 0.9rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    text-decoration: none;
    white-space: nowrap;
    transition: border-color 0.15s, background 0.15s;
  }

  .amazon-btn:hover {
    border-color: var(--accent);
    background: var(--surface-hover);
  }

  .amazon-btn.compact {
    padding: 0.3rem 0.65rem;
    font-size: 0.78rem;
  }
</style>
