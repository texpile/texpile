import { BROWSER } from 'esm-env';

type PdfLib = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type DocumentInit = NonNullable<Parameters<PdfLib['getDocument']>[0]>;
/** a bare url, which pdf.js 6 no longer takes on its own, or the init parameters */
type DocumentSource = string | URL | DocumentInit;
type LoadingTask = ReturnType<PdfLib['getDocument']>;

let pdfjsLib: PdfLib | null = null;
let pdfWorker: import('pdfjs-dist/legacy/build/pdf.mjs').PDFWorker | null = null;
let rawWorker: Worker | null = null;
let initPromise: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs') | null> | null = null;

/** the PDF.js library instance; creates the worker on first call, cached afterwards. */
export async function getPdfJs(): Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs') | null> {
	if (!BROWSER) return null;

	if (pdfjsLib && pdfWorker) return pdfjsLib;

	if (initPromise) return initPromise;

	initPromise = (async () => {
		pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

		// import.meta.url so bundlers resolve the worker file correctly
		rawWorker = new Worker(new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url), {
			type: 'module'
		});
		pdfWorker = new pdfjsLib.PDFWorker({
			port: rawWorker as unknown as null
		});
		pdfjsLib.GlobalWorkerOptions.workerPort = pdfWorker.port;

		return pdfjsLib;
	})();

	return initPromise;
}

/**
 * Open a document on the SHARED worker, without letting it be adopted.
 *
 * Use this rather than pdfjs.getDocument() directly. getDocument() with no `worker` in its source
 * does this (pdf.mjs, getDocument):
 *
 *     if (!worker) {
 *       worker = PDFWorker.create({ port: GlobalWorkerOptions.workerPort });
 *       task._worker = worker;
 *     }
 *
 * which hands our one process-wide worker to the loading task as if the task owned it. Destroying
 * any single document then destroys the worker for every other document: PDFDocumentLoadingTask
 * .destroy() flags the port `_pendingDestroy`, awaits the transport, then terminates the worker and
 * drops it from PDFWorker's port map.
 *
 * Two ways that broke. A load starting inside that await window throws "PDFWorker.create - the
 * worker is being destroyed"; a load starting after it completes gets a worker that has already
 * been terminated and simply never resolves. Guests hit both, because a guest's PDF arrives as a
 * new blob on every host compile - a real document switch each time, so destroy-then-load runs on
 * every compile, and PDFViewerCore.cleanup() does not await the destroy.
 *
 * Passing `worker` takes the branch above out of play: `src.worker instanceof PDFWorker` leaves
 * task._worker null, so no document destroy can reach the worker. It lives until destroyPdfJs().
 */
const fontFrames = new WeakMap<Document, HTMLIFrameElement>();

/**
 * The document the fonts of every PDF drawn in `host`'s window go to: an empty frame's. pdf.js adds each embedded
 * font to a document's font set, and a change of the window's own set makes the browser lay out all the text in the
 * window again: the compiled paper loading and scrolling beside the editor laid the editor out 28 times. Only a
 * canvas of this document draws those fonts, so a page is drawn on one (`pdfCanvas`) and copied to where it shows.
 */
export function pdfFontDocument(host: Document = document): Document {
	let frame = fontFrames.get(host);
	if (!frame?.isConnected || !frame.contentDocument) {
		frame = host.createElement('iframe');
		frame.hidden = true;
		frame.tabIndex = -1;
		frame.setAttribute('aria-hidden', 'true');
		host.body.append(frame);
		fontFrames.set(host, frame);
	}
	return frame.contentDocument!;
}

/** a canvas a PDF opened in `host`'s window can be drawn on with its own fonts */
export function pdfCanvas(width: number, height: number, host: Document = document): HTMLCanvasElement {
	const canvas = pdfFontDocument(host).createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

/** `host` is the document of the window the PDF shows in: the popped-out preview has its own */
export async function getPdfDocument(src: DocumentSource, host: Document = document): Promise<LoadingTask | null> {
	const pdfjs = await getPdfJs();
	if (!pdfjs || !pdfWorker) return null;
	// a bare url goes into the init parameters, which is also where the worker has to go
	const params = typeof src === 'string' || src instanceof URL ? { url: src } : src;
	return pdfjs.getDocument({ ...params, worker: pdfWorker, ownerDocument: pdfFontDocument(host) });
}

/** destroys the PDF.js worker; the next getPdfJs() call creates a new one. */
export function destroyPdfJs(): void {
	// before pdfjsLib goes: otherwise the reference is lost and workerPort keeps pointing at a
	// terminated port, which the next getDocument() would look up in PDFWorker's port map
	if (pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerPort = null;
	if (pdfWorker) {
		pdfWorker.destroy();
		pdfWorker = null;
	}
	if (rawWorker) {
		rawWorker.terminate();
		rawWorker = null;
	}
	pdfjsLib = null;
	initPromise = null;
}
