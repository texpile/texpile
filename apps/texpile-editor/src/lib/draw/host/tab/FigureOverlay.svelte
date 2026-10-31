<script lang="ts">
	// a figure tab over its file's pane, or a .tikz file shown in Visual
	import FigureTab from './FigureTab.svelte';
	import TikzFileFigure from '../tikzFile/TikzFileFigure.svelte';
	import { isTikzFile } from '../tikzFile/tikzFile';

	type Props = { path: string; figure: string | null; viewMode: string };
	const props: Props = $props();

	const tikzFile = $derived(props.figure === null && props.viewMode === 'visual' && isTikzFile(props.path));
</script>

{#if props.figure !== null || tikzFile}
	<div class="bg-surface-50-950 absolute inset-0 z-30 flex">
		{#if props.figure !== null}
			{#key `${props.path}\0${props.figure}`}
				<FigureTab path={props.path} figure={props.figure} />
			{/key}
		{:else}
			{#key props.path}
				<TikzFileFigure path={props.path} />
			{/key}
		{/if}
	</div>
{/if}
