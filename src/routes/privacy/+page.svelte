<svelte:head>
  <title>Privacy Policy — What Models?</title>
  <meta name="description" content="Privacy policy for whatmodelscanirun.com." />
</svelte:head>

<div class="prose">
  <h2>Privacy Policy</h2>
  <p class="updated">Last updated: June 2026</p>

  <p>
    What Models? (<strong>whatmodelscanirun.com</strong>) is a static website with no backend,
    no user accounts, and no forms that collect personal information. All computation happens
    in your browser using data baked into the site at build time.
  </p>

  <h3>Analytics</h3>
  <p>
    This site uses <a href="https://posthog.com" target="_blank" rel="noopener">PostHog</a> to
    collect anonymous usage analytics — things like which GPU was selected and which filters
    were used. No personally identifiable information is collected. PostHog may set a cookie or
    use local storage to distinguish sessions. You can opt out by enabling the "Do Not Track"
    header in your browser, or by using an ad blocker.
  </p>

  <h3>Third-party links</h3>
  <p>
    The site links to GitHub and HuggingFace. Those sites have their own privacy policies and
    are not covered by this one.
  </p>

  <h3>Contact</h3>
  <p>
    Questions? Open an issue on
    <a href="https://github.com/BenD10/whatmodels/issues" target="_blank" rel="noopener">GitHub</a>.
  </p>
</div>

<style>
  .prose {
    max-width: 60ch;
    color: var(--text-muted);
    line-height: 1.7;
  }

  .prose h2 {
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.25rem;
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

  .updated {
    font-size: 0.8rem !important;
    margin-bottom: 1.25rem;
  }

  .prose strong {
    color: var(--text);
  }

  .prose a {
    color: var(--accent);
    text-decoration: none;
  }

  .prose a:hover {
    text-decoration: underline;
  }
</style>
