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
	<div
		transition:slide={{ duration: 180 }}
		class="pdf-find absolute top-(--find-top,calc(var(--spacing)*3)) right-(--find-right) z-20 max-w-[calc(100%-var(--find-right)-var(--spacing)*3)]"
	>
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
	.pdf-find :global(.find-widget) {
		width: 340px;
	}
</style>
