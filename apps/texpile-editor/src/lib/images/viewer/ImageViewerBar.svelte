<script lang="ts">
	// the image tab's bar: the image's size, zoom, and the switch that turns editing on
	import { Maximize, SquarePen, ZoomIn, ZoomOut } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import PreviewToolbar from '$lib/preview/PreviewToolbar.svelte';
	import ZoomMenu from '$lib/preview/zoom/ZoomMenu.svelte';
	import type { ImageViewport } from './imageViewport.svelte';

	type Props = { view: ImageViewport; size: string; editing: boolean; editable: boolean; onedit: () => void };
	const props: Props = $props();

	const editTip = $derived(props.editable ? 'Edit image' : 'Editing works on PNG, JPEG and WebP images.');
</script>

{#snippet size()}
	<span class="text-muted px-1 text-xs tabular-nums">{props.size}</span>
{/snippet}

{#snippet zoom()}
	<button onclick={() => props.view.zoomOut()} aria-label="Zoom out" use:tip={'Zoom out'}><ZoomOut size={16} /></button>
	<ZoomMenu
		scale={props.view.scale}
		fits={[{ label: 'Fit', icon: Maximize, run: () => props.view.fit() }]}
		presets={[25, 50, 100, 200, 400]}
		onscale={(scale) => props.view.zoomTo(scale)}
	/>
	<button onclick={() => props.view.zoomIn()} aria-label="Zoom in" use:tip={'Zoom in'}><ZoomIn size={16} /></button>
{/snippet}

{#snippet edit()}
	<button aria-pressed={props.editing} disabled={!props.editable} onclick={props.onedit} aria-label="Edit image" use:tip={editTip}>
		<SquarePen size={16} />
	</button>
{/snippet}

<PreviewToolbar
	inEditor
	dividers={false}
	groups={[
		{ id: 'size', foldsFirst: true, render: size },
		{ id: 'zoom', render: zoom },
		{ id: 'edit', pinned: true, alignEnd: true, render: edit }
	]}
/>
