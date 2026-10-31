<script lang="ts">
	// a figure tab whose picture is gone from the file, or no longer a whole picture
	import { m } from '$lib/paraglide/messages';
	import { ImageOff, SquareDashed } from '@lucide/svelte';
	import { CLOSE_FIGURE, SHOW_FIGURE_SOURCE, type FigureDetail, type FigureSourceDetail } from '$lib/draw/host/card/figureEvents';
	import { cachedDrawing, pictureKey } from '../drawingCache';

	type Props = {
		state: 'deleted' | 'incomplete';
		figure: string;
		/** the picture as last drawn */
		drawn: string;
		/** what the picture needs to be whole again, as written */
		needs: string[];
		file: string;
		/** where its \begin is or was */
		line: number;
	};
	const props: Props = $props();

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
		<p class="text-sm">{m.figure_deleted()}</p>
		<button type="button" class="btn btn-sm preset-tonal" onclick={close}>{m.figure_close()}</button>
	{:else}
		{#if svg}
			<img class="max-h-48 max-w-full opacity-40" alt="" src="data:image/svg+xml;charset=utf-8,{encodeURIComponent(svg)}" />
		{:else}
			<SquareDashed class="size-8" />
		{/if}
		<p class="text-sm">
			{m.figure_finish({ needs: props.needs.join(', '), file: props.file })}
		</p>
		<button type="button" class="btn btn-sm preset-tonal" onclick={showSource}>{m.figure_show_source()}</button>
	{/if}
</div>
