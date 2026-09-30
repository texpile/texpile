// The source-mode outline of a .typ: its headings, read off Typst's own parser (the wasm build the
// editor highlights with), so a `=` inside raw text, a string or a comment never becomes one.
// Visual mode's outline comes from the ProseMirror headings instead; this is its source twin, as
// latexHeadings is for .tex.
import type { Parser, SyntaxNode, Tree } from '@lezer/common';
import type { TocItem } from '$lib/editor/visual/extensions/tableofcontents/tocStore';

/** the nodes whose text is a heading's words, as written */
const WORDS = new Set(['Text', 'Space', 'SmartQuote', 'Shorthand', 'Link', 'Ref', 'Equation', 'Raw']);

/** the headings in `tree` (parsed from `src`), in document order; `pos` is a char offset */
export function typstOutline(tree: Tree, src: string): TocItem[] {
	const items: TocItem[] = [];
	tree.iterate({
		enter(n) {
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

// the parser is a dynamic import (it carries the wasm), loaded once and kept: the editor has loaded
// the same module by the time a source-mode outline is wanted
let parser: Promise<Parser> | null = null;

/** the outline of `src`, parsing it first */
export async function typstSourceOutline(src: string): Promise<TocItem[]> {
	parser ??= import('texpile-typst-syntax-wasm').then((wasm) => new wasm.TypstParser());
	return typstOutline((await parser).parse(src), src);
}
