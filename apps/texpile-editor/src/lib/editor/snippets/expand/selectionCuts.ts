import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import type { CompiledSnippet } from './matchSnippets';

// typst nodes a selection may cut through
const SPLITTABLE = new Set(['Text', 'Space', 'Markup', 'Parbreak', 'Math']);

/** `*bo` of `*bold*`: the selection holds one end token of a node delimited by two */
function takesOneDelimiter(node: SyntaxNode, from: number, to: number): boolean {
	const first = node.firstChild;
	const last = node.lastChild;
	if (!first || !last || first.from === last.from || first.firstChild || last.firstChild) return false;
	return (first.from >= from && first.to <= to) !== (last.from >= from && last.to <= to);
}

function bracesBalance(text: string): boolean {
	let depth = 0;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\\') i++;
		else if (text[i] === '{') depth++;
		else if (text[i] === '}' && --depth < 0) return false;
	}
	return depth === 0;
}

export function cutsThroughSyntax(state: EditorState, from: number, to: number, lang: CompiledSnippet['lang']): boolean {
	if (lang !== 'typst') return !bracesBalance(state.sliceDoc(from, to));
	let cut = false;
	syntaxTree(state).iterate({
		from,
		to,
		enter(node) {
			if (cut || SPLITTABLE.has(node.name)) return;
			const crossesStart = node.from < from && node.to > from && node.to < to;
			const crossesEnd = node.from > from && node.from < to && node.to > to;
			if (crossesStart || crossesEnd) cut = true;
			else if (node.from <= from && node.to >= to) cut = takesOneDelimiter(node.node, from, to);
		}
	});
	return cut;
}
