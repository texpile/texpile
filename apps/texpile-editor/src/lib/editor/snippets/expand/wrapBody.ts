import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { CompiledSnippet } from './matchSnippets';
import type { SnippetZone } from './snippetZone';

// pieces a selection may cut through: a run of words splits into two runs
const SPLITTABLE = new Set(['Text', 'Space', 'Markup', 'Parbreak']);

/** the body a "Wrap with" entry inserts: its own, or a call to its function written for where the selection is */
export function wrapBodyFor(compiled: CompiledSnippet, zone: SnippetZone | null): string {
	const { wrap, args } = compiled.snippet;
	if (!wrap) return compiled.body;
	if (compiled.lang !== 'typst') return `\\\\${wrap}${args ? `[${args}]` : ''}{\${TM_SELECTED_TEXT}}$0`;
	// in markup and math a call needs its #; in code it is already code
	const hash = zone?.zone === 'code' ? '' : '#';
	return `${hash}${wrap}${args ? `(${args})` : ''}[\${TM_SELECTED_TEXT}]$0`;
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

/** whether wrapping from..to would split a construct, leaving half of it inside the call */
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
		}
	});
	return cut;
}
