<script lang="ts">
	// a figure tab whose picture is gone from the file, or no longer a whole picture
	import { ImageOff, SquareDashed } from '@lucide/svelte';
	import {
		CLOSE_FIGURE,
		SHOW_FIGURE_SOURCE,
		type FigureDetail,
		type FigureSourceDetail
	} from '$lib/languages/latex/visual/extensions/tikzPicture/openFigure';
	import { cachedDrawing, pictureKey } from './drawingCache';

	type Props = {
		state: 'deleted' | 'incomplete';
		figure: string;
		/** the picture as last drawn */
		drawn: string;
		environment: string;
		file: string;
		/** where its \begin is or was */
		line: number;
	};
	const props: Props = $props();

	const begin = $derived(`\\begin{${props.environment}}`);
	const end = $derived(`\\end{${props.environment}}`);
	const svg = $derived(props.drawn ? cachedDrawing(pictureKey(props.drawn)) : null);

	function close(): void {
		const detail: FigureDetail = { figure: props.figure };
		window.dispatchEvent(new CustomEvent(CLOSE_FIGURE, { detail }));
	}
	function showSource(): void {
		const detail: FigureSourceDetail = { figure: props.figure, line: props.line };
		window.dispatchEvent(new CustomEvent(SHOW_FIGURE_SOURCE, { detail }));
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
		<p class="text-sm">
			Finish <span class="font-mono">{begin}</span> and <span class="font-mono">{end}</span> in {props.file} to edit this figure.
		</p>
		<button type="button" class="btn btn-sm preset-tonal" onclick={showSource}>Show in source</button>
	{/if}
</div>
