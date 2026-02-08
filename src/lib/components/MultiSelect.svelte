<script>
  /**
   * Multi-select dropdown with checkbox-style toggling.
   * Props:
   *   items       – array of { id, label }
   *   selected    – bindable array of selected ids
   *   placeholder – text shown when nothing selected
   *   id          – HTML id for the trigger button
   *   onchange    – callback fired after selection changes
   */
  let {
    items = [],
    selected = $bindable([]),
    placeholder = 'Any',
    id = '',
    onchange = () => {},
  } = $props();

  let open = $state(false);
  let highlightIdx = $state(-1);
  let triggerEl = $state(null);
  let listEl = $state(null);

  let displayLabel = $derived(
    selected.length === 0
      ? placeholder
      : items
          .filter((i) => selected.includes(i.id))
          .map((i) => i.label)
          .join(', ')
  );

  function toggle(itemId) {
    if (selected.includes(itemId)) {
      selected = selected.filter((s) => s !== itemId);
    } else {
      selected = [...selected, itemId];
    }
    onchange();
  }

  function clear() {
    selected = [];
    open = false;
    highlightIdx = -1;
    onchange();
  }

  function onTriggerClick() {
    open = !open;
    if (open) {
      highlightIdx = 0;
    }
  }

  function onKeydown(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open = true;
        highlightIdx = 0;
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        highlightIdx = Math.min(highlightIdx + 1, items.length - 1);
        scrollToHighlighted();
        break;
      case 'ArrowUp':
        e.preventDefault();
        highlightIdx = Math.max(highlightIdx - 1, 0);
        scrollToHighlighted();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (highlightIdx >= 0 && highlightIdx < items.length) {
          toggle(items[highlightIdx].id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        open = false;
        highlightIdx = -1;
        triggerEl?.focus();
        break;
    }
  }

  function onBlur(e) {
    // Close if focus leaves the component entirely
    setTimeout(() => {
      const root = triggerEl?.closest('.multi-select');
      if (root && !root.contains(document.activeElement)) {
        open = false;
        highlightIdx = -1;
      }
    }, 150);
  }

  function scrollToHighlighted() {
    requestAnimationFrame(() => {
      const el = listEl?.querySelector(`[data-idx="${highlightIdx}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    });
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="multi-select" onkeydown={onKeydown} onblur={onBlur}>
  <button
    {id}
    type="button"
    class="trigger"
    bind:this={triggerEl}
    onclick={onTriggerClick}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls="{id}-listbox"
  >
    <span class="trigger-label" class:placeholder={selected.length === 0}>{displayLabel}</span>
    <svg class="chevron" class:open viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
    </svg>
  </button>
  {#if selected.length > 0 && !open}
    <button class="clear-btn" onclick={clear} aria-label="Clear selection">&times;</button>
  {/if}

  {#if open}
    <ul class="dropdown" id="{id}-listbox" role="listbox" aria-multiselectable="true" bind:this={listEl}>
      {#each items as item, i}
        <li
          role="option"
          aria-selected={selected.includes(item.id)}
          data-idx={i}
          class:highlighted={i === highlightIdx}
          class:checked={selected.includes(item.id)}
          onmousedown={(e) => { e.preventDefault(); toggle(item.id); }}
          onmouseenter={() => (highlightIdx = i)}
        >
          <span class="check-box" aria-hidden="true">
            {#if selected.includes(item.id)}
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z"/></svg>
            {/if}
          </span>
          {item.label}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .multi-select {
    position: relative;
    min-width: 180px;
  }

  .trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.55rem 0.75rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font: inherit;
    cursor: pointer;
    transition: border-color 0.15s;
    text-align: left;
  }

  .trigger:focus {
    outline: none;
    border-color: var(--accent);
  }

  .trigger-label {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .trigger-label.placeholder {
    color: var(--text-muted);
  }

  .chevron {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    color: var(--text-muted);
    transition: transform 0.15s;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .clear-btn {
    position: absolute;
    top: 50%;
    right: 2rem;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0 0.25rem;
    line-height: 1;
  }

  .clear-btn:hover {
    color: var(--text);
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    max-height: 220px;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    z-index: 100;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    list-style: none;
    padding: 0.25rem 0;
    margin: 0;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }

  .dropdown li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    font-size: 0.9rem;
    white-space: nowrap;
    user-select: none;
    transition: background 0.1s;
  }

  .dropdown li.highlighted {
    background: var(--accent-dim);
  }

  .dropdown li.checked {
    color: var(--accent);
  }

  .check-box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    border-radius: 3px;
    border: 1.5px solid var(--border);
    background: var(--bg);
    transition: border-color 0.15s, background 0.15s;
  }

  .dropdown li.checked .check-box {
    border-color: var(--accent);
    background: var(--accent-dim);
  }

  .check-box svg {
    width: 0.7rem;
    height: 0.7rem;
    color: var(--accent);
  }

  @media (max-width: 600px) {
    .multi-select {
      min-width: 0;
      width: 100%;
    }
  }
</style>
