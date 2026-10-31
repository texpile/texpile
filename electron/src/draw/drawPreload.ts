// the figure engines as the renderer reaches them, spread into window.texpileNative
import { invokeFs } from '../preloadIpc';

export const drawBridge = {
	/** one instrumented TikZ picture drawn by the warm lualatex, under the document's preamble */
	drawRender: (body: { root: string; preamble: string; picture: string }) => invokeFs('draw:render', body),
	/** one instrumented CeTZ picture, a whole Typst document, drawn by the warm tinymist */
	drawCetz: (job: string) => invokeFs('draw:cetz', job),
	/** this window's figure tabs are done: the engines no other window uses stop */
	drawStop: () => invokeFs('draw:stop'),
	/** Draw again: the engines this window uses start afresh */
	drawRestart: () => invokeFs('draw:restart'),
	/** the bytes of a font or image file the figure engine reported */
	drawFile: (reported: string) => invokeFs('draw:file', reported)
};
