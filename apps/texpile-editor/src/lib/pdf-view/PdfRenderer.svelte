<script lang="ts">
	import { BROWSER } from 'esm-env';
	import { onDestroy, onMount } from 'svelte';
	import { getPdfViewerContext, type PdfViewerActions, type PdfSource } from './pdf-viewer/context';
	import { getPdfJs, getPdfDocument } from './pdf-viewer/pdfjs-singleton';
	import { PdfPresentationMode } from './pdf-viewer/PdfPresentationMode';
	import { rendererStyles } from './pdf-viewer/renderer-styles';

	type Props = {
		/** PDF source; falls back to the src from PdfViewer context. */
		src?: PdfSource;
		backgroundColor?: string;
		pageShadow?: string;
		/** Passing any scrollbar-* prop opts into the styled scrollbar; leave them all unset for
		 *  the native one (matches the host page's scrollers). */
		scrollbarTrackColor?: string;
		scrollbarThumbColor?: string;
		scrollbarThumbHoverColor?: string;
		scrollbarWidth?: string;
		/** keeps the scrollbar this far in from the right edge, for a host control that overhangs there */
		scrollInsetRight?: string;
		/** Dark mode: darkens the viewer chrome and renders the pages themselves dark by inverting the
		 *  page canvases (invert + hue-rotate, so colors stay recognizable). Reactive. */
		darkMode?: boolean;
		/** SyncTeX inverse search: fired on double-click with the page + position in PDF points, plus
		 *  the double-clicked word so the editor can anchor the jump on the actual text. */
		onPageClick?: (page: number, x: number, y: number, selectText?: string) => void;
	};

	let {
		src: srcProp,
		backgroundColor = '#e8e8e8',
		pageShadow = '0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08)',
		scrollbarTrackColor,
		scrollbarThumbColor,
		scrollbarThumbHoverColor,
		scrollbarWidth,
		scrollInsetRight,
		darkMode = false,
		onPageClick
	}: Props = $props();

	const context = getPdfViewerContext();
	const { state: viewerState, _registerRenderer, _setSrcDataForDownload } = context;

	let src = $derived(srcProp ?? context.src);

	let hostEl: HTMLDivElement | undefined = $state();
	let shadowRoot: ShadowRoot | null = null;
	let containerEl: HTMLDivElement | null = $state(null);
	let scrollContainerEl: HTMLDivElement | null = null;
	let mounted = $state(false);

	let viewer: import('./pdf-viewer/PDFViewerCore').PDFViewerCore | null = null;
	let findController: import('./pdf-viewer/FindController').FindController | null = null;
	// the document loaded into `viewer`; when the next load carries the same key it's a reload of
	// the same file (a recompile) and we keep the scroll position instead of jumping to the top
	let loadedKey: string | number | undefined;

	const presentationMode = new PdfPresentationMode({
		onStateChange: (newState) => {
			viewerState.presentationMode = newState;
		},
		onPageChange: (pageNumber) => {
			// sync page changes in presentation mode back to the main viewer
			viewer?.scrollToPage(pageNumber);
		}
	});

	// one viewer for the pane's lifetime: each load parses the new document off-screen, then
	// setDocument swaps it into the same container in place, so on a recompile the old pages
	// stay up (scroll intact) until the new ones land. Loads are serialized through a queue;
	// a load scheduled while an older one is still parsing supersedes it.
	let loadGen = 0;
	let loadQueue: Promise<void> = Promise.resolve();

	function queueLoad(source: PdfSource) {
		const gen = ++loadGen;
		loadQueue = loadQueue.then(() => loadPdf(gen, source));
	}

	// static clones of the on-screen pages (canvas bitmaps copied by hand, cloneNode leaves them
	// blank), absolutely positioned over the container: they hold the old pixels while the new
	// document swaps in underneath, then fade out. Not document.startViewTransition: pdf.js
	// schedules canvas work through requestAnimationFrame, which is frozen during a view
	// transition, so its capture always lands before the new pages have pixels.
	function snapshotOverlay(): HTMLDivElement | null {
		if (!containerEl || !scrollContainerEl || !viewer || viewer.pagesCount === 0) return null;
		const contRect = scrollContainerEl.getBoundingClientRect();
		if (contRect.width === 0) return null;
		const overlay = containerEl.ownerDocument.createElement('div');
		overlay.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:5;';
		for (const pageDiv of scrollContainerEl.querySelectorAll<HTMLElement>('.page')) {
			const rect = pageDiv.getBoundingClientRect();
			if (rect.bottom < contRect.top || rect.top > contRect.bottom) continue;
			const clone = pageDiv.cloneNode(true) as HTMLElement;
			clone.style.position = 'absolute';
			clone.style.left = `${rect.left - contRect.left}px`;
			clone.style.top = `${rect.top - contRect.top}px`;
			clone.style.margin = '0';
			const src = pageDiv.querySelectorAll('canvas');
			clone.querySelectorAll('canvas').forEach((c, i) => {
				if (src[i]) c.getContext('2d')?.drawImage(src[i], 0, 0);
			});
			overlay.appendChild(clone);
		}
		if (!overlay.childElementCount) return null;
		containerEl.appendChild(overlay);
		return overlay;
	}

	async function loadPdf(gen: number, source: PdfSource) {
		if (!BROWSER || !scrollContainerEl || gen !== loadGen) return;
		viewerState.error = null;
		if (!viewer) viewerState.loading = true;
		let overlay: HTMLDivElement | null = null;
		// the loading task / parsed document we still OWN: cleared once the live viewer adopts it. On
		// any early exit or error, whatever this points at must be destroyed or it leaks in the worker.
		let toDestroy: { destroy(): Promise<void> } | null = null;

		try {
			// availability check only (null off the browser); the load goes through getPdfDocument
			if (!(await getPdfJs())) return;

			if (!viewer) {
				const { PDFViewerCore } = await import('./pdf-viewer/PDFViewerCore');
				const { FindController } = await import('./pdf-viewer/FindController');
				const { EventBus } = await import('./pdf-viewer/EventBus');

				const eventBus = new EventBus();

				viewer = new PDFViewerCore({
					container: scrollContainerEl,
					eventBus,
					initialScale: viewerState.scale,
					initialRotation: viewerState.rotation,
					onPageClick: (page, x, y, selectText) => onPageClick?.(page, x, y, selectText)
				});

				findController = new FindController(viewer, eventBus);

				eventBus.on('scalechanged', (evt: Record<string, unknown>) => {
					viewerState.scale = evt.scale as number;
				});

				eventBus.on('rotationchanged', (evt: Record<string, unknown>) => {
					viewerState.rotation = evt.rotation as number;
				});

				eventBus.on('updateviewarea', (evt: Record<string, unknown>) => {
					const location = evt.location as { pageNumber: number };
					viewerState.currentPage = location.pageNumber;
				});

				eventBus.on('pagesloaded', (evt: Record<string, unknown>) => {
					viewerState.totalPages = evt.pagesCount as number;
				});

				eventBus.on('updatefindmatchescount', (evt: Record<string, unknown>) => {
					const matchesCount = evt.matchesCount as { current: number; total: number };
					viewerState.searchCurrent = matchesCount.current;
					viewerState.searchTotal = matchesCount.total;
				});
			}
			const v = viewer;

			// eslint-disable-next-line id-denylist -- pdf.js DocumentInitParameters field
			let documentSource: string | { data: ArrayBuffer } | { data: Uint8Array };

			if (typeof source === 'string') {
				documentSource = source;
				_setSrcDataForDownload(null); // URL doesn't need copying
			} else if (source instanceof Blob) {
				const arrayBuffer = await source.arrayBuffer();
				_setSrcDataForDownload(arrayBuffer.slice(0)); // copy for download
				// eslint-disable-next-line id-denylist -- pdf.js DocumentInitParameters field
				documentSource = { data: arrayBuffer };
			} else if (source instanceof ArrayBuffer) {
				_setSrcDataForDownload(source.slice(0)); // copy before PDF.js detaches it
				// eslint-disable-next-line id-denylist -- pdf.js DocumentInitParameters field
				documentSource = { data: source };
			} else if (source instanceof Uint8Array) {
				_setSrcDataForDownload(new Uint8Array(source).buffer.slice(0) as ArrayBuffer); // copy for download
				// eslint-disable-next-line id-denylist -- pdf.js DocumentInitParameters field
				documentSource = { data: source };
			} else {
				throw new Error('Invalid PDF source type');
			}

			// getPdfDocument, not pdfjs.getDocument: the task must not adopt the shared worker, or the
			// destroy below (and every other document's) would tear it down for the whole app.
			// ownerDocument is where THIS viewer's canvases live - the popped-out preview window's
			// document when detached - so the PDF's fonts register where they will be drawn.
			const loadingTask = await getPdfDocument(documentSource, scrollContainerEl.ownerDocument);
			if (!loadingTask) return;
			toDestroy = loadingTask; // if the parse rejects, the task itself still needs freeing
			const loadedPdfDocument = await loadingTask.promise;
			if (gen !== loadGen) {
				toDestroy = null;
				void loadingTask.destroy().catch(() => {});
				return;
			}

			// reload of the same document (a recompile): note where we are so the fresh pages land
			// back there. A different documentKey is a genuine document switch, so start at the top.
			const key = context.documentKey;
			const anchor = key !== undefined && key === loadedKey ? v.getScrollAnchor() : null;

			overlay = snapshotOverlay();

			await v.setDocument(loadedPdfDocument);
			// setDocument awaits every page; the component may have been destroyed in that window, which
			// nulls the viewer. Its cleanup never sees this document, so free it here.
			if (!viewer) {
				toDestroy = null;
				void loadingTask.destroy().catch(() => {});
				overlay?.remove();
				return;
			}
			toDestroy = null; // the live viewer now owns it; a later load's cleanup() will destroy it
			findController?.setDocument(loadedPdfDocument);
			presentationMode.setDocument(loadedPdfDocument);
			v.restoreScrollAnchor(anchor ?? { page: 1, fraction: 0 });

			if (overlay) {
				// hold the old pixels until the fresh pages have painted, then cross-fade them away
				await v.waitForVisiblePages();
				const el = overlay;
				requestAnimationFrame(() => {
					el.style.transition = 'opacity 200ms ease';
					el.style.opacity = '0';
				});
				setTimeout(() => el.remove(), 350);
			}

			loadedKey = key;
			viewerState.loading = false;
		} catch (e) {
			// parse failed: the currently loaded document (if any) was never touched and stays up
			overlay?.remove();
			// a task/document we parsed but never handed to the viewer would otherwise leak in the worker
			if (toDestroy) void toDestroy.destroy().catch(() => {});
			const errorMessage = e instanceof Error ? e.message : 'Failed to load PDF';
			viewerState.error = errorMessage;
			viewerState.loading = false;
			context._onerror?.(errorMessage);
		}
	}

	const rendererActions: PdfViewerActions = {
		zoomIn: () => viewer?.zoomIn(),
		zoomOut: () => viewer?.zoomOut(),
		fitWidth: () => viewer?.fitWidth(),
		fitPage: () => viewer?.fitPage(),
		setScale: (scale: number) => {
			if (viewer) viewer.scale = scale;
		},
		rotateClockwise: () => viewer?.rotateClockwise(),
		rotateCounterClockwise: () => viewer?.rotateCounterClockwise(),
		goToPage: (page: number) => viewer?.scrollToPage(page),
		scrollToPosition: (page, x, y, w, h) => viewer?.scrollToPosition(page, x, y, w, h),
		search: async (query: string) => {
			if (!findController) return;
			viewerState.isSearching = true;
			viewerState.searchQuery = query;
			await findController.find({
				query,
				highlightAll: true,
				caseSensitive: false
			});
			viewerState.isSearching = false;
		},
		searchNext: () => findController?.findNext(),
		searchPrevious: () => findController?.findPrevious(),
		clearSearch: () => {
			if (findController) {
				findController.reset();
				viewerState.searchQuery = '';
				viewerState.searchCurrent = 0;
				viewerState.searchTotal = 0;
			}
		},
		savePdf: async () => {}, // saving is handled by PdfViewer, not the renderer
		enterPresentationMode: async () => {
			presentationMode.setCurrentPage(viewerState.currentPage);
			return presentationMode.request();
		},
		exitPresentationMode: async () => {
			await presentationMode.exit();
		}
	};

	onMount(async () => {
		if (BROWSER && hostEl) {
			// shadow root for style isolation
			shadowRoot = hostEl.attachShadow({ mode: 'open' });

			const styleEl = document.createElement('style');
			styleEl.textContent = rendererStyles;
			shadowRoot.appendChild(styleEl);

			const container = document.createElement('div');
			container.className = 'pdf-renderer-container';
			containerEl = container;

			scrollContainerEl = document.createElement('div');
			scrollContainerEl.className = 'pdf-scroll-container';
			container.appendChild(scrollContainerEl);

			shadowRoot.appendChild(container);

			_registerRenderer(rendererActions);

			mounted = true;
		}
	});

	// apply, and re-apply on change (live theme toggle), the customization CSS properties
	// and the dark-mode class on the shadow container
	$effect(() => {
		const container = containerEl;
		if (!container) return;
		container.style.setProperty('--pdf-background-color', backgroundColor);
		container.style.setProperty('--pdf-page-shadow', pageShadow);
		const box = container;
		function setOrRemove(name: string, value: string | undefined) {
			if (value) box.style.setProperty(name, value);
			else box.style.removeProperty(name);
		}
		setOrRemove('--pdf-scrollbar-track-color', scrollbarTrackColor);
		setOrRemove('--pdf-scrollbar-thumb-color', scrollbarThumbColor);
		setOrRemove('--pdf-scrollbar-thumb-hover-color', scrollbarThumbHoverColor);
		setOrRemove('--pdf-scrollbar-width', scrollbarWidth);
		setOrRemove('--pdf-scroll-inset-right', scrollInsetRight);
		container.classList.toggle(
			'pdf-custom-scrollbar',
			!!(scrollbarTrackColor || scrollbarThumbColor || scrollbarThumbHoverColor || scrollbarWidth)
		);
		container.classList.toggle('pdf-dark', darkMode);
	});

	$effect(() => {
		if (BROWSER && src && scrollContainerEl && mounted) {
			queueLoad(src);
		}
	});

	onDestroy(() => {
		loadGen++; // invalidate any queued load so it can't touch the destroyed viewer
		if (viewer) {
			viewer.destroy();
			viewer = null;
		}
		findController = null;
		presentationMode.destroy();
		// the worker is a global singleton, not cleaned up per-component; destroyPdfJs() fully cleans up
	});
</script>

<div bind:this={hostEl} class="pdf-renderer-host"></div>

<style>
	.pdf-renderer-host {
		display: block;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
</style>
