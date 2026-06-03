<script>
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import '../app.css';

  let { children } = $props();
</script>

<div class="shell">
  <header>
    <a href="{base}/" class="brand">
      <img src="{base}/logo.png" alt="What Models? logo" class="logo" width="96" height="96" />
      <div>
        <h1>
          <span class="what">What</span>
          <span class="model">Models</span><span class="question">?</span>
        </h1>
        <p class="tagline">Pick the right model for your GPU — in seconds.</p>
      </div>
    </a>
  </header>

  <div class="content-card">
    <nav>
      <a href="{base}/" class:active={$page.url.pathname === base + '/'}>Tool</a>
      <a href="{base}/primer" class:active={$page.url.pathname.startsWith(base + '/primer')}>LLM Primer</a>
    </nav>
    <main>
      {@render children()}
    </main>
  </div>

  <footer>
    <p>
      Data last updated June 2026.
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

  h1 {
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

    h1 {
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
