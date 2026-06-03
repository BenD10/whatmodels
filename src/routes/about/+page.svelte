<svelte:head>
  <title>About — What Models?</title>
  <meta name="description" content="About What Models? — a free tool to find which AI models your GPU can run." />
</svelte:head>

<div class="prose">
  <h2>About</h2>

  <p>
    What Models? is a free tool built to answer a simple question that doesn't have a great
    answer anywhere else: given my GPU, which LLMs can I actually run — and how fast?
  </p>

  <p>
    I built this after spending too much time downloading models only to find they didn't fit
    in VRAM, or ran too slowly to be useful. The calculations aren't complicated, but they're
    tedious to do by hand for every model you're considering. This tool does them all at once.
  </p>

  <p>
    The site is open source. If you spot a mistake in the data, want a model or GPU added, or
    have a suggestion, the best place to raise it is
    <a href="https://github.com/BenD10/whatmodels/issues" target="_blank" rel="noopener">GitHub Issues</a>.
  </p>

  <h3>How the data is sourced</h3>
  <p>
    Model weights and VRAM figures come from
    <a href="https://huggingface.co/bartowski" target="_blank" rel="noopener">bartowski's GGUF releases</a>
    on HuggingFace — consistently the most reliable source for Q4_K_M and Q8_0 quantizations.
    GPU specs are sourced from manufacturer datasheets. Benchmark scores (MMLU, SWE-Bench)
    are pulled from public leaderboards.
  </p>

  <h3>Built by</h3>
  <p>
    <a href="https://github.com/BenD10" target="_blank" rel="noopener">BenD10</a> on GitHub.
  </p>
</div>

<style>
  .prose {
    color: var(--text-muted);
    line-height: 1.75;
  }

  .prose h2 {
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.75rem;
  }

  .prose h3 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text);
    margin: 1.5rem 0 0.4rem;
  }

  .prose p {
    font-size: 0.95rem;
    margin-bottom: 0.75rem;
  }

  .prose a {
    color: var(--accent);
    text-decoration: none;
  }

  .prose a:hover {
    text-decoration: underline;
  }
</style>
