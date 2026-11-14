<script>
  import { base } from '$app/paths';
  import OgImage from '$lib/components/OgImage.svelte';
  import gpus from '$lib/data/gpus.json';
  import models from '$lib/data/models.json';
  import { DATA_UPDATED, SITE_NAME, SITE_URL, breadcrumbLd, jsonLdScript, modelPages } from '$lib/pages.js';
  import { DATASET_DOCS_PATH, DATASET_PATHS, SCHEMA_VERSION, datasetLd } from '$lib/dataset.js';

  const path = DATASET_DOCS_PATH;
  const title = 'LLM VRAM and KV cache dataset (JSON, MIT)';
  const docTitle = `${title} — ${SITE_NAME}`;
  const modelCount = modelPages(models).length;
  const description = `Open JSON dataset of GGUF weight sizes, KV cache per 1K tokens, context limits and benchmarks for ${modelCount} local LLMs (${models.length} quantizations), plus VRAM and bandwidth for ${gpus.length} GPUs. MIT licensed.`;

  const modelsUrl = `${SITE_URL}${DATASET_PATHS.models}`;
  const gpusUrl = `${SITE_URL}${DATASET_PATHS.gpus}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: title,
        url: `${SITE_URL}${path}`,
        description,
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
      },
      datasetLd({ name: 'What Models Can I Run? LLM memory dataset', description, modelCount: models.length, gpuCount: gpus.length }),
      breadcrumbLd([
        { name: SITE_NAME, path: '/' },
        { name: 'Dataset', path },
      ]),
    ],
  };

  const modelFields = [
    ['id', 'string', 'Stable row id, one per model per quantization (e.g. llama-3.1-8b-q4). Never reused for a different row.'],
    ['name', 'string', 'Model name, shared by all quantizations of the same model. Group rows on it.'],
    ['url', 'string', 'The model’s page on this site (all quantizations share one page).'],
    ['quantization', 'string', 'GGUF quantization: Q4_K_M, Q4_K_S, Q8_0 or fp16.'],
    ['params_b', 'number', 'Total parameters, in billions.'],
    ['weight_gb', 'number', 'Size of the GGUF weights in GB (2³⁰ bytes), summed across shards. Excludes vision projectors (mmproj), MTP and draft heads.'],
    ['gguf_repo', 'string | null', 'Hugging Face repo (owner/name) holding this row’s GGUF, checked against weight_gb. Runs as ollama run hf.co/<gguf_repo>:<quant> or llama-server -hf <gguf_repo>:<quant> (F16 for fp16). null when no source could be verified.'],
    ['gguf_shards', 'number | null', 'How many files the GGUF is split into (1 = a single file; Ollama can’t pull split GGUFs from Hugging Face). null when gguf_repo is null.'],
    ['active_weight_gb', 'number | null', 'Mixture-of-experts only: the weights read per token (total weights scaled by active ÷ total parameters), in GB. null for dense models.'],
    ['kv_per_1k_gb', 'number', 'fp16 KV cache per 1,000 tokens of context, in GB. Counts only layers whose cache grows with context (see below).'],
    ['max_context_k', 'number', 'Trained context length in units of 1,024 tokens (128 = 131,072 tokens).'],
    ['layers', 'number', 'Total transformer layers, of every kind. Used to estimate partial offload to system RAM.'],
    ['features', 'string[]', 'Sorted subset of vision, reasoning, tool_use. Identical across a model’s quantizations.'],
    ['mmlu_score', 'number | null', 'MMLU-Pro (%) for current entries; some early rows carry original MMLU. null when not published.'],
    ['swe_bench_score', 'number | null', 'SWE-bench Verified (%). null when not published. Never SWE-bench Pro or other variants.'],
    ['notes', 'string', 'Free-text architecture and sourcing notes. For people, not parsers: wording changes between releases.'],
  ];

  const gpuFields = [
    ['id', 'string', 'Stable kebab-case id (e.g. rtx-4090), also the page slug.'],
    ['name', 'string', 'Product name (e.g. GeForce RTX 4090, M4 Max).'],
    ['url', 'string', 'The GPU’s page on this site.'],
    ['manufacturer', 'string', 'NVIDIA, AMD, Intel or Apple.'],
    ['vram_gb', 'number | null', 'Memory in GB, for discrete cards. null for unified-memory parts.'],
    ['bandwidth_gbps', 'number | null', 'Peak memory bandwidth in GB/s, for discrete cards. null for unified-memory parts.'],
    ['vram_options', 'object[] | null', 'Unified-memory parts (Apple Silicon, AMD Ryzen AI Max, RTX Spark): one { vram_gb, bandwidth_gbps } per memory configuration, smallest first. null for discrete cards.'],
    ['msrp_usd', 'number | null', 'Launch price in US dollars, where known.'],
  ];

  const envelopeExample = `{
  "schema_version": ${SCHEMA_VERSION},
  "updated": "${DATA_UPDATED}",
  "license": "MIT",
  "source": "${SITE_URL}",
  "docs": "${SITE_URL}${path}",
  "count": ${models.length},
  "models": [ … ]
}`;

  const curlExample = `curl -s ${modelsUrl} \\
  | jq '.models[] | select(.name == "Llama 3.1 8B") | {quantization, weight_gb, kv_per_1k_gb}'`;

  const jsExample = `const res = await fetch('${modelsUrl}');
const { models } = await res.json();

// VRAM for a model at a given context: weights + KV cache
const vramFor = (m, contextK) => m.weight_gb + m.kv_per_1k_gb * Math.min(contextK, m.max_context_k);

const fits24 = models.filter((m) => vramFor(m, 16) <= 24);
console.log(fits24.map((m) => \`\${m.name} \${m.quantization}\`));`;

  const pyExample = `import json, urllib.request

url = "${modelsUrl}"
models = json.load(urllib.request.urlopen(url))["models"]

vram_gb, context_k = 24, 32
for m in models:
    need = m["weight_gb"] + m["kv_per_1k_gb"] * min(context_k, m["max_context_k"])
    if need <= vram_gb:
        print(f'{m["name"]} {m["quantization"]}: {need:.1f} GB  {m["url"]}')`;
</script>

<svelte:head>
  <title>{docTitle}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href="{SITE_URL}{path}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="{SITE_URL}{path}" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:site_name" content={SITE_NAME} />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  {@html jsonLdScript(jsonLd)}
</svelte:head>

<OgImage />

<div class="prose">
  <h1>Open dataset: LLM memory needs and GPUs</h1>
  <p class="subtitle">
    The data behind this site, as two JSON files: {models.length} model rows ({modelCount} models, one row per
    quantization) and {gpus.length} GPUs. MIT licensed, updated {DATA_UPDATED}.
  </p>

  <div class="downloads">
    <a href="{base}{DATASET_PATHS.models}" class="download">
      <span class="file">{DATASET_PATHS.models}</span>
      <span class="meta">{models.length} rows · weights, KV cache, context, benchmarks</span>
    </a>
    <a href="{base}{DATASET_PATHS.gpus}" class="download">
      <span class="file">{DATASET_PATHS.gpus}</span>
      <span class="meta">{gpus.length} rows · VRAM, bandwidth, price</span>
    </a>
  </div>

  <h2>What it’s for</h2>
  <p>
    Answering “will this model fit on that GPU, and with how much context?” needs two numbers per model that
    are hard to find in one place: the real size of the quantized weights, and how much memory each token of
    context costs. This dataset has both for every model the site tracks, measured the same way, so you can
    use them in your own tool, script or comparison.
  </p>
  <p>
    Memory needed at a context of <em>C</em> thousand tokens is
    <code>weight_gb + kv_per_1k_gb × min(C, max_context_k)</code>. The site adds about 1 GB of runtime
    overhead when estimating speed, and treats under 16K of usable context as a tight fit.
  </p>

  <h2>How it’s produced</h2>
  <ul>
    <li>
      <strong>Weights</strong> are the actual GGUF file sizes on Hugging Face (from the model’s official GGUF
      repo or a widely used quantizer such as bartowski or unsloth), summed across shards. Vision projectors
      (mmproj), multi-token-prediction and draft-model files are left out.
    </li>
    <li>
      <strong>KV cache</strong> is computed from the model’s <code>config.json</code>:
      <code>2 × layers × kv_heads × head_dim × 2 bytes × 1000 ÷ 2³⁰</code> for fp16 keys and values. Only layers
      whose cache grows with the context count: full-attention layers (and DeepSeek-style sparse attention).
      Sliding-window, linear-attention and convolution layers in hybrid models hold a fixed-size state and are
      left out. Multi-head latent attention models (DeepSeek, GLM-5, Mistral Large 3) store one compressed
      latent per token per layer, so there is no ×2 for keys and values.
    </li>
    <li>
      <strong>Mixture-of-experts</strong> models carry <code>active_weight_gb</code>: the weights scaled by
      active ÷ total parameters, which is what each generated token has to read, and so what sets speed.
      All of <code>weight_gb</code> still has to fit in memory.
    </li>
    <li>
      <strong>Benchmarks</strong> are taken from model cards and public leaderboards: MMLU-Pro for
      <code>mmlu_score</code> and SWE-bench Verified for <code>swe_bench_score</code>. They are never estimated;
      a missing score is null.
    </li>
    <li>
      <strong>GPUs</strong>: memory and bandwidth from manufacturer specifications and datasheets.
    </li>
  </ul>
  <p>
    Rows are added by a script that flags weight sizes far from what the parameter count and quantization
    imply (the usual sign of a missing shard or a stray auxiliary file), and every release passes the same
    validation tests that guard the site, such as identical features across a model’s quantizations and lighter
    quantizations being smaller. The scripts that build the
    data are in the <a href="https://github.com/BenD10/whatmodels/tree/main/scripts" target="_blank" rel="noopener">GitHub repo</a>.
  </p>

  <h2>Format</h2>
  <p>Each file is one JSON object: a small envelope, then the rows under <code>models</code> or <code>gpus</code>.</p>
  <pre><code>{envelopeExample}</code></pre>
  <p>
    Rows are sorted by <code>id</code> and every row has every field, with <code>null</code> where a value doesn’t
    apply, so a diff between two releases shows only what changed. GB means 2³⁰ bytes throughout.
  </p>

  <h3>Model fields</h3>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Field</th><th>Type</th><th>Meaning</th></tr></thead>
      <tbody>
        {#each modelFields as [name, type, meaning]}
          <tr><td><code>{name}</code></td><td class="type">{type}</td><td>{meaning}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>

  <h3>GPU fields</h3>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Field</th><th>Type</th><th>Meaning</th></tr></thead>
      <tbody>
        {#each gpuFields as [name, type, meaning]}
          <tr><td><code>{name}</code></td><td class="type">{type}</td><td>{meaning}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>

  <h2>Examples</h2>
  <h3>curl and jq</h3>
  <pre><code>{curlExample}</code></pre>
  <h3>JavaScript</h3>
  <pre><code>{jsExample}</code></pre>
  <h3>Python</h3>
  <pre><code>{pyExample}</code></pre>

  <h2>Updates and versioning</h2>
  <p>
    The data is refreshed about every two weeks, and never more than a month apart; <code>updated</code> is the
    date of the release. URLs stay the same, so fetch them fresh rather than caching for long.
  </p>
  <p>
    <code>schema_version</code> is {SCHEMA_VERSION}. Additive changes (new rows, new fields, new values in
    <code>features</code> or <code>quantization</code>) keep the version, so ignore fields you don’t know.
    Breaking changes (renaming or removing a field, or changing its unit or meaning) bump it. Corrections to
    values are ordinary updates.
  </p>

  <h2>Licence and attribution</h2>
  <p>
    The dataset is MIT licensed, like the <a href="https://github.com/BenD10/whatmodels" target="_blank" rel="noopener">site’s code</a>.
    Use it in anything, commercial or not. Attribution is appreciated: a link to
    <a href="{base}/">whatmodelscanirun.com</a> (or to a row’s <code>url</code>) helps other people find the
    full tool.
  </p>
  <p>
    Spotted a wrong number? <a href="https://github.com/BenD10/whatmodels/issues" target="_blank" rel="noopener">Open an issue</a>
    with the source and it will be fixed in the next release.
  </p>
</div>

<style>
  .prose {
    color: var(--text-muted);
    line-height: 1.75;
  }

  .prose h1 {
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.2rem;
  }

  .subtitle {
    font-size: 0.9rem;
    margin-bottom: 1.25rem;
  }

  .prose h2 {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text);
    margin: 2rem 0 0.5rem;
  }

  .prose h3 {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
    margin: 1.5rem 0 0.5rem;
  }

  .prose p {
    font-size: 0.95rem;
    margin-bottom: 0.75rem;
  }

  .prose ul {
    padding-left: 1.25rem;
    margin-bottom: 0.75rem;
  }

  .prose li {
    font-size: 0.95rem;
    margin-bottom: 0.4rem;
  }

  .prose strong {
    color: var(--text);
  }

  .prose a {
    color: var(--accent);
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.85em;
    color: var(--text);
  }

  pre {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.85rem 1rem;
    margin-bottom: 1rem;
    overflow-x: auto;
    line-height: 1.5;
  }

  pre code {
    font-size: 0.8rem;
    white-space: pre;
  }

  .downloads {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .download {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.75rem 1rem;
    background: var(--accent-dim);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    text-decoration: none;
    transition: background 0.15s;
  }

  .download:hover {
    background: var(--surface-hover);
  }

  .download .file {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9rem;
    color: var(--accent);
    font-weight: 600;
  }

  .download .meta {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .table-wrap {
    overflow-x: auto;
    margin-bottom: 1rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    line-height: 1.5;
  }

  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--border);
  }

  th {
    color: var(--text);
    font-weight: 600;
  }

  td:first-child {
    white-space: nowrap;
  }

  .type {
    white-space: nowrap;
    font-size: 0.8rem;
  }

  @media (max-width: 600px) {
    table {
      font-size: 0.8rem;
    }

    .type {
      white-space: normal;
    }
  }
</style>
