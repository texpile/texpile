<script lang="ts" module>
	export { default as Toolbar } from './PdfToolbar.svelte';
	export { default as Renderer } from './PdfRenderer.svelte';
</script>

<script lang="ts">
	import { openPdfContextMenu } from './pdfContextMenu';
	import { untrack } from 'svelte';
	import type { Snippet } from 'svelte';
	import {
		setPdfViewerContext,
		PresentationModeState,
		type PdfViewerState,
		type PdfViewerActions,
		type PdfSource
	} from './pdf-viewer/context';

	type Props = {
		/** PDF source - URL string, ArrayBuffer, Uint8Array, or Blob */
		src: PdfSource;
		/** logical-document id: unchanged across a src change keeps scroll (recompile), changed resets it */
		documentKey?: string | number;
		/** Initial scale (default: 1.0) */
		scale?: number;
		/** Default filename offered when saving (default: extracted from URL or 'document.pdf') */
		downloadFilename?: string;
		/**
		 * Where the PDF goes when the user saves it. Injected rather than called directly: this
		 * package is a dependency OF the app, so it must not reach back into the app's native
		 * bridge. Omit it and the toolbar hides its save button rather than offering a dead one.
		 */
		onSavePdf?: (bytes: Uint8Array, defaultName: string) => unknown;
		/** Callback when PDF fails to load */
		onerror?: (error: string) => void;
		class?: string;
		/** Children (toolbar and renderer) */
		children?: Snippet;
	};

	let {
		src,
		documentKey,
		scale: initialScale = 1.0,
		downloadFilename,
		onSavePdf,
		onerror,
		class: className = '',
		children
	}: Props = $props();

	// download needs its own copy of binary source data (PDF.js detaches ArrayBuffers);
	// set by PdfRenderer before it hands the data to PDF.js
	let srcDataForDownload = $state<ArrayBuffer | null>(null);

	let viewerState = $state<PdfViewerState>({
		loading: true,
		error: null,
		totalPages: 0,
		currentPage: 1,
		scale: untrack(() => initialScale),
		rotation: 0,
		searchQuery: '',
		searchCurrent: 0,
		searchTotal: 0,
		isSearching: false,
		presentationMode: PresentationModeState.NORMAL,
		canSavePdf: untrack(() => !!onSavePdf)
	});

	let rendererActions: PdfViewerActions | null = null;

	/**
	 * Hand the PDF to whoever is hosting this viewer. This is a desktop app: the document is
	 * already a file (or, for a guest, bytes we hold), so it gets SAVED somewhere the user picks,
	 * not "downloaded". Bytes rather than a path because a guest has no local copy to point at.
	 */
	async function savePdf(filenameOverride?: string) {
		if (!onSavePdf) return;

		const defaultName =
			filenameOverride || downloadFilename || (typeof src === 'string' ? src.split('/').pop() : 'document.pdf') || 'document.pdf';

		let bytes: Uint8Array | null = null;

		if (typeof src === 'string') {
			try {
				bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
			} catch (err) {
				console.error('Cannot save PDF: source could not be read', err);
				return;
			}
		} else if (src instanceof Blob) {
			bytes = new Uint8Array(await src.arrayBuffer());
		} else if (srcDataForDownload) {
			// the pre-copied data; the original buffer gets detached by PDF.js
			bytes = new Uint8Array(srcDataForDownload);
		}

		if (!bytes?.byteLength) {
			console.error('Cannot save PDF: no valid source data available');
			return;
		}
		await onSavePdf(bytes, defaultName);
	}

	const actions: PdfViewerActions = {
		zoomIn: () => rendererActions?.zoomIn(),
		zoomOut: () => rendererActions?.zoomOut(),
		fitWidth: () => rendererActions?.fitWidth(),
		setScale: (scale: number) => rendererActions?.setScale(scale),
		rotateClockwise: () => rendererActions?.rotateClockwise(),
		rotateCounterClockwise: () => rendererActions?.rotateCounterClockwise(),
		goToPage: (page: number) => rendererActions?.goToPage(page),
		scrollToPosition: (page, x, y, w, h) => rendererActions?.scrollToPosition?.(page, x, y, w, h),
		search: async (query: string) => {
			if (rendererActions) {
				await rendererActions.search(query);
			}
		},
		searchNext: () => rendererActions?.searchNext(),
		searchPrevious: () => rendererActions?.searchPrevious(),
		clearSearch: () => rendererActions?.clearSearch(),
		savePdf,
		enterPresentationMode: async () => {
			if (rendererActions) {
				return rendererActions.enterPresentationMode();
			}
			return false;
		},
		exitPresentationMode: async () => {
			if (rendererActions) {
				await rendererActions.exitPresentationMode();
			}
		}
	};

	setPdfViewerContext({
		state: viewerState,
		actions,
		get src() {
			return src;
		},
		get documentKey() {
			return documentKey;
		},
		_registerRenderer: (renderer: PdfViewerActions) => {
			rendererActions = renderer;
		},
		_onerror: untrack(() => onerror),
		_setSrcDataForDownload: (bytes: ArrayBuffer | null) => {
			srcDataForDownload = bytes;
		}
	});
</script>

<div class="pdf-viewer-container {className}" oncontextmenu={openPdfContextMenu} role="presentation">
	<!-- loading is only ever true before the first document lands; reloads swap in place -->
	{#if viewerState.loading}
		<div class="pdf-loading">Loading PDF...</div>
	{:else if viewerState.error}
		<div class="pdf-error">Error: {viewerState.error}</div>
	{/if}

	{#if children}
		{@render children()}
	{:else}
		{#await import('./PdfToolbar.svelte') then { default: Toolbar }}
			<Toolbar />
		{/await}
		{#await import('./PdfRenderer.svelte') then { default: Renderer }}
			<Renderer {src} />
		{/await}
	{/if}
</div>

<style>
	.pdf-viewer-container {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		background-color: var(--pdf-viewer-bg);
		overflow: hidden;
		/* contain the absolutely-positioned .pdf-loading / .pdf-error so they center inside this
		   pane, not the viewport (otherwise they render over the editor) */
		position: relative;
	}

	.pdf-loading,
	.pdf-error {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: var(--pdf-toolbar-muted, #666);
		font-size: 1rem;
		z-index: 10;
	}

	.pdf-error {
		color: #dc3545;
	}
</style>
