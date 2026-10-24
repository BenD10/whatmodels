<script>
  import { BUTTONDOWN_ACTION, signupTags, vramTier } from '$lib/notify.js';
  import { trackNotifyFormSubmitted, trackNotifyFormViewed } from '$lib/analytics.js';

  /** @type {{ vram?: number|null, gpuId?: string|null, gpuName?: string|null, pageType: string }} */
  let { vram = null, gpuId = null, gpuName = null, pageType } = $props();

  // Buttondown's response opens here so CAPTCHA/validation can be completed
  // without leaving the page; without JS the form simply navigates there.
  const POPUP_NAME = 'buttondown-signup';

  let email = $state('');
  let submitted = $state(false);
  let el = $state(null);

  let tags = $derived(signupTags(vram, gpuId));
  let tier = $derived(vramTier(vram));
  let target = $derived(gpuName ?? (vram != null ? `${vram} GB setup` : 'GPU'));

  // notify_form_viewed: once per page view, when the form scrolls into view
  $effect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        trackNotifyFormViewed(tier, pageType);
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  });

  function onSubmit() {
    window.open('', POPUP_NAME, 'width=520,height=640');
    trackNotifyFormSubmitted(tier, pageType);
    // Defer so the form is still in the DOM when the browser submits it
    setTimeout(() => (submitted = true), 0);
  }

  function reset() {
    submitted = false;
    email = '';
  }
</script>

<section class="notify" bind:this={el} aria-labelledby="notify-heading">
  {#if submitted}
    <div class="success" role="status">
      <h3 id="notify-heading">Check your inbox to confirm</h3>
      <p>
        We've sent a confirmation link to <strong>{email}</strong>. Click it to start getting alerts —
        nothing is sent until you do. If a Buttondown window asked you to verify, finish that first.
      </p>
      <button type="button" class="link-btn" onclick={reset}>Use a different email</button>
    </div>
  {:else}
    <h3 id="notify-heading">Notify me when new models fit my GPU</h3>
    <p class="blurb">An email when a new model fits your {target} — no spam, unsubscribe anytime.</p>
    <form action={BUTTONDOWN_ACTION} method="post" target={POPUP_NAME} onsubmit={onSubmit}>
      <label for="notify-email" class="visually-hidden">Email address</label>
      <input
        id="notify-email"
        type="email"
        name="email"
        placeholder="you@example.com"
        autocomplete="email"
        required
        bind:value={email}
      />
      {#each tags as tag}
        <input type="hidden" name="tag" value={tag} />
      {/each}
      <!-- Tags need a paid Buttondown plan; metadata keeps the same info on the free plan -->
      {#if tier}<input type="hidden" name="metadata__vram_tier" value={tier} />{/if}
      {#if gpuId}<input type="hidden" name="metadata__gpu" value={gpuId} />{/if}
      <button type="submit">Notify me of the latest models I can run</button>
    </form>
  {/if}
</section>

<style>
  .notify {
    padding: 1rem 1.25rem;
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    background: var(--accent-dim);
  }

  h3 {
    font-size: 1rem;
    font-weight: 600;
  }

  .blurb,
  .success p {
    color: var(--text-muted);
    font-size: 0.85rem;
    margin: 0.25rem 0 0.75rem;
  }

  .success p strong {
    color: var(--text);
  }

  form {
    display: flex;
    gap: 0.5rem;
  }

  input[type='email'] {
    flex: 1;
    min-width: 0;
    padding: 0.5rem 0.75rem;
    font-size: 0.9rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    transition: border-color 0.15s;
  }

  input[type='email']:focus {
    outline: none;
    border-color: var(--accent);
  }

  button[type='submit'] {
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--bg);
    background: var(--accent);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s;
  }

  button[type='submit']:hover {
    opacity: 0.85;
  }

  .link-btn {
    padding: 0;
    font-size: 0.8rem;
    color: var(--accent);
    background: none;
    border: none;
    cursor: pointer;
  }

  .link-btn:hover {
    text-decoration: underline;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  @media (max-width: 600px) {
    form {
      flex-direction: column;
    }

    button[type='submit'] {
      white-space: normal;
    }
  }
</style>
