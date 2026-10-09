import { language, syntaxTree } from '@codemirror/language';
import type { EditorState, Text } from '@codemirror/state';
import { findMathRegions, mathRegionAt, type MathRegion } from '$lib/editor/source/extensions/math-preview/mathScanner';
import { inTextArgument } from '$lib/languages/latex/symbols/latexSymbolInsert';
import { typstInsertContextAt } from '$lib/languages/typst/symbols/typstSymbolInsert';
import type { SnippetContext, SnippetLanguage } from '../file/snippetTypes';

export type SnippetZone = { zone: 'math' | 'text' | 'code'; display: boolean };

// one scan per document version: a trigger asks on the keystroke, and the popup on the next
const regionCache = new WeakMap<Text, MathRegion[]>();

function regionsOf(doc: Text, comments: boolean): MathRegion[] {
	let regions = regionCache.get(doc);
	if (!regions) {
		regions = findMathRegions(doc.toString(), comments);
		regionCache.set(doc, regions);
	}
	return regions;
}

function inLatexComment(state: EditorState, pos: number): boolean {
	const line = state.doc.lineAt(pos);
	return /(?:^|[^\\])(?:\\\\)*%/.test(line.text.slice(0, pos - line.from));
}

function texZone(state: EditorState, pos: number, markdown: boolean): SnippetZone | null {
	if (!markdown && inLatexComment(state, pos)) return null;
	const region = mathRegionAt(regionsOf(state.doc, !markdown), pos);
	if (!region || pos < region.innerFrom || pos > region.innerTo) return { zone: 'text', display: false };
	if (!markdown && inTextArgument(state, pos)) return { zone: 'text', display: false };
	return { zone: 'math', display: region.kind === 'display' };
}

function typstZone(state: EditorState, pos: number): SnippetZone | null {
	// before its parser has loaded every position reads as markup, math included
	if (!state.facet(language)) return null;
	const zone = typstInsertContextAt(state, pos);
	if (zone === 'text') return null;
	if (zone !== 'math') return { zone: zone === 'code' ? 'code' : 'text', display: false };
	for (let node = syntaxTree(state).resolveInner(pos, -1); node.parent; node = node.parent) {
		if (node.name === 'Equation') return { zone: 'math', display: /^\$\s/.test(state.sliceDoc(node.from, node.from + 2)) };
	}
	return { zone: 'math', display: false };
}

/** what `pos` sits in; null where no snippet may fire: a comment, a string, a parser not yet loaded */
export function snippetZoneAt(state: EditorState, pos: number, lang: SnippetLanguage): SnippetZone | null {
	if (lang === 'typst') return typstZone(state, pos);
	return texZone(state, pos, lang === 'markdown');
}

export function contextAllows(context: SnippetContext, zone: SnippetZone | null): boolean {
	if (!zone) return false;
	switch (context) {
		case 'any':
			return true;
		case 'math':
			return zone.zone === 'math';
		case 'inline-math':
			return zone.zone === 'math' && !zone.display;
		case 'display-math':
			return zone.zone === 'math' && zone.display;
		default:
			return zone.zone === context;
	}
}
