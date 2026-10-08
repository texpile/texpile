export { default as PdfViewer, Toolbar as PdfToolbar, Renderer as PdfRenderer } from './PdfViewer.svelte';

export type { PdfSource } from './pdf-viewer/context';

// context is public API so hosts can build custom toolbars
export {
	getPdfViewerContext,
	PresentationModeState,
	type PdfViewerState,
	type PdfViewerActions,
	type PdfViewerContext,
	type PdfView
} from './pdf-viewer/context';

export { getPdfJs, getPdfDocument, destroyPdfJs } from './pdf-viewer/pdfjs-singleton';
