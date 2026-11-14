<script>
  // Preview-image tags for link unfurls (Open Graph and X). The PNGs are
  // prerendered by the /og/… endpoints; see $lib/og.js.
  import { DEPLOY_BASE, OG_HEIGHT, OG_WIDTH, SITE_OG_ALT, SITE_OG_PATH, ogImageUrl } from '$lib/og.js';

  /** @type {{ path?: string, alt?: string }} */
  let { path = SITE_OG_PATH, alt = SITE_OG_ALT } = $props();

  let url = $derived(ogImageUrl(path, DEPLOY_BASE));
</script>

<svelte:head>
  <meta property="og:image" content={url} />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content={String(OG_WIDTH)} />
  <meta property="og:image:height" content={String(OG_HEIGHT)} />
  <meta property="og:image:alt" content={alt} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={url} />
  <meta name="twitter:image:alt" content={alt} />
</svelte:head>
