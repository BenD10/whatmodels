<script>
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { replaceState } from '$app/navigation';
  import GpuInput from '$lib/components/GpuInput.svelte';
  import ModelResults from '$lib/components/ModelResults.svelte';

  let vram = $state(null);
  let bandwidth = $state(null);
  let minContextK = $state(null);
  let minTokPerSec = $state(null);

  // Read initial values from URL query params (client-side only)
  let initialGpuId = $state('');
  let initialMemIdx = $state('');
  let initialManualVram = $state('');
  let initialContextK = $state('');
  let initialSpeed = $state('');
  let ready = $state(false);

  onMount(() => {
    const params = new URL(window.location.href).searchParams;
    initialGpuId = params.get('gpu') ?? '';
    initialMemIdx = params.get('mem') ?? '';
    initialManualVram = params.get('vram') ?? '';
    initialContextK = params.get('ctx') ?? '';
    initialSpeed = params.get('speed') ?? '';
    ready = true;
  });

  function onStateChange(state) {
    if (!browser) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('gpu');
    url.searchParams.delete('mem');
    url.searchParams.delete('vram');
    url.searchParams.delete('ctx');
    url.searchParams.delete('speed');

    if (state.gpuId) url.searchParams.set('gpu', state.gpuId);
    if (state.memIdx !== '') url.searchParams.set('mem', state.memIdx);
    if (state.manualVram) url.searchParams.set('vram', state.manualVram);
    if (state.contextK !== '') url.searchParams.set('ctx', state.contextK);
    if (state.speed !== '') url.searchParams.set('speed', state.speed);

    replaceState(url, {});
  }
</script>

<svelte:head>
  <meta name="description" content="Pick the right AI model for your GPU — in seconds. Check VRAM, bandwidth, and context size compatibility." />
</svelte:head>

<div class="page">
  {#key ready}
  <GpuInput
    bind:vram
    bind:bandwidth
    bind:minContextK
    bind:minTokPerSec
    {initialGpuId}
    {initialMemIdx}
    {initialManualVram}
    {initialContextK}
    {initialSpeed}
    onstatechange={onStateChange}
  />
  {/key}

  <section class="results-section">
    <h2>Results</h2>
    <ModelResults {vram} {bandwidth} {minContextK} {minTokPerSec} />
  </section>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  h2 {
    font-size: 1.2rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
  }
</style>
