<script lang="ts">
	// a figure tab whose picture is gone from the file, or no longer a whole picture
	import { ImageOff, SquareDashed } from '@lucide/svelte';
	import { CLOSE_FIGURE } from '$lib/languages/latex/visual/extensions/tikzPicture/openFigure';
	import { cachedDrawing, pictureKey } from './drawingCache';

	type Props = { state: 'deleted' | 'incomplete'; figure: string; drawn: string };
	const props: Props = $props();

	const svg = $derived(props.drawn ? cachedDrawing(pictureKey(props.drawn)) : null);

	function close(): void {
		window.dispatchEvent(new CustomEvent(CLOSE_FIGURE, { detail: { figure: props.figure } }));
	}
</script>

<div class="text-muted mx-auto mt-12 flex max-w-md flex-col items-center gap-3 text-center">
	{#if props.state === 'deleted'}
		<ImageOff class="size-8" />
		<p class="text-sm">This figure was deleted.</p>
		<button type="button" class="btn btn-sm preset-tonal" onclick={close}>Close</button>
	{:else}
		{#if svg}
			<img class="max-h-48 max-w-full opacity-40" alt="" src="data:image/svg+xml;charset=utf-8,{encodeURIComponent(svg)}" />
		{:else}
			<SquareDashed class="size-8" />
		{/if}
		<p class="text-sm">The figure needs a complete <code>\begin</code> and <code>\end</code>.</p>
	{/if}
</div>
