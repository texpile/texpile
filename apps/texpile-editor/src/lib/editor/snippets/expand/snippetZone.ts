import { language, syntaxTree } from '@codemirror/language';
import type { EditorState, Text } from '@codemirror/state';
import { docText } from '$lib/editor/source/docText';
import { mathRegionAt } from '$lib/editor/source/extensions/math-preview/mathScanner';
import { scanSourceMath, type SourceMathScan } from '$lib/editor/source/extensions/math-preview/sourceMath';
import { inTextArgument } from '$lib/languages/latex/symbols/latexSymbolInsert';
import { typstInsertContextAt } from '$lib/languages/typst/symbols/typstSymbolInsert';
import { insideCode } from './codeRanges';
import type { SnippetContext, SnippetLanguage } from '../file/snippetTypes';

export type SnippetZone = { zone: 'math' | 'text' | 'code'; display: boolean };

const scanCache = new WeakMap<Text, SourceMathScan>();

function scanOf(doc: Text, markdown: boolean): SourceMathScan {
	let scan = scanCache.get(doc);
	if (!scan) {
		scan = scanSourceMath(docText(doc), markdown);
		scanCache.set(doc, scan);
	}
	return scan;
}

function inLatexComment(state: EditorState, pos: number): boolean {
	const line = state.doc.lineAt(pos);
	return /(?:^|[^\\])(?:\\\\)*%/.test(line.text.slice(0, pos - line.from));
}

function texZone(state: EditorState, pos: number, markdown: boolean): SnippetZone | null {
	if (!markdown && inLatexComment(state, pos)) return null;
	const scan = scanOf(state.doc, markdown);
	if (insideCode(scan.code, pos)) return null;
	const region = mathRegionAt(scan.math, pos);
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

/** null where no snippet may fire */
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

export type MathBounds = { innerTo: number; to: number };

export function mathBoundsAt(state: EditorState, pos: number, lang: SnippetLanguage): MathBounds | null {
	if (lang !== 'typst') {
		const region = mathRegionAt(scanOf(state.doc, lang === 'markdown').math, pos);
		return region && pos >= region.innerFrom && pos <= region.innerTo ? { innerTo: region.innerTo, to: region.to } : null;
	}
	for (let node = syntaxTree(state).resolveInner(pos, -1); node.parent; node = node.parent) {
		if (node.name === 'Equation') return { innerTo: node.to - 1, to: node.to };
	}
	return null;
}
