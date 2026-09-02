<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import {
		ZoomIn,
		ZoomOut,
		MoveHorizontal,
		RotateCcw,
		RotateCw,
		Search,
		ChevronLeft,
		ChevronRight,
		Save,
		Presentation,
		MoreHorizontal
	} from '@lucide/svelte';
	import { getPdfViewerContext } from './pdf-viewer/context';
	import { searchIntent } from './pdf-viewer/searchIntent';

	const { state: viewerState, actions } = getPdfViewerContext();
	import { CollapsingToolbar } from './collapsingToolbar.svelte';

	let searchInput = $state('');

	// Collapse into a trailing "..." rather than scrolling controls out of reach. Only the optional
	// ones move: rotate and presentation and save. Page number, zoom and search always stay on
	// the bar. Deliberately a copy of the app's ToolbarOverflow rather than an import - this package
	// is a dependency OF that app, so the dependency cannot point the other way.
	// collapse order, first goes first. Only the search box and Fit Width are missing from this
	// list: those two stay on the bar at every width. Fit/overflow lives in collapsingToolbar.
	const bar = new CollapsingToolbar(['extras', 'rotate', 'zoom', 'page'] as const);

	function handlePageChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const pageNum = parseInt(input.value, 10);
		if (pageNum >= 1 && pageNum <= viewerState.totalPages) {
			actions.goToPage(pageNum);
		}
	}

	async function handleSearch() {
		if (!searchInput.trim()) {
			actions.clearSearch();
			return;
		}
		await actions.search(searchInput);
	}

	function handleSearchKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		// searchQuery is the query the current matches came from; once the box says something else,
		// Enter has to start a new search rather than step through the old results
		switch (searchIntent(searchInput, viewerState.searchQuery, viewerState.searchTotal, e.shiftKey)) {
			case 'previous':
				actions.searchPrevious();
				break;
			case 'next':
				actions.searchNext();
				break;
			default:
				handleSearch();
		}
	}
</script>

<div class="pdf-toolbar" bind:this={bar.row}>
	{#snippet pdfPage()}
		<div class="pdf-toolbar-group">
			<input
				type="number"
				value={viewerState.currentPage}
				min="1"
				max={viewerState.totalPages}
				onchange={handlePageChange}
				aria-label="Current page"
			/>
			<span class="page-info">/ {viewerState.totalPages}</span>
		</div>
	{/snippet}
	{#if !bar.hidden.has('page')}{@render pdfPage()}{/if}

	{#snippet pdfZoom()}
		<div class="pdf-toolbar-group">
			<button onclick={() => actions.zoomOut()} aria-label="Zoom out" use:tip={'Zoom Out'}>
				<ZoomOut size={16} />
			</button>
			<span class="zoom-level">{Math.round(viewerState.scale * 100)}%</span>
			<button onclick={() => actions.zoomIn()} aria-label="Zoom in" use:tip={'Zoom In'}>
				<ZoomIn size={16} />
			</button>
		</div>
	{/snippet}
	{#if !bar.hidden.has('zoom')}{@render pdfZoom()}{/if}

	<!-- pinned: Fit Width is the one zoom control worth keeping at any width -->
	<div class="pdf-toolbar-group">
		<button onclick={() => actions.fitWidth()} aria-label="Fit width" use:tip={'Fit Width'}>
			<MoveHorizontal size={16} />
		</button>
	</div>

	{#snippet pdfRotate()}
		<div class="pdf-toolbar-group">
			<button onclick={() => actions.rotateCounterClockwise()} aria-label="Rotate counter-clockwise" use:tip={'Rotate Left'}>
				<RotateCcw size={16} />
			</button>
			<button onclick={() => actions.rotateClockwise()} aria-label="Rotate clockwise" use:tip={'Rotate Right'}>
				<RotateCw size={16} />
			</button>
		</div>
	{/snippet}

	{#if !bar.hidden.has('rotate')}{@render pdfRotate()}{/if}

	<div class="pdf-toolbar-group">
		<input
			type="text"
			class="search-input"
			placeholder="Search..."
			bind:value={searchInput}
			onkeydown={handleSearchKeydown}
			aria-label="Search in document"
		/>
		<button onclick={handleSearch} disabled={viewerState.isSearching} aria-label="Search" use:tip={'Search'}>
			<Search size={16} />
		</button>
		{#if viewerState.searchTotal > 0}
			<button onclick={() => actions.searchPrevious()} aria-label="Previous match" use:tip={'Previous'}>
				<ChevronLeft size={16} />
			</button>
			<button onclick={() => actions.searchNext()} aria-label="Next match" use:tip={'Next'}>
				<ChevronRight size={16} />
			</button>
			<span class="match-info">{viewerState.searchCurrent}/{viewerState.searchTotal}</span>
		{/if}
	</div>

	{#snippet pdfExtras()}
		<div class="pdf-toolbar-group">
			<button onclick={() => actions.enterPresentationMode()} aria-label="Presentation Mode" use:tip={'Presentation Mode'}>
				<Presentation size={16} />
			</button>
			{#if viewerState.canSavePdf}
				<!-- "Save", not "Download": the PDF is already on this machine (or in memory for a
					 guest), so this writes a copy wherever the user picks. -->
				<button onclick={() => actions.savePdf()} aria-label="Save PDF" use:tip={'Save PDF'}>
					<Save size={16} />
				</button>
			{/if}
		</div>
	{/snippet}

	{#if !bar.hidden.has('extras')}{@render pdfExtras()}{/if}

	{#if bar.anyCollapsed}
		<div class="pdf-toolbar-group pdf-overflow">
			<button
				bind:this={bar.menuButton}
				onclick={bar.toggleMenu}
				aria-label="More actions"
				use:tip={'More actions'}
				aria-expanded={bar.menuOpen}
			>
				<MoreHorizontal size={16} />
			</button>
			{#if bar.menuOpen}
				<div bind:this={bar.menuEl} class="pdf-overflow-menu" style="top: {bar.menuPos.top}px; right: {bar.menuPos.right}px" role="group">
					{#if bar.hidden.has('page')}{@render pdfPage()}{/if}
					{#if bar.hidden.has('zoom')}{@render pdfZoom()}{/if}
					{#if bar.hidden.has('rotate')}{@render pdfRotate()}{/if}
					{#if bar.hidden.has('extras')}{@render pdfExtras()}{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* all colors go through --pdf-toolbar-* custom properties (light defaults) so a host app
	   can theme the toolbar */
	.pdf-toolbar {
		display: flex;
		/* safe center: stays centered when it fits, but aligns to the start (no groups clipped
		   past the left edge) once it is tight */
		justify-content: safe center;
		align-items: center;
		/* matches the editor (ProseMirror/CodeMirror) and draft toolbars: a 40px bar, border included */
		min-height: 40px;
		box-sizing: border-box;
		gap: 0.5rem;
		padding: 0 0.5rem;
		background-color: var(--pdf-toolbar-bg, #ffffff);
		color: var(--pdf-toolbar-fg, #333);
		flex-shrink: 0;
		/* never wraps to a second row (it shifted the whole viewer down and read as a layout
		   glitch) and never scrolls either: a bar that does not fit collapses into the "..." */
		flex-wrap: nowrap;
		overflow: hidden;
		border-bottom: 1px solid var(--pdf-toolbar-border, #e0e0e0);
		/* No drop shadow. It is 40px like every other bar in the app, but the shadow spread its band
		   ~3px further, so it never read level with whatever the editor column had beside it - the
		   diff header most visibly. A leftover from pdf.js's light-theme chrome; no other bar here
		   has one, and the border already separates it from the page. */
	}

	.pdf-overflow {
		position: relative;
		margin-left: auto;
	}
	/* fixed, not absolute: the bar is an overflow-x container and clips a menu hanging below it,
	   so the button appeared to do nothing at all. coordinates come from the button's rect. */
	.pdf-overflow-menu {
		position: fixed;
		z-index: 50;
		max-width: min(22rem, calc(100vw - 1rem));
		flex-wrap: wrap;
		row-gap: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem;
		border-radius: 6px;
		border: 1px solid var(--pdf-toolbar-border, #e0e0e0);
		background-color: var(--pdf-toolbar-bg, #ffffff);
		box-shadow: 0 6px 18px rgb(0 0 0 / 0.18);
	}

	.pdf-toolbar-group {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.pdf-toolbar button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: 1px solid var(--pdf-toolbar-btn-border, #e0e0e0);
		background-color: var(--pdf-toolbar-btn-bg, #fafafa);
		color: var(--pdf-toolbar-btn-fg, #555);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.pdf-toolbar button:hover:not(:disabled) {
		background-color: var(--pdf-toolbar-btn-hover-bg, #f0f0f0);
		border-color: var(--pdf-toolbar-btn-hover-border, #d0d0d0);
		color: var(--pdf-toolbar-fg, #333);
	}

	.pdf-toolbar button:active:not(:disabled) {
		background-color: var(--pdf-toolbar-btn-active-bg, #e8e8e8);
	}

	.pdf-toolbar button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.pdf-toolbar input[type='text'],
	.pdf-toolbar input[type='number'] {
		height: 28px;
		padding: 0 0.5rem;
		border: 1px solid var(--pdf-toolbar-input-border, #e0e0e0);
		border-radius: 6px;
		background-color: var(--pdf-toolbar-input-bg, #fff);
		color: var(--pdf-toolbar-fg, #333);
		font-size: 0.8rem;
		outline: none;
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}

	.pdf-toolbar input[type='text']:focus,
	.pdf-toolbar input[type='number']:focus {
		border-color: var(--pdf-toolbar-accent, #0066cc);
		box-shadow: 0 0 0 2px var(--pdf-toolbar-accent-ring, rgba(0, 102, 204, 0.15));
	}

	.pdf-toolbar input[type='number'] {
		width: 34px;
		font-size: 0.75rem;
		text-align: center;
		appearance: textfield;
		-moz-appearance: textfield;
	}

	.pdf-toolbar input[type='number']::-webkit-outer-spin-button,
	.pdf-toolbar input[type='number']::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.pdf-toolbar .search-input {
		width: 160px;
	}

	.pdf-toolbar .zoom-level {
		min-width: 48px;
		text-align: center;
		font-size: 0.8rem;
		color: var(--pdf-toolbar-muted, #666);
		font-weight: 500;
	}

	.pdf-toolbar .page-info {
		font-size: 0.8rem;
		color: var(--pdf-toolbar-muted, #888);
		margin-left: 0.25rem;
	}

	.pdf-toolbar .match-info {
		font-size: 0.75rem;
		color: var(--pdf-toolbar-muted, #888);
		min-width: 60px;
		margin-left: 0.25rem;
	}
</style>
