<svelte:head>
  <title>Privacy Policy — What Models?</title>
  <meta name="description" content="Privacy policy for whatmodelscanirun.com." />
</svelte:head>

<div class="prose">
  <h2>Privacy Policy</h2>
  <p class="updated">Last updated: October 2026</p>

  <p>
    What Models? (<strong>whatmodelscanirun.com</strong>) is a static website with no backend
    and no user accounts. All computation happens in your browser using data baked into the site
    at build time. The only personal information the site collects is an email address, and only
    if you choose to sign up for new-model alerts.
  </p>

  <h3>Email alerts</h3>
  <p>
    If you use the "Notify me when new models fit my GPU" form, your email address is sent
    directly from your browser to <a href="https://buttondown.com" target="_blank" rel="noopener">Buttondown</a>,
    the service that stores the subscriber list and sends the emails. It never passes through a
    server run by this site. Buttondown's handling of your data is covered by its
    <a href="https://buttondown.com/legal/privacy" target="_blank" rel="noopener">privacy policy</a>.
  </p>
  <p>
    Along with your email, the form sends the GPU you were looking at and its memory tier
    (for example <code>rtx-4060</code> and <code>vram-8</code>), so alerts only cover models
    that fit your hardware. Nothing is sent until you confirm your address by clicking the link in
    the confirmation email. Your email is used only for these alerts and is never sold or shared.
  </p>
  <p>
    Every email includes an unsubscribe link. Clicking it removes you from the list immediately.
    You can also ask for your address to be deleted by opening an issue on GitHub (see Contact below).
  </p>

  <h3>Analytics</h3>
  <p>
    This site uses <a href="https://posthog.com" target="_blank" rel="noopener">PostHog</a> to
    collect anonymous usage analytics — things like which GPU was selected and which filters
    were used, and whether the email alert form was seen or submitted. Your email address is never
    sent to PostHog. No other personally identifiable information is collected. PostHog may set a cookie or
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

  .prose code {
    font-size: 0.85em;
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
