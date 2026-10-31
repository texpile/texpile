import type { FigureProvider } from '$lib/draw/editor/provider/figureEngine';
import { tikzLanguage } from '$lib/draw/tikz/tikzLanguage';
import { cetzLanguage } from '$lib/draw/cetz/cetzLanguage';
import { isTypstFile } from '../anchor/pictureFinders';
import { desktopTikzEngine } from './desktopTikzEngine';
import { desktopCetzEngine } from './desktopCetzEngine';

/** the figure editor for the file's language: TikZ under the document's preamble, or CeTZ, whose job is whole */
export function figureProvider(path: string, tikz: { root: () => string; preamble: () => Promise<string> }): FigureProvider {
	return isTypstFile(path)
		? { language: cetzLanguage, engine: desktopCetzEngine() }
		: { language: tikzLanguage, engine: desktopTikzEngine(tikz) };
}

/** what a picture that is no longer whole needs, as written: its environment's \begin and \end, or the canvas call */
export function pictureNeeds(path: string, name: string): string[] {
	return isTypstFile(path) ? ['canvas(...)'] : [`\\begin{${name}}`, `\\end{${name}}`];
}
