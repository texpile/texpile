<script lang="ts">
	import { inChildWindows } from '$lib/childWindows/childWindowRegistry.svelte';
	import { slide } from 'svelte/transition';
	import { onMount, onDestroy, untrack } from 'svelte';
	import { displaySearchBarStore as display, editorViewStore } from '$lib/stores/editorStore';
	import { visualFind } from '$lib/editor/visual/find/visualFind.svelte';
	import FindBar from '$lib/editor/find/FindBar.svelte';
	import { NO_FIND_OPTIONS, toggledFindOption, type FindOptions } from '$lib/editor/find/findOptions';

	let query = $state('');
	let replaceText = $state('');
	let options = $state<FindOptions>(NO_FIND_OPTIONS);
	let bar = $state<ReturnType<typeof FindBar>>();

	function commit(): void {
		visualFind.setQuery({ search: query, replace: replaceText, ...options });
	}

	function closeBar(): void {
		display.current = false;
	}

	function handleKeydown(e: KeyboardEvent): void {
		// ignore Ctrl/Cmd+Shift+F, that's Find in Files (handled elsewhere)
		if (e.key.toLowerCase() === 'f' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
			e.preventDefault();
			display.current = !display.current;
			setTimeout(() => bar?.focusQuery(), 0);
		}
		if (e.key === 'Escape' && display.current) closeBar();
	}

	// the bar opens and closes from the menu and the keyboard alike
	$effect(() => {
		if (!display.current) return void visualFind.close();
		untrack(commit);
		setTimeout(() => bar?.focusQuery(), 0);
	});
	// another editor taking over is searched afresh
	$effect(() => {
		if (editorViewStore.current && untrack(() => display.current)) untrack(commit);
	});

	onMount(() => window.addEventListener('keydown', handleKeydown));
	onDestroy(() => {
		window.removeEventListener('keydown', handleKeydown);
		visualFind.close();
	});
	// the editor may be in a window of its own
	inChildWindows('keydown', handleKeydown);
</script>

{#if display.current}
	<!-- anchored to the editor pane's top-right (the WorkspaceView wrapper is relative), matching the source editor's search panel -->
	<div
		transition:slide={{ duration: 180 }}
		class="absolute top-(--find-top,calc(var(--spacing)*3)) right-(--find-right) z-20 max-w-[calc(100%-var(--find-right)-var(--spacing)*3)]"
	>
		<FindBar
			bind:this={bar}
			{query}
			{replaceText}
			{options}
			current={visualFind.current + 1}
			total={visualFind.matches.length}
			unreplaceable={visualFind.unreplaceable}
			onQueryChange={(v) => {
				query = v;
				commit();
			}}
			onReplaceTextChange={(v) => {
				replaceText = v;
				commit();
			}}
			onToggleOption={(key) => {
				options = toggledFindOption(options, key);
				commit();
			}}
			onPrev={() => visualFind.step(-1)}
			onNext={() => visualFind.step(1)}
			onReplaceOne={() => visualFind.replaceOne()}
			onReplaceAll={() => visualFind.replaceAll()}
			onClose={closeBar}
		/>
	</div>
{/if}
