<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { History, Maximize, SquarePen, ZoomIn, ZoomOut } from '@lucide/svelte';
	import { tip, unavailableTip } from '$lib/components/tooltip.svelte';
	import PreviewToolbar, { type PreviewToolbarPlace } from '$lib/preview/PreviewToolbar.svelte';
	import ZoomMenu from '$lib/preview/zoom/ZoomMenu.svelte';
	import ImageEditTools from '../edit/ImageEditTools.svelte';
	import ImageSizeInputs from '../edit/ImageSizeInputs.svelte';
	import type { ImageEditSession } from '../edit/imageEditSession.svelte';
	import type { ImageViewport } from './imageViewport.svelte';
	import ImageUsesMenu from '../uses/ImageUsesMenu.svelte';
	import type { ImageUse } from '../uses/imageUses';

	type Props = {
		view: ImageViewport;
		size: string;
		unavailable: string | null;
		editTip: string;
		session: ImageEditSession | null;
		onedit: () => void;
		onrestore: () => void;
		uses: ImageUse[];
		root: string;
	};
	const props: Props = $props();
</script>

{#snippet size()}
	{#if props.session}
		<ImageSizeInputs session={props.session} />
	{:else}
		<span class="text-muted px-1 text-xs tabular-nums">{props.size}</span>
	{/if}
{/snippet}

{#snippet usedIn()}
	<ImageUsesMenu uses={props.uses} root={props.root} />
{/snippet}

{#snippet zoom()}
	<button onclick={() => props.view.zoomOut()} aria-label={m.draft_toolbar_zoom_out()} use:tip={m.draft_toolbar_zoom_out()}
		><ZoomOut size={16} /></button
	>
	<ZoomMenu
		scale={props.view.scale}
		fits={[{ label: 'Fit', icon: Maximize, run: () => props.view.fit() }]}
		presets={[25, 50, 100, 200, 400]}
		onscale={(scale) => props.view.zoomTo(scale)}
	/>
	<button onclick={() => props.view.zoomIn()} aria-label={m.draft_toolbar_zoom_in()} use:tip={m.draft_toolbar_zoom_in()}
		><ZoomIn size={16} /></button
	>
{/snippet}

{#snippet tools()}
	{#if props.session}
		<ImageEditTools session={props.session} />
	{/if}
{/snippet}

{#snippet finish()}
	<button class="wide" onclick={() => props.session?.cancelCrop()}>{m.image_crop_cancel()}</button>
	<button class="wide" onclick={() => props.session?.finishCrop()}>{m.image_crop_done()}</button>
{/snippet}

<!-- on the bar it pushed the size fields off -->
{#snippet restore(place: PreviewToolbarPlace)}
	<button class:menu-item={place === 'menu'} onclick={props.onrestore} use:tip={m.image_restore_original_tip()}>
		<History size={16} />
		{#if place === 'menu'}<span class="cap-center">{m.image_restore_original()}</span>{/if}
	</button>
{/snippet}

{#snippet edit()}
	{#if props.unavailable}
		<button class="opacity-50" aria-disabled="true" aria-label={m.image_edit()} use:unavailableTip={props.unavailable}>
			<SquarePen size={16} />
		</button>
	{:else}
		<button aria-pressed={props.session !== null} onclick={props.onedit} aria-label={m.image_edit()} use:tip={props.editTip}>
			<SquarePen size={16} />
		</button>
	{/if}
{/snippet}

<PreviewToolbar
	inEditor
	groups={[
		{ id: 'size', foldsFirst: true, render: size },
		{ id: 'zoom', render: zoom },
		{ id: 'uses', render: usedIn },
		...(props.session ? [{ id: 'tools', render: tools }] : []),
		...(props.session?.cropping ? [{ id: 'finish', pinned: true, alignEnd: true, render: finish }] : []),
		{ id: 'edit', pinned: true, alignEnd: !props.session?.cropping, render: edit },
		...(props.session?.originalAt != null && !props.session.cropping ? [{ id: 'restore', inMenu: true, render: restore }] : [])
	]}
/>
