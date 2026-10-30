<script lang="ts">
	// the active figure tab over its file's pane
	import { activeFigure } from '$lib/workspace/workspaceStore';
	import FigureTab from './FigureTab.svelte';

	type Props = { path: string };
	const props: Props = $props();
</script>

{#if activeFigure.current !== null}
	<div class="bg-surface-50-950 absolute inset-0 z-30 flex">
		{#key `${props.path}\0${activeFigure.current}`}
			<FigureTab path={props.path} picture={activeFigure.current} />
		{/key}
	</div>
{/if}
