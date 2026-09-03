<script lang="ts">
	import { slide } from 'svelte/transition';
	import { onMount, onDestroy } from 'svelte';
	import { displaySearchBarStore as display, editorViewStore } from '$lib/stores/editorStore';
	import { setSearchState, SearchQuery, findNext, findPrev, replaceNext, replaceAll } from 'prosemirror-search';
	import FindBar from '$lib/editor/find/FindBar.svelte';
	import { NO_FIND_OPTIONS, toggledFindOption, type FindOptions } from '$lib/editor/find/findOptions';

	let query = $state('');
	let replaceText = $state('');
	let options = $state<FindOptions>(NO_FIND_OPTIONS);
	let total = $state(0);
	let current = $state(0);
	let bar = $state<ReturnType<typeof FindBar>>();

	function searchQuery(): SearchQuery {
		return new SearchQuery({ search: query, replace: replaceText, ...options });
	}

	function commit(resetPosition = true): void {
		const view = editorViewStore.current;
		if (!view?.state) return;
		if (resetPosition) current = 0;
		const q = searchQuery();

		let found = 0;
		// a half-typed regex throws out of findNext
		try {
			for (let from = 0, res; (res = q.findNext(view.state, from)); from = res.to) found++;
		} catch {
			found = 0;
		}
		total = found;
		view.dispatch(setSearchState(view.state.tr, q));
	}

	function step(dir: 1 | -1): void {
		const view = editorViewStore.current;
		if (!view?.state || total === 0) return;
		(dir === 1 ? findNext : findPrev)(view.state, view.dispatch);
		current = dir === 1 ? (current % total) + 1 : current - 1 || total;
		scrollToSelection();
	}

	function scrollToSelection(): void {
		const view = editorViewStore.current;
		if (!view?.state) return;
		const { from } = view.state.selection;
		const coords = view.coordsAtPos(from);
		const scrollContainer = view.dom.closest('.overflow-y-auto') as HTMLElement | null;
		if (scrollContainer && coords) {
			const containerRect = scrollContainer.getBoundingClientRect();
			const relativeTop = coords.top - containerRect.top + scrollContainer.scrollTop;
			scrollContainer.scrollTo({ top: relativeTop - containerRect.height / 2, behavior: 'smooth' });
		}
	}

	function runReplace(all: boolean): void {
		const view = editorViewStore.current;
		if (!view?.state) return;
		(all ? replaceAll : replaceNext)(view.state, view.dispatch);
		commit(all); // the document moved under the count, so recount
	}

	function closeBar(): void {
		display.current = false;
		const view = editorViewStore.current;
		if (view?.state) view.dispatch(setSearchState(view.state.tr, new SearchQuery({ search: '' })));
	}

	function handleKeydown(e: KeyboardEvent): void {
		// ignore Ctrl/Cmd+Shift+F, that's Find in Files (handled elsewhere)
		if (e.key.toLowerCase() === 'f' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
			e.preventDefault();
			if (display.current) closeBar();
			else display.current = true;
			setTimeout(() => bar?.focusQuery(), 0);
		}
		if (e.key === 'Escape' && display.current) closeBar();
	}

	// focus the input whenever the bar becomes visible
	$effect(() => {
		if (display.current) setTimeout(() => bar?.focusQuery(), 0);
	});

	onMount(() => window.addEventListener('keydown', handleKeydown));
	onDestroy(() => window.removeEventListener('keydown', handleKeydown));
</script>

{#if display.current}
	<!-- anchored to the editor pane's top-right (the WorkspaceView wrapper is relative), matching the source editor's search panel -->
	<div transition:slide={{ duration: 180 }} class="absolute top-3 right-3 z-20">
		<FindBar
			bind:this={bar}
			{query}
			{replaceText}
			{options}
			{current}
			{total}
			onQueryChange={(v) => {
				query = v;
				commit();
			}}
			onReplaceTextChange={(v) => {
				replaceText = v;
				commit(false);
			}}
			onToggleOption={(key) => {
				options = toggledFindOption(options, key);
				commit();
			}}
			onPrev={() => step(-1)}
			onNext={() => step(1)}
			onReplaceOne={() => runReplace(false)}
			onReplaceAll={() => runReplace(true)}
			onClose={closeBar}
		/>
	</div>
{/if}

<style lang="postcss">
	:global(.ProseMirror .ProseMirror-search-match) {
		background-color: var(--find-match-bg) !important;
		border-bottom: 2px solid var(--find-match-border) !important;
	}
	:global(.ProseMirror .ProseMirror-active-search-match) {
		background-color: var(--find-match-active-bg) !important;
		color: var(--find-match-active-fg) !important;
		border-bottom: 2px solid var(--find-match-active-border) !important;
		font-weight: 500 !important;
	}
	/* light leaves the text colour alone; dark lifts it */
	:global(.dark .ProseMirror .ProseMirror-search-match) {
		color: var(--find-match-dark-fg) !important;
	}
</style>
