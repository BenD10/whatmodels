<svelte:head>
  <title>LLM Primer — What Models?</title>
  <meta name="description" content="A practical guide to running large language models locally — VRAM, quantization, bandwidth, context windows, and how to pick the right model for your GPU." />
</svelte:head>

<div class="prose">
  <h2>LLM Primer</h2>
  <p class="subtitle">Everything you need to know to run AI models on your own hardware.</p>

  <h3>What is a large language model?</h3>
  <p>
    A large language model (LLM) is a neural network trained to predict and generate text. It
    learns patterns from enormous amounts of data, which lets it answer questions, write code,
    summarise documents, and hold conversations. Unlike cloud AI services, open-weight models
    like Llama, Mistral, and Qwen can be downloaded and run entirely on your own hardware —
    no internet connection required during inference, no data leaving your machine.
  </p>

  <h3>Why VRAM is the bottleneck</h3>
  <p>
    A model's weights — the billions of learned numerical values that define its behaviour —
    must be loaded into GPU memory (VRAM) before it can run. There is no streaming from disk
    during generation; the full model must fit. A 7B parameter model at 16-bit precision
    occupies roughly 14 GB of VRAM, which is more than most consumer GPUs have. This is where
    quantization comes in.
  </p>

  <h3>Quantization: trading precision for size</h3>
  <p>
    Quantization compresses model weights by storing them at lower precision. Instead of a
    16-bit float per weight, you might use 4 or 8 bits. The most widely used formats are:
  </p>
  <ul>
    <li>
      <strong>Q4_K_M</strong> — approximately 4 bits per weight. A 7B model shrinks to around
      4.4 GB, fitting comfortably on an 8 GB GPU. Output quality is slightly reduced but
      usually indistinguishable from 16-bit for everyday tasks.
    </li>
    <li>
      <strong>Q8_0</strong> — approximately 8 bits per weight. The same 7B model is about
      7.7 GB. Quality is very close to full precision, at the cost of needing more VRAM.
    </li>
  </ul>
  <p>
    Models on this site are stored in the GGUF format, and the VRAM figures shown are the
    actual file sizes — what you'll download and load into memory.
  </p>

  <h3>Memory bandwidth determines speed</h3>
  <p>
    Once a model fits in VRAM, how fast it generates tokens is almost entirely determined by
    your GPU's memory bandwidth — not its compute throughput. During each generation step, the
    GPU reads the entire set of model weights once. A GPU with 1000 GB/s bandwidth reading a
    5 GB model can generate roughly 200 tokens per second. Compute cores sit idle most of the
    time during inference; the bottleneck is how quickly data can move between memory and
    the processor.
  </p>
  <p>
    This is why an RTX 4090 (1008 GB/s) runs models significantly faster than a GPU with the
    same VRAM but half the bandwidth. It's also why Apple Silicon performs so well for local
    inference: unified memory means both CPU and GPU share the same high-bandwidth pool.
  </p>

  <h3>Context windows and the KV cache</h3>
  <p>
    The context window is the maximum amount of text a model can "see" at once — both your
    input and its own previous output. A 32K context window lets you feed in long documents or
    maintain extended conversations. However, storing the context requires additional VRAM in
    the form of a KV cache. The larger the context, the more VRAM it consumes — which is why
    a model might technically fit in your VRAM but only support a 4K context when you need
    32K.
  </p>

  <h3>System RAM offloading</h3>
  <p>
    If a model is too large for your VRAM alone, runtimes like llama.cpp, Ollama, and LM
    Studio can offload some layers to system RAM, processing them on the CPU. This makes
    larger models technically runnable on modest hardware. The trade-off is speed: CPU memory
    bandwidth is typically 50–100 GB/s, versus 500–1000+ GB/s on a modern GPU. A model
    running with heavy offload can drop from 60+ tokens/sec to single digits.
  </p>

  <h3>Multi-GPU setups</h3>
  <p>
    Multiple GPUs pool their VRAM, letting you run models that no single card could hold.
    A pair of RTX 3090s gives you 48 GB of combined VRAM — enough for a 70B model at Q4_K_M.
    The bandwidth doesn't double cleanly though: PCIe interconnects between cards add
    overhead, so real-world throughput is typically 70–85% of the theoretical combined
    bandwidth. NVLink (available on some workstation cards) performs closer to the upper end
    of that range.
  </p>

  <h3>Choosing the right model</h3>
  <p>
    The right model depends on what you're doing. A few rules of thumb:
  </p>
  <ul>
    <li>For general chat and writing, Q4_K_M quality is fine. Use the largest model that fits.</li>
    <li>For coding tasks, prioritise models with a high SWE-Bench score — sort by "Coding" in the tool.</li>
    <li>For knowledge-heavy tasks (research, summarisation), MMLU score is a better proxy — sort by "General".</li>
    <li>If generation speed matters, aim for at least 15–20 tokens/sec. Below 10 tok/s feels noticeably slow.</li>
    <li>If you need long documents or extended context, filter by minimum context window first.</li>
  </ul>
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
    margin-bottom: 0.2rem;
  }

  .subtitle {
    font-size: 0.9rem;
    margin-bottom: 1.75rem;
  }

  .prose h3 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text);
    margin: 1.75rem 0 0.5rem;
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
</style>
