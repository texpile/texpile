import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { CompiledSnippet } from './matchSnippets';
import type { SnippetZone } from './snippetZone';

// typst nodes a selection may cut through
const SPLITTABLE = new Set(['Text', 'Space', 'Markup', 'Parbreak']);

export function wrapBodyFor(compiled: CompiledSnippet, zone: SnippetZone | null): string {
	const { wrap, args } = compiled.snippet;
	if (!wrap) return compiled.body;
	if (compiled.lang !== 'typst') return `\\\\${wrap}${args ? `[${args}]` : ''}{\${TM_SELECTED_TEXT}}$0`;
	// a typst call needs its # outside code
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
