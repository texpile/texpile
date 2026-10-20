<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import { unavailableTip } from '$lib/components/tooltip.svelte';
	import { prefsFocus } from '../search/prefsFocus.svelte';
	import { rowDef, type PrefsRowDef, type PrefsRowId } from '../search/prefsRows';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		id: PrefsRowId;
		/** why the row is grayed out; a click shows it as well as a hover */
		why?: string;
		docs?: string;
		icon?: Component<{ class?: string }>;
		/** block leaves the whole row to the children */
		layout?: 'split' | 'block';
		/** none leaves out the row's rule and padding, for a part of a larger block */
		frame?: 'row' | 'none';
		children: Snippet<[PrefsRowDef]>;
		below?: Snippet;
	};
	const props: Props = $props();
	const def = $derived(rowDef(props.id));
	const Icon = $derived(props.icon);
	const note = $derived(def.note?.() ?? '');
</script>

<div
	class="rounded-base transition-colors duration-500 {props.frame === 'none'
		? ''
		: 'border-surface-200-800 border-b py-4 last:border-b-0'} {props.layout === 'block'
		? ''
		: 'flex items-start justify-between gap-6'} {prefsFocus.row === props.id ? 'bg-primary-tint -mx-2 px-2' : ''}"
	data-pref-row={props.id}
	use:unavailableTip={props.why}
>
	{#if props.layout === 'block'}
		{@render props.children(def)}
	{:else}
		<div class="flex min-w-0 items-center gap-2">
			{#if Icon}<Icon class="text-muted size-4 shrink-0" />{/if}
			<div class="min-w-0">
				<div class="text-sm font-medium {props.why ? 'text-faint' : ''}">{def.label()}</div>
				{#if note}<p class="text-muted mt-1 text-xs leading-relaxed">
						{note}
						{#if props.docs}<a class="anchor" href={props.docs} target="_blank" rel="noopener noreferrer">{m.prefs_how_to_set_up()}</a>{/if}
					</p>{/if}
				{@render props.below?.()}
			</div>
		</div>
		<span class="flex shrink-0" data-tip-anchor>{@render props.children(def)}</span>
	{/if}
</div>
