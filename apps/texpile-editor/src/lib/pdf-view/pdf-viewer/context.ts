import { getContext, setContext } from 'svelte';

const PDF_VIEWER_CONTEXT_KEY = Symbol('pdf-viewer');

export type PdfSource = string | ArrayBuffer | Uint8Array | Blob;

export enum PresentationModeState {
	UNKNOWN = 0,
	NORMAL = 1,
	CHANGING = 2,
	FULLSCREEN = 3
}

export type PdfViewerState = {
	loading: boolean;
	error: string | null;
	totalPages: number;
	currentPage: number;

	scale: number;
	rotation: number;

	searchQuery: string;
	searchCurrent: number;
	searchTotal: number;
	isSearching: boolean;

	presentationMode: PresentationModeState;
	/** false when the host passed no save handler, so the toolbar omits the button entirely */
	canSavePdf: boolean;
};

export type PdfViewerActions = {
	zoomIn: () => void;
	zoomOut: () => void;
	/** scale so the current page fills the available width. */
	fitWidth: () => void;
	/** scale so the current page shows whole, then scroll to its top. */
	fitPage: () => void;
	setScale: (scale: number) => void;
	rotateClockwise: () => void;
	rotateCounterClockwise: () => void;
	goToPage: (page: number) => void;
	search: (query: string) => Promise<void>;
	searchNext: () => void;
	searchPrevious: () => void;
	clearSearch: () => void;
	savePdf: (filename?: string) => Promise<void>;
	enterPresentationMode: () => Promise<boolean>;
	exitPresentationMode: () => Promise<void>;
	/** SyncTeX forward search: scroll to + briefly highlight a position on a page (PDF points, top-left origin). */
	/** `view`: which of a split preview's views jumps, by its place; otherwise the active one */
	scrollToPosition?: (page: number, x: number, y: number, width?: number, height?: number, view?: number) => void;
};

/** one view of the document, with its own page, zoom and find; the toolbar works on the one clicked last */
export type PdfView = { state: PdfViewerState; actions: PdfViewerActions | null };

/** what a renderer holds of its view */
export type PdfViewHandle = {
	state: PdfViewerState;
	register(actions: PdfViewerActions): void;
	activate(): void;
	detach(): void;
};

export type PdfViewerContext = {
	/** the active view's, as the toolbar shows it */
	state: PdfViewerState;
	actions: PdfViewerActions;
	src: PdfSource;
	/** identifies the logical document. When it's unchanged across a src change, the renderer keeps
	 *  the scroll position (a recompile of the same file); when it changes, it resets to the top. */
	documentKey?: string | number;
	/** every renderer's view, in the order they came; more than one when the document is shown twice */
	views: readonly PdfView[];
	activeView: PdfView | null;
	_attachView: () => PdfViewHandle;
	_onerror?: (error: string) => void;
	// internal: stores a copy of binary data for download (PDF.js detaches ArrayBuffers)
	_setSrcDataForDownload: (bytes: ArrayBuffer | null) => void;
};

export function setPdfViewerContext(ctx: PdfViewerContext): void {
	setContext(PDF_VIEWER_CONTEXT_KEY, ctx);
}

export function getPdfViewerContext(): PdfViewerContext {
	const ctx = getContext<PdfViewerContext>(PDF_VIEWER_CONTEXT_KEY);
	if (!ctx) {
		throw new Error('PdfToolbar must be used inside a PdfViewer component');
	}
	return ctx;
}
