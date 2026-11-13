// The source-mode outline of a .typ: its headings, figures and tables, read off Typst's own parser (the wasm build
// the editor highlights with), so a `=` inside raw text, a string or a comment never becomes one.
// Visual mode's outline comes from the ProseMirror headings instead; this is its source twin, as
// latexHeadings is for .tex.
import type { SyntaxNode, Tree } from '@lezer/common';
import type { Node as PMNode } from 'prosemirror-model';
import type { TocItem } from '$lib/editor/visual/extensions/tableofcontents/tocStore';
import { typstTreeOf } from './syntax/typstTrees';
import { namedArg, positionalArgs, readTypstCall } from './visual/core/reading/typstCall';
import { numberedElementsOf } from './visual/extensions/numbers/numberedElements';

/** the nodes whose text is a heading's words, as written */
const WORDS = new Set(['Text', 'Space', 'SmartQuote', 'Shorthand', 'Link', 'Ref', 'Equation', 'Raw']);

// a #figure call as the Contents lists it: a table when it holds one or says so, with its caption's words
function figureEntry(src: string, from: number, to: number): TocItem | null {
	if (!src.startsWith('figure(', from)) return null;
	const call = readTypstCall(`#${src.slice(from, to)}`);
	if (call?.name !== 'figure') return null;
	const holdsTable = positionalArgs(call)[0]?.value.startsWith('table(') || namedArg(call, 'kind')?.value === 'table';
	const caption = namedArg(call, 'caption');
	const text = caption?.kind === 'ContentBlock' ? words(caption.node, call.source).replace(/\s+/g, ' ').trim() : '';
	return { level: 0, kind: holdsTable ? 'table' : 'figure', text, pos: from };
}

// a heading written as a call, #heading(level: 2)[Title]
function headingCall(src: string, from: number, to: number): TocItem | null {
	if (!src.startsWith('heading(', from) && !src.startsWith('heading[', from)) return null;
	const call = readTypstCall(`#${src.slice(from, to)}`);
	if (call?.name !== 'heading') return null;
	const body = call.bodies.at(-1);
	if (!body) return null;
	const level = Number(namedArg(call, 'level')?.value ?? namedArg(call, 'depth')?.value ?? 1) || 1;
	return { level, text: words(body.node, call.source).replace(/\s+/g, ' ').trim(), pos: from };
}

/** the headings, figures and tables in `tree` (parsed from `src`), in document order; `pos` is a char offset */
export function typstOutline(tree: Tree, src: string): TocItem[] {
	const items: TocItem[] = [];
	tree.iterate({
		enter(n) {
			if (n.name === 'FuncCall') {
				const entry = figureEntry(src, n.from, n.to) ?? headingCall(src, n.from, n.to);
				if (entry) items.push(entry);
				return entry ? false : undefined;
			}
			if (n.name !== 'Heading') return;
			const marker = n.node.getChild('HeadingMarker');
			const body = n.node.getChild('Markup');
			items.push({ level: marker ? marker.to - marker.from : 1, text: body ? headingText(body, src) : '', pos: n.from });
			return false;
		}
	});
	return items;
}

/** what a reader sees of a heading: its words, without the markup around them or its label */
function headingText(body: SyntaxNode, src: string): string {
	return words(body, src).replace(/\s+/g, ' ').trim();
}

function words(node: SyntaxNode, src: string): string {
	let out = '';
	for (let c = node.firstChild; c; c = c.nextSibling) {
		if (c.name === 'Label') continue;
		if (c.name === 'Escape') out += src.slice(c.from + 1, c.to);
		else if (WORDS.has(c.name)) out += src.slice(c.from, c.to);
		// strong, emphasis, a #smallcaps[...] call: their words, not their delimiters or names
		else out += words(c, src);
	}
	return out;
}

/** the outline of `src`, parsing it first */
export async function typstSourceOutline(src: string): Promise<TocItem[]> {
	return typstOutline(await typstTreeOf(src), src);
}

/** a Typst visual editor's figures and tables, in order, at its positions */
export function typstVisualFloats(doc: PMNode): TocItem[] {
	return numberedElementsOf(doc)
		.filter((element) => element.kind === 'figure')
		.map((element) => ({ level: 0, kind: element.figureKind === 'table' ? 'table' : 'figure', text: element.text, pos: element.pos }));
}
