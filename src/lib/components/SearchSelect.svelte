<script>
  /**
   * Searchable dropdown / combobox with optional grouping.
   * Props:
   *   items       – array of { id, label, group? }
   *   value       – bindable selected id (string)
   *   placeholder – input placeholder text
   *   id          – HTML id for the input
   */
  let {
    items = [],
    value = $bindable(''),
    placeholder = 'Search…',
    id = '',
    onchange = () => {},
  } = $props();

  let query = $state('');
  let open = $state(false);
  let highlightIdx = $state(-1);
  let inputEl = $state(null);
  let listEl = $state(null);

  // Displayed label when a value is selected and input is not focused
  let selectedLabel = $derived(items.find((i) => i.id === value)?.label ?? '');

  let filtered = $derived.by(() => {
    const base = !query
      ? items
      : items.filter((i) => {
          const q = query.toLowerCase();
          return i.label.toLowerCase().includes(q) || (i.group && i.group.toLowerCase().includes(q));
        });
    return base;
  });

  // Build grouped structure: [{ group: string|null, items: [...] }, ...]
  let groupedFiltered = $derived.by(() => {
    const groups = [];
    let currentGroup = null;
    for (const item of filtered) {
      const g = item.group ?? null;
      if (g !== currentGroup) {
        groups.push({ group: g, items: [item] });
        currentGroup = g;
      } else {
        groups[groups.length - 1].items.push(item);
      }
    }
    return groups;
  });

  // Flat index mapping for keyboard navigation (skips group headers)
  let flatFiltered = $derived(filtered);

  function selectItem(item) {
    value = item.id;
    query = '';
    open = false;
    highlightIdx = -1;
    onchange();
  }

  function clear() {
    value = '';
    query = '';
    open = false;
    highlightIdx = -1;
    onchange();
  }

  function onFocus() {
    open = true;
    query = '';
    highlightIdx = -1;
  }

  function onBlur(e) {
    // Delay to allow click on list item to register
    setTimeout(() => {
      open = false;
      query = '';
      highlightIdx = -1;
    }, 150);
  }

  function onInput() {
    open = true;
    highlightIdx = 0;
  }

  function onKeydown(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        open = true;
        highlightIdx = 0;
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        highlightIdx = Math.min(highlightIdx + 1, flatFiltered.length - 1);
        scrollToHighlighted();
        break;
      case 'ArrowUp':
        e.preventDefault();
        highlightIdx = Math.max(highlightIdx - 1, 0);
        scrollToHighlighted();
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIdx >= 0 && highlightIdx < flatFiltered.length) {
          selectItem(flatFiltered[highlightIdx]);
          inputEl?.blur();
        }
        break;
      case 'Escape':
        open = false;
        query = '';
        highlightIdx = -1;
        inputEl?.blur();
        break;
    }
  }

  function scrollToHighlighted() {
    // Wait for DOM update
    requestAnimationFrame(() => {
      const el = listEl?.querySelector(`[data-idx="${highlightIdx}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    });
  }
</script>

<div class="search-select" role="combobox" aria-expanded={open} aria-controls="{id}-listbox" aria-haspopup="listbox">
  <input
    {id}
    type="text"
    autocomplete="off"
    {placeholder}
    bind:this={inputEl}
    bind:value={query}
    onfocus={onFocus}
    onblur={onBlur}
    oninput={onInput}
    onkeydown={onKeydown}
    aria-autocomplete="list"
  />
  {#if !open && value}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <span class="selected-display" onclick={() => inputEl?.focus()}>
      {selectedLabel}
    </span>
  {/if}
  {#if value && !open}
    <button class="clear-btn" onclick={clear} aria-label="Clear selection">&times;</button>
  {/if}

  {#if open}
    <ul class="dropdown" role="listbox" id="{id}-listbox" bind:this={listEl}>
      {#if flatFiltered.length === 0}
        <li class="no-results">No matches</li>
      {:else}
        {#each groupedFiltered as group}
          {#if group.group}
            <li class="group-header">{group.group}</li>
          {/if}
          {#each group.items as item}
            {@const flatIdx = flatFiltered.indexOf(item)}
            <li
              role="option"
              aria-selected={item.id === value}
              data-idx={flatIdx}
              class:highlighted={flatIdx === highlightIdx}
              class:selected={item.id === value}
              onmousedown={() => selectItem(item)}
              onmouseenter={() => (highlightIdx = flatIdx)}
            >
              {item.label}
            </li>
          {/each}
        {/each}
      {/if}
    </ul>
  {/if}
</div>

<style>
  .search-select {
    position: relative;
    min-width: 240px;
  }

  input {
    width: 100%;
    padding: 0.55rem 2rem 0.55rem 0.75rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font: inherit;
    transition: border-color 0.15s;
  }

  input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .selected-display {
    position: absolute;
    top: 0;
    left: 0;
    right: 2rem;
    bottom: 0;
    display: flex;
    align-items: center;
    padding: 0 0.75rem;
    font-size: inherit;
    pointer-events: none;
    color: var(--text);
    background: var(--bg);
    border-radius: var(--radius-sm);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .clear-btn {
    position: absolute;
    top: 50%;
    right: 0.5rem;
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
    max-height: 240px;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 0.25rem 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    z-index: 100;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }

  .dropdown::-webkit-scrollbar {
    width: 6px;
  }

  .dropdown::-webkit-scrollbar-track {
    background: transparent;
  }

  .dropdown::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }

  .dropdown::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }

  .dropdown li {
    padding: 0.45rem 0.75rem;
    cursor: pointer;
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dropdown li.group-header {
    padding: 0.5rem 0.75rem 0.25rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    cursor: default;
    pointer-events: none;
  }

  .dropdown li.group-header:not(:first-child) {
    margin-top: 0.25rem;
    border-top: 1px solid var(--border);
    padding-top: 0.6rem;
  }

  .dropdown li.highlighted {
    background: var(--accent-dim);
  }

  .dropdown li.selected {
    color: var(--accent);
  }

  .dropdown li.no-results {
    color: var(--text-muted);
    font-style: italic;
    cursor: default;
  }
</style>
