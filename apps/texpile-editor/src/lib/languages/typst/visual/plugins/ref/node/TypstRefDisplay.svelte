<script lang="ts">
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { Node as PMNode } from 'prosemirror-model';
	import { inEditorPane, isReadOnly, referenceStore, tip } from '$lib/languages/typst/visual/core';
	import { typstRefFace } from './typstRefFace';
	import type { RefNumbers } from './refNumbers.svelte';
	import TypstRefEditForm from './TypstRefEditForm.svelte';

	let {
		node,
		numbers,
		onUpdate,
		onChangeKey,
		parse
	}: {
		node: PMNode;
		numbers: RefNumbers;
		parse: (source: string) => PMNode;
		onUpdate: (attrs: Record<string, unknown>) => void;
		onChangeKey: (key: string) => void;
	} = $props();

	let dropdownOpen = $state(false);

	// the bibliography loads after the doc first renders; the chip upgrades from @key when it lands
	const face = $derived(typstRefFace(node.attrs, referenceStore.current, numbers.labels));

	// preventDefault keeps the click from moving the selection onto the atom
	function handleClick(e: Event) {
		e.preventDefault();
		e.stopPropagation();
		if (isReadOnly.current) return;
		dropdownOpen = !dropdownOpen;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') handleClick(e);
	}
</script>

<Popover
	open={dropdownOpen}
	onOpenChange={(e) => (dropdownOpen = e.open)}
	positioning={inEditorPane({ placement: 'bottom-start', offset: { mainAxis: 4 } })}
>
	<Popover.Trigger class="inline-flex cursor-pointer items-center">
		<span
			class="typ-ref rounded-base cursor-pointer transition-colors"
			class:py-0.5={face.kind === 'label'}
			class:text-ref-fg={face.known}
			class:bg-ref-bg={face.known && dropdownOpen}
			class:hover:bg-ref-bg={face.known}
			class:text-ref-broken-fg={!face.known}
			class:hover:bg-ref-broken-bg={!face.known}
			use:tip={face.title}
			role="button"
			tabindex="0"
			onclick={handleClick}
			onkeydown={handleKeydown}>{face.text}</span
		>
	</Popover.Trigger>

	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content
				class="card bg-surface-50-950 border-surface-300-700 z-[200] max-h-[var(--available-height)] max-w-[min(90vw,28rem)] min-w-[300px] overflow-y-auto border p-4 shadow-lg"
			>
				<!-- mounted on open only: the form lists the whole bibliography -->
				{#if dropdownOpen}
					<TypstRefEditForm {node} {onUpdate} {onChangeKey} {parse} bind:dropdownOpen />
				{/if}
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
<!-- zero-width space so the cursor can land after the reference -->
<span style="font-size: 1rem;">&#8203;</span>
