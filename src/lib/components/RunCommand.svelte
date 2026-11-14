<script>
  import { onDestroy } from 'svelte';

  /**
   * One copy-paste shell command with a copy button.
   * `label` names the tool ("Ollama"); `context` finishes the button's
   * accessible name ("Copy Ollama command for Q4_K_M"); `oncopy` fires after a
   * successful copy.
   */
  let { label, command, context = '', oncopy } = $props();

  let status = $state('idle'); // 'idle' | 'copied' | 'manual'
  let codeEl;
  let timer;

  async function writeClipboard(text) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Permission denied or no user activation: try the legacy path
      }
    }
    // Fallback for plain-HTTP previews and older browsers
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }

  function selectCommand() {
    const range = document.createRange();
    range.selectNodeContents(codeEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  async function copy() {
    const ok = await writeClipboard(command);
    if (ok) {
      status = 'copied';
      oncopy?.();
    } else {
      // Can't reach the clipboard: select the text so Ctrl/Cmd+C works
      selectCommand();
      status = 'manual';
    }
    clearTimeout(timer);
    timer = setTimeout(() => (status = 'idle'), 2000);
  }

  onDestroy(() => clearTimeout(timer));
</script>

<div class="run-command">
  <span class="tool">{label}</span>
  <code bind:this={codeEl}>{command}</code>
  <button
    type="button"
    class="copy"
    class:copied={status === 'copied'}
    aria-label="Copy {label} command{context ? ` for ${context}` : ''}"
    onclick={copy}
  >
    {status === 'copied' ? 'Copied' : 'Copy'}
  </button>
  <span class="sr-status" role="status" aria-live="polite">
    {#if status === 'copied'}Copied {label} command{:else if status === 'manual'}Selected; press Ctrl+C to copy{/if}
  </span>
</div>

<style>
  .run-command {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
  }

  .tool {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  code {
    min-width: 0;
    padding: 0.4rem 0.6rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.8rem;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow-wrap: anywhere;
    user-select: all;
  }

  .copy {
    min-width: 4.5rem;
    padding: 0.35rem 0.7rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-dim);
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .copy:hover {
    background: rgba(107, 138, 255, 0.2);
  }

  .copy:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .copy.copied {
    color: var(--fits);
    background: var(--fits-dim);
    border-color: var(--fits-border);
  }

  .sr-status {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (max-width: 600px) {
    .run-command {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .tool {
      grid-column: 1 / -1;
    }
  }
</style>
