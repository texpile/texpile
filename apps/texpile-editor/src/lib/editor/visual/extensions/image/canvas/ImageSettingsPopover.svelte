<script lang="ts">
	import { inEditorPane } from '$lib/editor/visual/editorPanePositioning';
	import type { GearPlace } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { Node as PMNode } from 'prosemirror-model';
	import type { EditorView } from 'prosemirror-view';
	import type { Dialect } from '$lib/editor/visual/dialect';
	import ImageSettingsPanel from '../ImageSettingsPanel.svelte';
	import type { ImageMeasure } from '../imageMeasure';

	type ImageSettingsPopoverProps = {
		node: PMNode;
		view: EditorView;
		getPos: () => number | undefined;
		dialect: Dialect;
		measure: () => ImageMeasure;
	};

	const props: ImageSettingsPopoverProps = $props();
	let settingsOpen = $state(false);
	let place = $state.raw<GearPlace | null>(null);
	const positioning = $derived(
		inEditorPane({ placement: 'bottom-end', offset: { mainAxis: 4 }, ...(place ? { getAnchorRect: place } : {}) })
	);

	export function open(at: GearPlace | null = null): void {
		place = at;
		settingsOpen = true;
	}
</script>

<Popover open={settingsOpen} onOpenChange={(e) => (settingsOpen = e.open)} {positioning}>
	<Popover.Trigger class="size-full" aria-hidden="true" tabindex={-1}></Popover.Trigger>
	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content class="card bg-surface-50-950 border-surface-300-700 min-w-[250px] border shadow-lg">
				{#if settingsOpen}
					<ImageSettingsPanel node={props.node} view={props.view} getPos={props.getPos} dialect={props.dialect} measure={props.measure} />
				{/if}
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
