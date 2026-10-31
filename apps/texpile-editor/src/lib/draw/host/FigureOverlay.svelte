<script lang="ts">
	// a figure tab over its file's pane
	import FigureTab from './FigureTab.svelte';

	type Props = { path: string; picture: number };
	const props: Props = $props();
</script>

<div class="bg-surface-50-950 absolute inset-0 z-30 flex">
	{#key `${props.path}\0${props.picture}`}
		<FigureTab path={props.path} picture={props.picture} />
	{/key}
</div>
