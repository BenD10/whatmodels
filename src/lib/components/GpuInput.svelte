<script>
  import gpus from '$lib/data/gpus.json';
  import SearchSelect from './SearchSelect.svelte';

  const gpuItems = gpus.map((g) => ({
    id: g.id,
    label: `${g.name} (${g.vram_gb} GB)`,
    group: g.manufacturer,
  }));

  const CONTEXT_OPTIONS = [
    { value: null, label: 'Any' },
    { value: 2, label: '2K' },
    { value: 4, label: '4K' },
    { value: 8, label: '8K' },
    { value: 16, label: '16K' },
    { value: 32, label: '32K' },
    { value: 64, label: '64K' },
    { value: 128, label: '128K' },
  ];

  const SPEED_OPTIONS = [
    { value: null, label: 'Any' },
    { value: 5, label: '5 tok/s' },
    { value: 10, label: '10 tok/s' },
    { value: 20, label: '20 tok/s' },
    { value: 30, label: '30 tok/s' },
    { value: 50, label: '50 tok/s' },
    { value: 100, label: '100 tok/s' },
  ];

  let { vram = $bindable(null), bandwidth = $bindable(null), minContextK = $bindable(null), minTokPerSec = $bindable(null) } = $props();

  let selectedGpuId = $state('');
  let manualVram = $state('');
  let contextSelection = $state('');
  let speedSelection = $state('');

  function onGpuChange() {
    manualVram = '';
    const gpu = gpus.find((g) => g.id === selectedGpuId);
    vram = gpu ? gpu.vram_gb : null;
    bandwidth = gpu ? gpu.bandwidth_gbps : null;
  }

  function onManualInput() {
    selectedGpuId = '';
    const val = parseFloat(manualVram);
    vram = !Number.isNaN(val) && val > 0 ? val : null;
    bandwidth = null; // unknown for manual entry
  }

  function onContextChange() {
    minContextK = contextSelection === '' ? null : Number(contextSelection);
  }

  function onSpeedChange() {
    minTokPerSec = speedSelection === '' ? null : Number(speedSelection);
  }
</script>

<section class="gpu-input">
  <div class="row gpu-row">
    <div class="field gpu-field">
      <label for="gpu-select">Select your GPU</label>
      <SearchSelect
        id="gpu-select"
        items={gpuItems}
        bind:value={selectedGpuId}
        placeholder="Search GPUs…"
        onchange={onGpuChange}
      />
    </div>

    <span class="divider">or</span>

    <div class="field vram-field">
      <label for="vram-manual">VRAM (GB)</label>
      <input
        id="vram-manual"
        type="number"
        min="0"
        step="0.5"
        placeholder="e.g. 8"
        bind:value={manualVram}
        oninput={onManualInput}
      />
    </div>
  </div>

  <div class="row">
    <div class="field">
      <label for="context-select">Minimum context window</label>
      <select id="context-select" bind:value={contextSelection} onchange={onContextChange}>
        {#each CONTEXT_OPTIONS as opt}
          <option value={opt.value ?? ''}>{opt.label}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <label for="speed-select">Minimum tokens/sec</label>
      <select id="speed-select" bind:value={speedSelection} onchange={onSpeedChange}>
        {#each SPEED_OPTIONS as opt}
          <option value={opt.value ?? ''}>{opt.label}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="effective">
    {#if vram != null}
      Using <strong>{vram} GB</strong> VRAM{#if minContextK != null}, need at least <strong>{minContextK}K</strong> context{/if}{#if minTokPerSec != null}, need at least <strong>{minTokPerSec} tok/s</strong>{/if}
    {:else}
      <span class="muted">Pick a GPU or enter VRAM to get started</span>
    {/if}
  </div>
</section>

<style>
  .gpu-input {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 1rem;
  }

  .gpu-row {
    justify-content: space-between;
  }

  .gpu-field {
    flex: 1;
    min-width: 0;
  }

  .vram-field {
    flex-shrink: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  select, input {
    padding: 0.55rem 0.75rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    transition: border-color 0.15s;
  }

  select:focus, input:focus {
    outline: none;
    border-color: var(--accent);
  }

  select {
    min-width: 180px;
    cursor: pointer;
  }

  input[type="number"] {
    width: 110px;
  }

  .divider {
    color: var(--text-muted);
    font-size: 0.85rem;
    padding-bottom: 0.55rem;
  }

  .effective {
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
    font-size: 0.9rem;
  }

  .effective strong {
    color: var(--accent);
  }

  .muted {
    color: var(--text-muted);
  }
</style>
