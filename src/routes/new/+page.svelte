<script>
  import { base } from '$app/paths';
  import OgImage from '$lib/components/OgImage.svelte';
  import ReleaseDetails from '$lib/components/ReleaseDetails.svelte';
  import { SITE_NAME, SITE_URL, breadcrumbLd, jsonLdScript } from '$lib/pages.js';
  import { FEED_PATH, NEW_PATH } from '$lib/releases.js';

  let { data } = $props();

  let latest = $derived(data.latest);
  let past = $derived(data.past);

  const title = `What's new: local LLM and GPU data releases | ${SITE_NAME}`;
  let description = $derived(
    `New local LLMs and GPUs, release by release, with the VRAM each model needs. Latest, ${latest.dateLabel}: ${latest.title}.`
  );

  let jsonLd = $derived({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: "What's new",
        url: `${SITE_URL}${NEW_PATH}`,
        description,
        dateModified: latest.date,
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
      },
      breadcrumbLd([
        { name: SITE_NAME, path: '/' },
        { name: "What's new", path: NEW_PATH },
      ]),
    ],
  });
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href="{SITE_URL}{NEW_PATH}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="{SITE_URL}{NEW_PATH}" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:site_name" content={SITE_NAME} />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  {@html jsonLdScript(jsonLd)}
</svelte:head>

<OgImage />

<article class="page">
  <header>
    <h1>What's new</h1>
    <p class="intro">
      Every data release adds the latest open-weight models and GPUs, and fixes what we got wrong. New releases come
      about every two weeks. Follow along with the <a href="{base}{FEED_PATH}">RSS feed</a>.
    </p>
  </header>

  <section class="latest" aria-labelledby="latest-title">
    <p class="date">Latest release · <time datetime={latest.date}>{latest.dateLabel}</time></p>
    <h2 id="latest-title"><a href="{base}{latest.path}">{latest.title}</a></h2>
    <p class="summary">{latest.summary}</p>
    <ReleaseDetails release={latest} level={3} />
  </section>

  {#if past.length > 0}
    <section aria-labelledby="past-title">
      <h2 id="past-title">Past releases</h2>
      <ol class="past">
        {#each past as r (r.date)}
          <li>
            <time datetime={r.date}>{r.dateLabel}</time>
            <h3><a href="{base}{r.path}">{r.title}</a></h3>
            <p>{r.summary}</p>
            <p class="counts">{r.countsLabel}</p>
          </li>
        {/each}
      </ol>
    </section>
  {/if}
</article>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  h1 {
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin-bottom: 0.5rem;
  }

  h2 {
    font-size: 1.15rem;
    font-weight: 700;
  }

  h3 {
    font-size: 1rem;
    font-weight: 600;
  }

  a {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }

  a:hover {
    text-decoration-thickness: 2px;
  }

  .intro,
  .summary {
    max-width: 70ch;
  }

  .latest {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: rgba(0, 0, 0, 0.2);
  }

  .latest h2 {
    margin-top: -0.6rem;
  }

  .date,
  time {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--accent);
  }

  .past {
    list-style: none;
    padding: 0;
    margin-top: 0.75rem;
    display: flex;
    flex-direction: column;
  }

  .past li {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.9rem 0;
    border-bottom: 1px solid var(--border);
  }

  .past li:first-child {
    padding-top: 0;
  }

  .past p {
    font-size: 0.9rem;
    max-width: 70ch;
  }

  .past .counts {
    opacity: 0.85;
    font-size: 0.82rem;
  }

  @media (max-width: 600px) {
    h1 {
      font-size: 1.2rem;
    }

    .latest {
      padding: 1rem;
    }
  }
</style>
