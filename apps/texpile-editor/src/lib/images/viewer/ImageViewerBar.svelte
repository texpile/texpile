<script lang="ts">
	// the image tab's bar: the image's size, zoom, and the switch that turns editing on; with it on, the edits
	import { Maximize, SquarePen, ZoomIn, ZoomOut } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import PreviewToolbar from '$lib/preview/PreviewToolbar.svelte';
	import ZoomMenu from '$lib/preview/zoom/ZoomMenu.svelte';
	import ImageEditTools from '../edit/ImageEditTools.svelte';
	import ImageSizeInputs from '../edit/ImageSizeInputs.svelte';
	import type { ImageEditSession } from '../edit/imageEditSession.svelte';
	import type { ImageViewport } from './imageViewport.svelte';

	type Props = {
		view: ImageViewport;
		size: string;
		editable: boolean;
		/** set while Edit is on */
		session: ImageEditSession | null;
		onedit: () => void;
		onrestore: () => void;
	};
	const props: Props = $props();

	const editTip = $derived(props.editable ? 'Edit image' : 'Editing works on PNG, JPEG and WebP images.');
</script>

{#snippet size()}
	{#if props.session}
		<ImageSizeInputs session={props.session} />
	{:else}
		<span class="text-muted px-1 text-xs tabular-nums">{props.size}</span>
	{/if}
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

{#snippet tools()}
	{#if props.session}
		<ImageEditTools session={props.session} />
	{/if}
{/snippet}

{#snippet finish()}
	{#if props.session?.cropping}
		<button class="wide" onclick={() => props.session?.cancelCrop()}>Cancel</button>
		<button class="wide" onclick={() => props.session?.finishCrop()}>Done</button>
	{:else if props.session?.originalAt != null}
		<button class="wide" onclick={props.onrestore} use:tip={'Put back the image as it was before its first edit in Texpile'}
			>Restore original</button
		>
	{/if}
{/snippet}

{#snippet edit()}
	<button aria-pressed={props.session !== null} disabled={!props.editable} onclick={props.onedit} aria-label="Edit image" use:tip={editTip}>
		<SquarePen size={16} />
	</button>
{/snippet}

<PreviewToolbar
	inEditor
	dividers={false}
	groups={[
		{ id: 'size', foldsFirst: true, render: size },
		{ id: 'zoom', render: zoom },
		...(props.session ? [{ id: 'tools', render: tools }] : []),
		{ id: 'finish', pinned: true, alignEnd: true, render: finish },
		{ id: 'edit', pinned: true, render: edit }
	]}
/>
