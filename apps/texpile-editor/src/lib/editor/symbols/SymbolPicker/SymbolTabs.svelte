<script lang="ts">
	import { symbolPicker as picker } from '../symbolPicker.svelte';
	import { tabStep } from '../symbolPickerKeys';
	import { m } from '$lib/paraglide/messages';

	let { controls }: { controls: string } = $props();

	const tabs = $derived(picker.tabs);
	// a search spans every tab, so none is the one showing
	const searching = $derived(picker.query.trim() !== '');

	/** Up and Down walk the tabs and show each, as a vertical tab list does */
	function onKeydown(e: KeyboardEvent) {
		const next = tabStep(e.key, tabs.indexOf(picker.tab), tabs.length);
		if (next === null) return;
		e.preventDefault();
		picker.selectTab(tabs[next]);
		(e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-tab="${tabs[next]}"]`)?.focus();
	}
</script>

<!-- a column, as Preferences lists its sections: the categories never wrap, in any language -->
<div
	class="border-surface-200-800 flex w-36 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-1.5"
	role="tablist"
	aria-orientation="vertical"
	aria-label={m.symbols_categories_aria()}
	tabindex="-1"
	onkeydown={onKeydown}
>
	{#each tabs as tab (tab)}
		{@const selected = !searching && picker.tab === tab}
		<button
			type="button"
			role="tab"
			class="rounded-base w-full truncate px-2.5 py-1.5 text-left text-sm {selected ? 'bg-primary-tint font-medium' : 'hover:preset-tonal'}"
			data-tab={tab}
			aria-selected={selected}
			aria-controls={controls}
			tabindex={picker.tab === tab ? 0 : -1}
			onclick={() => picker.selectTab(tab)}
		>
			{picker.tabLabel(tab, m.symbols_group_recent())}
		</button>
	{/each}
</div>
