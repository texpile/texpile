<script lang="ts">
	import { referenceStore } from '$lib/stores/editorStore';
	import { m } from '$lib/paraglide/messages';
	import { entryParts, sortedReferences } from './bibliographyEntries';

	type Props = { heading?: string; selected?: boolean };
	const props: Props = $props();
	const { heading, selected } = $derived({ heading: props.heading ?? 'Bibliography', selected: props.selected ?? false });

	const LIMIT = 6;
	let expanded = $state(false);
	const refs = $derived(sortedReferences(referenceStore.current ?? []));
	const shown = $derived(expanded ? refs : refs.slice(0, LIMIT));
</script>

<div class="bibliography-preview rounded-base my-4 select-none {selected ? 'ring-primary-500 ring-2' : ''}">
	<h2 class="mt-0 mb-2 text-2xl font-semibold">{heading}</h2>
	{#if refs.length === 0}
		<p class="text-muted italic">{m.bibliography_empty()}</p>
	{:else}
		<div class="flex flex-col gap-1.5">
			{#each shown as r (r.key)}
				<p class="m-0 pl-8 -indent-8">
					{#each entryParts(r) as part, i (i)}
						{#if part.look === 'title'}<em>{part.text}</em>{:else}<span class={part.look === 'muted' ? 'text-muted' : ''}>{part.text}</span
							>{/if}
					{/each}
				</p>
			{/each}
		</div>
		{#if refs.length > LIMIT && !expanded}
			<button class="anchor mt-2 text-sm" onmousedown={(e) => e.stopPropagation()} onclick={() => (expanded = true)}
				>{m.bibliography_show_all({ count: refs.length })}</button
			>
		{/if}
	{/if}
</div>
