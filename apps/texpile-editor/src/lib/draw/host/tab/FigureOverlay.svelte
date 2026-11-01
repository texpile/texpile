<script lang="ts">
	import FigureTab from './FigureTab.svelte';
	import TikzFileFigure from '../tikzFile/TikzFileFigure.svelte';
	import { isTikzFile } from '../tikzFile/tikzFile';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { GUEST_ROOT } from '$lib/collab/sessionProvider';

	type Props = { path: string; figure: string | null; viewMode: string };
	const props: Props = $props();

	const tikzFile = $derived(
		props.figure === null && props.viewMode === 'visual' && isTikzFile(props.path) && workspaceRoot.current !== GUEST_ROOT
	);
</script>

{#if props.figure !== null || tikzFile}
	<!-- under the pane dividers, whose grab zones overhang 3px into each pane at z-30 -->
	<div class="figure-overlay bg-surface-50-950 absolute inset-0 z-29 flex">
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

<style>
	/* the transparent window's panes have no fill of their own, so the paper would show through the figure */
	.figure-overlay ~ :global(*) {
		visibility: hidden;
	}
</style>
