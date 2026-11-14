<script>
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { resetPageView } from '$lib/analytics.js';
  import { DATA_UPDATED, VRAM_TIERS, monthYearLabel, tierPath } from '$lib/pages.js';
  import { watchAnalyticsConsent } from '$lib/consent.js';
  import '../app.css';

  let { children } = $props();

  afterNavigate(resetPageView);

  // Route id, not pathname: during prerender `base` is relative, so pathname checks misfire
  let isHome = $derived($page.route.id === '/');
  const section = (prefix) => $page.route.id?.startsWith(prefix) ?? false;

  // PostHog waits for consent where it's needed (see consent.js and app.html)
  onMount(() =>
    watchAnalyticsConsent({
      start: () => (window.posthog ? window.posthog.opt_in_capturing() : window.loadPostHog?.()),
      stop: () => window.posthog?.opt_out_capturing(),
    })
  );
</script>

<div class="shell">
  <header>
    <a href="{base}/" class="brand">
      <img src="{base}/logo.webp" alt="What Models? logo" class="logo" width="96" height="96" fetchpriority="high" />
      <div>
        <!-- The wordmark is the page heading only on the tool; every other page has its own <h1> -->
        <svelte:element this={isHome ? 'h1' : 'p'} class="wordmark">
          <span class="what">What</span>
          <span class="model">Models</span><span class="question">?</span>
        </svelte:element>
        <p class="tagline">Pick the right model for your GPU — in seconds.</p>
      </div>
    </a>
  </header>

  <div class="content-card">
    <nav>
      <a href="{base}/" class:active={isHome}>Tool</a>
      <a href="{base}/primer" class:active={section('/primer')}>LLM Primer</a>
      <a href="{base}/gpus" class:active={section('/gpu')}>GPUs</a>
      <a href="{base}/models" class:active={section('/model')}>Models</a>
    </nav>
    <main>
      {@render children()}
    </main>
  </div>

  <footer>
    <p class="tiers">
      Best models by VRAM:
      {#each VRAM_TIERS as t, i}{#if i > 0}{' '}·{' '}{/if}<a href="{base}{tierPath(t)}">{t} GB</a>{/each}
    </p>
    <p>
      Data last updated {monthYearLabel(DATA_UPDATED)}.
      <a href="{base}/data/">Open dataset</a> ·
      <a href="https://github.com/BenD10/whatmodels" target="_blank" rel="noopener">&#9829; GitHub</a> ·
      <a href="https://github.com/BenD10/whatmodels/issues" target="_blank" rel="noopener">Report an issue</a> ·
      <a href="{base}/privacy">Privacy Policy</a>
    </p>
  </footer>
</div>

<style>
  .shell {
    max-width: 1024px;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 4rem;
  }

  header {
    margin-bottom: 1.25rem;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 1rem;
    text-decoration: none;
    color: inherit;
  }

  .content-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .logo {
    width: 96px;
    height: 96px;
    object-fit: contain;
    border-radius: 12px;
    filter: drop-shadow(0 0 14px rgba(107, 138, 255, 0.45));
  }

  .wordmark {
    font-size: 1.85rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }

  .what {
    color: var(--text);
  }

  .model {
    background: linear-gradient(135deg, #6b8aff 0%, #4fc3f7 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .question {
    color: #4fc3f7;
  }

  .tagline {
    color: var(--text-muted);
    margin-top: 0.2rem;
    font-size: 0.95rem;
  }

  nav {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    padding: 0 1rem;
  }

  nav a {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-muted);
    text-decoration: none;
    padding: 0.75rem 1rem;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color 0.15s, border-color 0.15s;
  }

  nav a:hover {
    color: var(--text);
  }

  nav a.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }

  main {
    padding: 1.5rem;
  }

  footer {
    margin-top: 3rem;
    border-top: 1px solid var(--border);
    padding-top: 1.5rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  footer .tiers {
    margin-bottom: 0.5rem;
  }

  footer a {
    color: var(--accent);
    text-decoration: none;
    transition: opacity 0.15s;
  }

  footer a:hover {
    opacity: 0.8;
    text-decoration: underline;
  }

  @media (max-width: 600px) {
    .shell {
      padding: 1rem 0.75rem 3rem;
    }

    .logo {
      width: 72px;
      height: 72px;
    }

    .wordmark {
      font-size: 1.45rem;
    }

    .tagline {
      font-size: 0.85rem;
    }

    main {
      padding: 1rem;
    }

    nav {
      padding: 0 0.5rem;
    }

    nav a {
      padding: 0.65rem 0.65rem;
      font-size: 0.8rem;
    }
  }
</style>
