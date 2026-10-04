<script lang="ts">
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { Node as PMNode } from 'prosemirror-model';
	import { inEditorPane } from '$lib/editor/visual/editorPanePositioning';
	import { referenceStore } from '$lib/stores/editorStore';
	import { isReadOnly } from '$lib/stores/permissionStore';
	import { typstRefFace } from './typstRefFace';
	import TypstRefEditForm from './TypstRefEditForm.svelte';

	let {
		node,
		onUpdate,
		onChangeKey
	}: {
		node: PMNode;
		onUpdate: (attrs: Record<string, unknown>) => void;
		onChangeKey: (key: string) => void;
	} = $props();

	let dropdownOpen = $state(false);

	// the bibliography loads after the doc first renders; the chip upgrades from @key when it lands
	const face = $derived(typstRefFace(node.attrs, referenceStore.current));

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
	<Popover.Trigger class="inline-flex cursor-pointer items-center" style="font-size: 1rem;">
		<span
			class={face.known ? 'typ-ref typ-ref-known' : 'typ-ref'}
			title={face.title}
			role="button"
			tabindex="0"
			onclick={handleClick}
			onkeydown={handleKeydown}>{face.text}</span
		>
	</Popover.Trigger>

	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content
				class="card bg-surface-50-950 border-surface-300-700 z-[200] max-w-[min(90vw,28rem)] min-w-[300px] border p-4 shadow-lg"
			>
				<!-- mounted on open only: the form lists the whole bibliography -->
				{#if dropdownOpen}
					<TypstRefEditForm {node} {onUpdate} {onChangeKey} bind:dropdownOpen />
				{/if}
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
<!-- zero-width space so the cursor can land after the reference -->
<span style="font-size: 1rem;">&#8203;</span>
