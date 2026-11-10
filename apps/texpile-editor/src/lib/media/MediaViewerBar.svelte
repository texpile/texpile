<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { FolderOpen, Maximize, Repeat, ZoomIn, ZoomOut } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import PreviewToolbar, { type PreviewToolbarPlace } from '$lib/preview/PreviewToolbar.svelte';
	import ZoomMenu from '$lib/preview/zoom/ZoomMenu.svelte';
	import type { ImageViewport } from '$lib/images/viewer/imageViewport.svelte';
	import { revealItem } from '$lib/workspace/fileSystem';

	/** `view` is the video's; audio has nothing to zoom */
	type Props = { path: string; facts: string; view?: ImageViewport; loop: boolean; onloop: () => void };
	const props: Props = $props();
</script>

{#snippet facts()}
	<span class="text-muted px-1 text-xs tabular-nums">{props.facts}</span>
{/snippet}

{#snippet zoom()}
	{#if props.view}
		{@const view = props.view}
		<button onclick={() => view.zoomOut()} aria-label={m.draft_toolbar_zoom_out()} use:tip={m.draft_toolbar_zoom_out()}
			><ZoomOut size={16} /></button
		>
		<ZoomMenu
			scale={view.scale}
			fits={[{ label: 'Fit', icon: Maximize, run: () => view.fit() }]}
			presets={[25, 50, 100, 200, 400]}
			onscale={(scale) => view.zoomTo(scale)}
		/>
		<button onclick={() => view.zoomIn()} aria-label={m.draft_toolbar_zoom_in()} use:tip={m.draft_toolbar_zoom_in()}
			><ZoomIn size={16} /></button
		>
	{/if}
{/snippet}

{#snippet actions(place: PreviewToolbarPlace)}
	<button
		class:menu-item={place === 'menu'}
		aria-pressed={props.loop}
		onclick={props.onloop}
		aria-label={m.wsview_media_loop()}
		use:tip={m.wsview_media_loop()}
	>
		<Repeat size={16} />
		{#if place === 'menu'}<span class="cap-center">{m.wsview_media_loop()}</span>{/if}
	</button>
	<button
		class:menu-item={place === 'menu'}
		onclick={() => void revealItem(props.path)}
		aria-label={m.filetree_menu_reveal()}
		use:tip={m.filetree_menu_reveal()}
	>
		<FolderOpen size={16} />
		{#if place === 'menu'}<span class="cap-center">{m.filetree_menu_reveal()}</span>{/if}
	</button>
{/snippet}

<PreviewToolbar
	inEditor
	groups={[
		{ id: 'facts', foldsFirst: true, render: facts },
		...(props.view ? [{ id: 'zoom', render: zoom }] : []),
		{ id: 'actions', pinned: true, alignEnd: true, render: actions }
	]}
/>
