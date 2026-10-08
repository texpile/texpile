<script lang="ts">
	// the editor's find bar, dropped over the pages from the toolbar's search switch, driving the
	// viewer's text search as you type; Enter and Shift+Enter step, Escape closes
	import { slide } from 'svelte/transition';
	import FindBar from '$lib/editor/find/FindBar.svelte';
	import { NO_FIND_OPTIONS } from '$lib/editor/find/findOptions';
	import { getPdfViewerContext } from './pdf-viewer/context';

	let { open, onClose }: { open: boolean; onClose: () => void } = $props();

	const ctx = getPdfViewerContext();

	let bar = $state<ReturnType<typeof FindBar>>();
	let query = $state('');

	$effect(() => {
		if (open) setTimeout(() => bar?.focusQuery(), 0);
	});

	function commit(value: string): void {
		query = value;
		if (value.trim()) void ctx.actions.search(value);
		else ctx.actions.clearSearch();
	}

	function close(): void {
		ctx.actions.clearSearch();
		onClose();
	}
</script>

{#if open}
	<div transition:slide={{ duration: 180 }} class="pdf-find absolute top-3 right-3 left-3 z-20 flex justify-end">
		<FindBar
			bind:this={bar}
			{query}
			replaceText=""
			options={NO_FIND_OPTIONS}
			current={ctx.state.searchCurrent}
			total={ctx.state.searchTotal}
			canReplace={false}
			canToggle={false}
			onQueryChange={commit}
			onReplaceTextChange={() => {}}
			onToggleOption={() => {}}
			onPrev={() => ctx.actions.searchPrevious()}
			onNext={() => ctx.actions.searchNext()}
			onReplaceOne={() => {}}
			onReplaceAll={() => {}}
			onClose={close}
		/>
	</div>
{/if}

<style>
	/* the strip spans the pane so the widget can be capped at its width, but only the widget takes clicks */
	.pdf-find {
		pointer-events: none;
	}
	/* the editor's widget is 419px for a replace row and toggles; find alone needs less, and a
	   narrow pane needs less still */
	.pdf-find :global(.find-widget) {
		pointer-events: auto;
		width: min(340px, 100%);
	}
</style>
