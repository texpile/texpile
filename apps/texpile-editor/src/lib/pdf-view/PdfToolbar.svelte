<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { ZoomIn, ZoomOut, RotateCw, Search, ChevronUp, ChevronDown, Save, Presentation } from '@lucide/svelte';
	import { getPdfViewerContext } from './pdf-viewer/context';
	import PdfZoomMenu from './PdfZoomMenu.svelte';
	import PreviewToolbar, { type PreviewToolbarPlace } from '$lib/preview/PreviewToolbar.svelte';
	import ColorVisionMenu from '$lib/preview/colorVision/ColorVisionMenu.svelte';

	import type { Snippet } from 'svelte';

	// the row itself (zones, dividers, the "...") is PreviewToolbar's; this file is the PDF's groups.
	// `inPopout`: the fullscreen presentation mounts on the opener's body, so from the popped-out
	// window it takes over the wrong window with nothing on it. Off there rather than hidden, so the
	// bar keeps its shape.
	let {
		leading,
		trailing,
		asTabStrip = false,
		dividers = true,
		inEditor = false,
		inPopout = false,
		findOpen = false,
		onToggleFind
	}: {
		leading?: Snippet;
		trailing?: Snippet;
		asTabStrip?: boolean;
		dividers?: boolean;
		inEditor?: boolean;
		inPopout?: boolean;
		/** the find bar (PdfSearchBar) is the viewer's; the bar only carries its switch */
		findOpen?: boolean;
		onToggleFind?: () => void;
	} = $props();

	const { state: viewerState, actions } = getPdfViewerContext();

	function handlePageChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const pageNum = parseInt(input.value, 10);
		if (pageNum >= 1 && pageNum <= viewerState.totalPages) {
			actions.goToPage(pageNum);
		}
	}
</script>

{#snippet page()}
	<input
		type="number"
		class="page-input"
		value={viewerState.currentPage}
		min="1"
		max={viewerState.totalPages}
		onchange={handlePageChange}
		aria-label="Current page"
		style:--digits={String(viewerState.totalPages).length}
	/>
	<span class="page-info">/ {viewerState.totalPages}</span>
	<button
		onclick={() => actions.goToPage(viewerState.currentPage - 1)}
		disabled={viewerState.currentPage <= 1}
		aria-label="Previous page"
		use:tip={'Previous page'}
	>
		<ChevronUp size={16} />
	</button>
	<button
		onclick={() => actions.goToPage(viewerState.currentPage + 1)}
		disabled={viewerState.currentPage >= viewerState.totalPages}
		aria-label="Next page"
		use:tip={'Next page'}
	>
		<ChevronDown size={16} />
	</button>
{/snippet}

{#snippet zoom()}
	<button onclick={() => actions.zoomOut()} aria-label="Zoom out" use:tip={'Zoom out'}>
		<ZoomOut size={16} />
	</button>
	<PdfZoomMenu />
	<button onclick={() => actions.zoomIn()} aria-label="Zoom in" use:tip={'Zoom in'}>
		<ZoomIn size={16} />
	</button>
{/snippet}

{#snippet vision(place: PreviewToolbarPlace)}
	<ColorVisionMenu {place} />
{/snippet}

<!-- pinned: one switch for the find bar, on the bar at every width -->
{#snippet search()}
	<button aria-pressed={findOpen} onclick={() => onToggleFind?.()} aria-label="Find" use:tip={'Find'}>
		<Search size={16} />
	</button>
{/snippet}

<!-- the three below live in the "..." at every width, where they draw as named rows -->
{#snippet rotate(place: PreviewToolbarPlace)}
	<button
		class:menu-item={place === 'menu'}
		onclick={() => actions.rotateClockwise()}
		aria-label="Rotate clockwise"
		use:tip={'Rotate clockwise'}
	>
		<RotateCw size={16} />
		{#if place === 'menu'}Rotate{/if}
	</button>
{/snippet}

{#snippet present(place: PreviewToolbarPlace)}
	<button
		class:menu-item={place === 'menu'}
		onclick={() => actions.enterPresentationMode()}
		disabled={inPopout}
		aria-label="Presentation mode"
		use:tip={inPopout ? 'Presentation mode is not available in a separate window' : 'Presentation mode'}
	>
		<Presentation size={16} />
		{#if place === 'menu'}Presentation{/if}
	</button>
{/snippet}

<!-- "Save", not "Download": the PDF is already on this machine (or in memory for a guest), so this
     writes a copy wherever the user picks. -->
{#snippet save(place: PreviewToolbarPlace)}
	<button class:menu-item={place === 'menu'} onclick={() => actions.savePdf()} aria-label="Save PDF" use:tip={'Save PDF'}>
		<Save size={16} />
		{#if place === 'menu'}Save PDF{/if}
	</button>
{/snippet}

<PreviewToolbar
	{leading}
	{trailing}
	{asTabStrip}
	{dividers}
	{inEditor}
	groups={[
		{ id: 'page', render: page },
		{ id: 'zoom', render: zoom },
		{ id: 'vision', render: vision },
		{ id: 'search', pinned: true, alignEnd: true, render: search },
		// rarely reached for, so they sit in the ... at every width and the bar stays short
		{ id: 'rotate', inMenu: true, render: rotate },
		{ id: 'present', inMenu: true, render: present },
		...(viewerState.canSavePdf ? [{ id: 'save', inMenu: true, render: save }] : [])
	]}
/>
