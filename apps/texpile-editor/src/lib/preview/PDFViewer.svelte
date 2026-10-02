<script lang="ts">
	// controlled: pass src (a texfile:// URL or bytes); uncontrolled: omit src and it follows pdfStore
	import { PdfViewer, PdfToolbar, PdfRenderer, type PdfSource, type PdfViewerActions } from '$lib/pdf-view';
	import PdfActionsBridge from './PdfActionsBridge.svelte';
	import PreviewHeader from './PreviewHeader.svelte';
	import PdfSearchBar from '$lib/pdf-view/PdfSearchBar.svelte';
	import ColorVisionFilter from './colorVision/ColorVisionFilter.svelte';
	import { pdfStore } from '$lib/stores/pdfStore';
	import { pdfFindToggle } from '$lib/stores/editorStore';
	import { PictureInPicture2 } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import { savePdfBytes } from '$lib/workspace/fileSystem';
	import { resolvedMode } from '$lib/theme';
	import { layout, updateLayout } from '$lib/storage/layout';
	import { untrack } from 'svelte';

	type Props = {
		filename?: string;
		src?: string | ArrayBuffer;
		/** SyncTeX inverse search: double-click reports page + position (PDF points) plus the clicked word for anchoring. */
		onPageClick?: (page: number, x: number, y: number, selectText?: string) => void;
		/** what the pane is called while there is no document to show; a PDF on screen needs no caption */
		label?: string;
		/** move the preview into its own window; null in the popped-out body, which needs no button */
		onPopout?: (() => void) | null;
		/** where this viewer sits: the docked preview pane (its bar is the pane's only row and stands
		 *  in for a tab strip), a .pdf opened as a file in the editor column (under the tabs, beside the
		 *  preview divider), or the popped-out window */
		placement?: 'pane' | 'file' | 'window';
	};
	let { filename, src, onPageClick, label, onPopout, placement = 'window' }: Props = $props();
	const asTabStrip = $derived(placement === 'pane');
	const inEditor = $derived(placement === 'file');

	let actions: PdfViewerActions | null = null;
	/** SyncTeX forward search: scroll to and flash a box. (x, y) is the box origin in PDF points, top-left, y down. */
	export function scrollToPosition(page: number, x: number, y: number, width?: number, height?: number): void {
		actions?.scrollToPosition?.(page, x, y, width, height);
	}

	let pdfSource = $state<PdfSource | null>(null);
	let findOpen = $state(false);
	// as a tab, this viewer is what Ctrl+F means; the pane and the window are never the active tab
	$effect(() => {
		if (!inEditor) return;
		pdfFindToggle.current = () => (findOpen = !findOpen);
		return () => (pdfFindToggle.current = null);
	});
	let loading = $state(false);
	let error = $state<string | null>(null);
	let lastUrl = '';
	// logical document id (path without the &t= cache-bust): unchanged across recompiles so the
	// viewer keeps its scroll, changed when a different PDF opens so it resets to the top
	let docKey = $state<string | undefined>(undefined);
	function docKeyOf(url: string) {
		return url.replace(/[?&]t=\d+/, '');
	}
	let fetchGen = 0;

	async function fetchPdf(url: string) {
		// keep the current PDF (and its scroll) on screen while a recompile's bytes fetch; only show
		// the blocking "Loading" state on the very first load, when there's nothing to keep
		const gen = ++fetchGen;
		const firstLoad = pdfSource === null;
		if (firstLoad) loading = true;
		error = null;
		try {
			const res = await fetch(url, { cache: 'no-store' });
			if (!res.ok) throw new Error(`Could not load the PDF (${res.status}).`);
			const buf = await res.arrayBuffer();
			if (gen !== fetchGen) return; // a newer load started while we fetched; don't clobber its result
			if (buf.byteLength === 0) throw new Error('The PDF is empty.');
			docKey = docKeyOf(url);
			pdfSource = buf;
			lastUrl = url;
		} catch (e) {
			// a recompile's PDF can be caught mid-write (truncated/empty for a beat): keep the current
			// PDF up rather than blanking it, which would remount the viewer (loading flash + lost
			// cross-fade). But surface the error on the first load, or on a genuine switch to a
			// DIFFERENT document, instead of silently leaving the old one on screen.
			const switching = firstLoad || docKeyOf(url) !== docKey;
			if (switching && gen === fetchGen) {
				error = e instanceof Error ? e.message : 'Could not load the PDF.';
				pdfSource = null;
				docKey = undefined;
			}
		} finally {
			if (gen === fetchGen) loading = false;
		}
	}

	function apply(input: string | ArrayBuffer | null | undefined) {
		if (input instanceof ArrayBuffer) {
			// guest session: each recompile is a fresh buffer but the same logical file
			docKey = filename ?? 'pdf';
			pdfSource = input;
			loading = false;
			error = null;
		} else if (typeof input === 'string') {
			if (input !== lastUrl) fetchPdf(input);
		} else {
			pdfSource = null;
			loading = false;
			error = null;
			lastUrl = '';
			docKey = undefined;
		}
	}

	$effect(() => {
		if (src !== undefined) apply(src);
	});

	// no src given: follow pdfStore
	$effect(() => {
		if (src !== undefined) return;
		const pdf = pdfStore.current;
		untrack(() => apply(pdf));
	});
</script>

<!-- the bar stands in for a tab strip, so it carries the file name the way the tabs carry theirs; under
     a real tab strip (the editor column) the tab already says it -->
{#snippet leading()}
	<span class="truncate text-sm">{filename}</span>
{/snippet}

<!-- pinned outside the collapsing groups: the one control that is not a viewer setting must not
     disappear into the "..." when the pane narrows -->
{#snippet popout()}
	<button onclick={() => onPopout?.()} use:tip={m.wsview_popout_preview()} aria-label={m.wsview_popout_preview()}>
		<PictureInPicture2 size={16} />
	</button>
{/snippet}

{#if pdfSource && !error}
	{@const dark = resolvedMode.current === 'dark'}
	{@const inverted = dark ? layout.current.pdfDarkPages : layout.current.pdfDarkPagesInLight}
	<div class="flex h-full w-full flex-col">
		<!-- the viewer holds the bytes but not the native bridge, so the save dialog is injected here -->
		<PdfViewer src={pdfSource} documentKey={docKey} downloadFilename={filename} onSavePdf={savePdfBytes}>
			<PdfToolbar
				leading={filename && !inEditor ? leading : undefined}
				trailing={onPopout ? popout : undefined}
				{asTabStrip}
				dividers={!inEditor}
				{inEditor}
				inPopout={placement === 'window'}
				{findOpen}
				onToggleFind={() => (findOpen = !findOpen)}
				{inverted}
				onToggleInvert={() => updateLayout(dark ? { pdfDarkPages: !inverted } : { pdfDarkPagesInLight: !inverted })}
			/>
			<PdfActionsBridge onActions={(a) => (actions = a)} />
			<!-- darkMode inverts the page canvases; the chrome always follows the app theme via `dark`.
			     the scrollbar repeats app.css's, whose rule cannot reach into the shadow DOM -->
			<!-- the find bar drops over the pages, under the toolbar -->
			<div class="relative flex min-h-0 flex-1 flex-col">
				<PdfSearchBar open={findOpen} onClose={() => (findOpen = false)} />
				<ColorVisionFilter class="flex min-h-0 flex-1 flex-col">
					<PdfRenderer
						{onPageClick}
						darkMode={inverted}
						backgroundColor="var(--pdf-page-area-bg)"
						pageShadow={dark ? '0 2px 8px rgba(0, 0, 0, 0.55), 0 1px 3px rgba(0, 0, 0, 0.4)' : undefined}
						scrollbarThumbColor="color-mix(in oklab, var(--color-surface-950-50) 30%, transparent)"
						scrollbarTrackColor="transparent"
						scrollbarThumbHoverColor="color-mix(in oklab, var(--color-surface-950-50) 45%, transparent)"
						scrollbarWidth="10px"
						scrollInsetRight={inEditor ? '3px' : undefined}
					/>
				</ColorVisionFilter>
			</div>
		</PdfViewer>
	</div>
{:else}
	<!-- the bar is the viewer's; until there is a document the pane still needs its label and popout -->
	<div class="flex h-full w-full flex-col">
		{#if label}<PreviewHeader {label} {onPopout} {asTabStrip} />{/if}
		{#if loading && !pdfSource}
			<div class="text-muted flex min-h-0 flex-1 items-center justify-center text-sm">Loading PDF…</div>
		{:else if error}
			<div class="text-error-ink flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm">{error}</div>
		{:else}
			<div class="text-muted flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm">Compile to preview the PDF.</div>
		{/if}
	</div>
{/if}
