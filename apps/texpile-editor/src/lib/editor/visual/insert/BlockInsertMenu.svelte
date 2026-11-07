<script lang="ts">
	// the block handle's insert list: a search over what the file offers, by LyX's categories
	import InsertSearchField from './InsertSearchField.svelte';
	import { groupedByCategory } from './insertCategories';
	import type { BlockInsertItem } from './insertItem';
	import { matchingItems } from './insertSearch';
	import { menuGroupLabelClass } from '$lib/menus/menuStyles';
	import { m } from '$lib/paraglide/messages';

	type Props = { items: readonly BlockInsertItem[]; onInsert: (item: BlockInsertItem) => void };
	const props: Props = $props();

	let query = $state('');
	const shown = $derived(matchingItems(props.items, query));
	// a search lists its rows by match, which the categories would cut into pieces
	const groups = $derived(query.trim() ? [{ key: 'found', label: null, items: shown }] : groupedByCategory(shown));
	const rows = $derived(groups.flatMap((group) => group.items));
	let activeIndex = $state(0);
	const active = $derived(rows[Math.min(activeIndex, rows.length - 1)]);

	function moveActive(step: 1 | -1) {
		if (!rows.length) return;
		const index = Math.min(activeIndex, rows.length - 1);
		activeIndex = (index + step + rows.length) % rows.length;
	}

	function scrollIntoView(node: HTMLElement, isActive: boolean) {
		if (isActive) node.scrollIntoView({ block: 'nearest' });
		return { update: (now: boolean) => now && node.scrollIntoView({ block: 'nearest' }) };
	}
</script>

<InsertSearchField
	value={query}
	onInput={(value) => {
		query = value;
		activeIndex = 0;
	}}
	onEnter={() => active && props.onInsert(active)}
	onMove={moveActive}
/>
<div class="max-h-80 overflow-y-auto p-1">
	{#each groups as group (group.key)}
		{#if group.label}
			<div class={menuGroupLabelClass}>{group.label}</div>
		{/if}
		{#each group.items as item (item.id)}
			<button
				type="button"
				class:preset-tonal={item === active}
				use:scrollIntoView={item === active}
				class="hover:preset-tonal rounded-base flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm"
				onmousedown={(e) => {
					e.preventDefault();
					props.onInsert(item);
				}}
			>
				<item.icon class="text-muted size-4 shrink-0" />
				<span class="cap-center truncate">{item.label}</span>
				{#if item.hint}<span class="cap-center text-muted ml-auto shrink-0 pl-2 text-xs">{item.hint}</span>{/if}
			</button>
		{/each}
	{:else}
		<div class="text-muted px-2 py-1.5 text-sm">{m.insert_search_none()}</div>
	{/each}
</div>
