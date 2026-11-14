<script>
  import { base } from '$app/paths';
  import OgImage from '$lib/components/OgImage.svelte';
  import ReleaseDetails from '$lib/components/ReleaseDetails.svelte';
  import { SITE_NAME, SITE_URL, breadcrumbLd, jsonLdScript } from '$lib/pages.js';
  import { NEW_PATH } from '$lib/releases.js';

  let { data } = $props();

  let release = $derived(data.release);
  let path = $derived(release.path);
  let title = $derived(`${release.title} (${release.dateLabel}) | ${SITE_NAME}`);
  let description = $derived(release.summary);

  let jsonLd = $derived({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: release.title,
        url: `${SITE_URL}${path}`,
        description,
        datePublished: release.date,
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
      },
      breadcrumbLd([
        { name: SITE_NAME, path: '/' },
        { name: "What's new", path: NEW_PATH },
        { name: release.dateLabel, path },
      ]),
      ...(release.models.length > 0
        ? [
            {
              '@type': 'ItemList',
              name: `Models added on ${release.dateLabel}`,
              itemListElement: release.models.map((m, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                name: m.name,
                url: `${SITE_URL}/model/${m.slug}`,
              })),
            },
          ]
        : []),
    ],
  });
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href="{SITE_URL}{path}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="{SITE_URL}{path}" />
  <meta property="og:title" content={release.title} />
  <meta property="og:description" content={description} />
  <meta property="og:site_name" content={SITE_NAME} />
  <meta property="article:published_time" content={release.date} />
  <meta name="twitter:title" content={release.title} />
  <meta name="twitter:description" content={description} />
  {@html jsonLdScript(jsonLd)}
</svelte:head>

<OgImage />

<article class="page">
  <nav class="crumbs" aria-label="Breadcrumb">
    <a href="{base}{NEW_PATH}">What's new</a> <span aria-hidden="true">/</span> {release.dateLabel}
  </nav>

  <header>
    <p class="date">Data release · <time datetime={release.date}>{release.dateLabel}</time></p>
    <h1>{release.title}</h1>
    <p class="summary">{release.summary}</p>
  </header>

  <ReleaseDetails {release} level={2} />

  <p class="next-step">
    Pick your GPU in <a href="{base}/">the tool</a> to see which of these fit your setup, with context and speed estimates.
  </p>

  {#if data.newer || data.older}
    <nav class="pager" aria-label="Other releases">
      {#if data.older}
        <a href="{base}{data.older.path}" rel="prev">← Older: {data.older.title}</a>
      {/if}
      {#if data.newer}
        <a href="{base}{data.newer.path}" rel="next" class="newer">Newer: {data.newer.title} →</a>
      {/if}
    </nav>
  {/if}
</article>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .crumbs {
    font-size: 0.85rem;
  }

  a {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }

  a:hover {
    text-decoration-thickness: 2px;
  }

  .date {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--accent);
    margin-bottom: 0.3rem;
  }

  h1 {
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.25;
    margin-bottom: 0.5rem;
  }

  .summary,
  .next-step {
    max-width: 70ch;
  }

  .next-step {
    font-size: 0.9rem;
  }

  .pager {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.75rem 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
    font-size: 0.88rem;
  }

  .newer {
    margin-left: auto;
    text-align: right;
  }

  @media (max-width: 600px) {
    h1 {
      font-size: 1.2rem;
    }

    .newer {
      margin-left: 0;
      text-align: left;
    }
  }
</style>
