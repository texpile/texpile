<script lang="ts">
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { Node as PMNode } from 'prosemirror-model';
	import type { VisualView } from '$lib/editor/canvas';
	import { inEditorPane, returnFocusToText } from '$lib/languages/latex/visual/core';
	import CitationEditForm from './CitationEditForm.svelte';

	type GearPlace = () => { x: number; y: number; width: number; height: number };
	type CitationPopoverProps = {
		view: VisualView;
		readonly node: PMNode;
		onUpdate: (attrs: Record<string, unknown>) => void;
		onChangeKey: (key: string) => void;
	};

	const props: CitationPopoverProps = $props();
	let open = $state(false);
	let place = $state.raw<GearPlace | null>(null);
	const positioning = $derived(
		inEditorPane({ placement: 'bottom-start', offset: { mainAxis: 4 }, ...(place ? { getAnchorRect: place } : {}) })
	);

	export function openAt(at: GearPlace | null = null): void {
		place = at;
		open = true;
	}

	function close(): void {
		open = false;
		returnFocusToText(props.view);
	}
</script>

<Popover
	{open}
	onOpenChange={(e) => {
		if (!e.open) close();
	}}
	restoreFocus={false}
	{positioning}
>
	<Popover.Trigger class="size-full" aria-hidden="true" tabindex={-1}></Popover.Trigger>
	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content
				class="card bg-surface-50-950 border-surface-300-700 z-[200] max-h-[var(--available-height)] max-w-[min(90vw,28rem)] min-w-[300px] overflow-y-auto border p-4 shadow-lg"
			>
				<!-- mounted on open only: the form lists the whole bibliography -->
				{#if open}
					<CitationEditForm node={props.node} onUpdate={props.onUpdate} onChangeKey={props.onChangeKey} onClose={close} />
				{/if}
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
