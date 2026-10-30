import type { FigureLanguage } from '../figure/figureLanguage';

/** a font the engine typeset with, whose outlines the canvas draws glyphs from */
export type EngineFont = {
	id: number;
	name: string;
	file: string;
	size: number;
	harf: boolean;
	/** a classic Type1 font: its outlines and the encoding the engine used */
	t1?: { pfb: string; enc: string | null };
};

/** the bytes of a file an engine reported (a font, an image), by the path it gave */
export type EngineFileReader = (path: string) => Promise<ArrayBuffer>;

/** what draws one figure language's pictures, wherever it runs: TeX in the page, or an app's own engine behind its
 *  main process */
export type FigureEngine = {
	/** runs the engine on one instrumented picture, under the document's own set-up; the answer is the language's
	 *  own result */
	render(job: string): Promise<unknown>;
	/** ends the picture being drawn, whose render rejects, when a newer one is waiting on it */
	abandon?(): void;
	/** forgets what it kept, its preambles loaded, so the next picture starts TeX afresh */
	reset?(): void;
	/** the font files the engine used; an engine whose drawing carries its glyphs as outlines needs none */
	readFont?: EngineFileReader;
	/** a URL the page can load an image the engine reported from (PNG or JPEG); without it images show as boxes */
	imageUrl?: (path: string) => string;
};

/** what the editor is given for one figure language: the language itself and the engine that draws it */
export type FigureProvider = {
	language: FigureLanguage;
	engine: FigureEngine;
};
