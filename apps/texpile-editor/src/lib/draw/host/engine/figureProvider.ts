import type { FigureProvider } from '$lib/draw/editor/provider/figureEngine';
import { tikzLanguage } from '$lib/draw/tikz/tikzLanguage';
import { cetzLanguage } from '$lib/draw/cetz/cetzLanguage';
import { isTypstFile } from '../anchor/pictureFinders';
import { desktopTikzEngine } from './desktopTikzEngine';
import { desktopCetzEngine } from './desktopCetzEngine';

export function figureProvider(path: string, where: { root: () => string; preamble: () => Promise<string> }): FigureProvider {
	return isTypstFile(path)
		? { language: cetzLanguage, engine: desktopCetzEngine({ root: where.root, path }) }
		: { language: tikzLanguage, engine: desktopTikzEngine(where) };
}

export function pictureNeeds(path: string, name: string): string[] {
	return isTypstFile(path) ? ['canvas(...)'] : [`\\begin{${name}}`, `\\end{${name}}`];
}
