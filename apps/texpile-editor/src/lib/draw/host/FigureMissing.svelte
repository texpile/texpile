<script lang="ts">
	// a figure tab whose picture is gone from the file, or no longer a whole picture
	import { CLOSE_FIGURE } from '$lib/languages/latex/visual/extensions/tikzPicture/openFigure';
	import { cachedDrawing, pictureKey } from './drawingCache';

	type Props = { state: 'deleted' | 'incomplete'; figure: string; drawn: string };
	const props: Props = $props();

	const svg = $derived(props.drawn ? cachedDrawing(pictureKey(props.drawn)) : null);

	function close(): void {
		window.dispatchEvent(new CustomEvent(CLOSE_FIGURE, { detail: { figure: props.figure } }));
	}
</script>

<div class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
	{#if svg && props.state === 'incomplete'}
		<img class="max-h-64 max-w-full opacity-40" alt="" src="data:image/svg+xml;charset=utf-8,{encodeURIComponent(svg)}" />
	{/if}
	{#if props.state === 'deleted'}
		<p class="text-surface-600-400">This figure was deleted.</p>
		<button class="btn preset-tonal" onclick={close}>Close</button>
	{:else}
		<p class="text-surface-600-400">The figure needs a complete <code>\begin</code> and <code>\end</code>.</p>
	{/if}
</div>
