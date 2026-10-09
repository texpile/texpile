<script lang="ts">
	import { inChildWindows } from '$lib/childWindows/childWindowRegistry.svelte';
	import { slide } from 'svelte/transition';
	import { onMount, onDestroy } from 'svelte';
	import { displaySearchBarStore as display, editorViewStore } from '$lib/stores/editorStore';
	import { setSearchState, SearchQuery } from 'prosemirror-search';
	import {
		visibleMatches,
		replaceAllVisible,
		replaceNextVisible,
		stepToMatch,
		VisibleTextQuery
	} from '$lib/editor/visual/searchVisibleText';
	import FindBar from '$lib/editor/find/FindBar.svelte';
	import { NO_FIND_OPTIONS, toggledFindOption, type FindOptions } from '$lib/editor/find/findOptions';

	let query = $state('');
	let replaceText = $state('');
	let options = $state<FindOptions>(NO_FIND_OPTIONS);
	let total = $state(0);
	let current = $state(0);
	let bar = $state<ReturnType<typeof FindBar>>();

	function searchQuery(): SearchQuery {
		return new VisibleTextQuery({ search: query, replace: replaceText, ...options });
	}

	function commit(resetPosition = true): void {
		const view = editorViewStore.current;
		if (!view?.state) return;
		if (resetPosition) current = 0;
		const q = searchQuery();
		// the count has to agree with what stepping and replacing will do, so it skips chips too
		total = visibleMatches(view.state, q).length;
		view.dispatch(setSearchState(view.state.tr, q));
	}

	function step(dir: 1 | -1): void {
		const view = editorViewStore.current;
		if (!view?.state || total === 0) return;
		const sel = stepToMatch(view.state, dir);
		if (!sel) return;
		view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
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
		(all ? replaceAllVisible : replaceNextVisible)(view.state, view.dispatch);
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
	// the editor may be in a window of its own
	inChildWindows('keydown', handleKeydown);
</script>

{#if display.current}
	<!-- anchored to the editor pane's top-right (the WorkspaceView wrapper is relative), matching the source editor's search panel -->
	<div transition:slide={{ duration: 180 }} class="absolute top-(--find-top,calc(var(--spacing)*3)) right-3 z-20 max-w-[calc(100%-1.5rem)]">
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
	}
	:global(.ProseMirror .ProseMirror-active-search-match) {
		background-color: var(--find-match-active-bg) !important;
	}
</style>
