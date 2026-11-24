<script lang="ts">
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { Node as PMNode } from 'prosemirror-model';
	import { inEditorPane } from '$lib/languages/typst/visual/core';
	import TypstRefEditForm from './TypstRefEditForm.svelte';

	type GearPlace = () => { x: number; y: number; width: number; height: number };
	type TypstRefPopoverProps = {
		readonly node: PMNode;
		parse: (source: string) => PMNode;
		onUpdate: (attrs: Record<string, unknown>) => void;
		onChangeKey: (key: string) => void;
	};

	const props: TypstRefPopoverProps = $props();
	let dropdownOpen = $state(false);
	let place = $state.raw<GearPlace | null>(null);
	const positioning = $derived(
		inEditorPane({ placement: 'bottom-start', offset: { mainAxis: 4 }, ...(place ? { getAnchorRect: place } : {}) })
	);

	export function open(at: GearPlace | null = null): void {
		place = at;
		dropdownOpen = true;
	}
</script>

<Popover open={dropdownOpen} onOpenChange={(e) => (dropdownOpen = e.open)} {positioning}>
	<Popover.Trigger class="size-full" aria-hidden="true" tabindex={-1}></Popover.Trigger>
	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content
				class="card bg-surface-50-950 border-surface-300-700 z-[200] max-h-[var(--available-height)] max-w-[min(90vw,28rem)] min-w-[300px] overflow-y-auto border p-4 shadow-lg"
			>
				<!-- mounted on open only: the form lists the whole bibliography -->
				{#if dropdownOpen}
					<TypstRefEditForm
						node={props.node}
						onUpdate={props.onUpdate}
						onChangeKey={props.onChangeKey}
						parse={props.parse}
						bind:dropdownOpen
					/>
				{/if}
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
