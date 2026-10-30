import type { Arranged } from '$lib/draw/editor/figure/figureLanguage';

/** `text` in place of from..to; `marks` are offsets into `text`, given back as positions in the result */
export type TextEdit = { from: number; to: number; text: string; marks?: number[] };

/** edits that do not overlap, applied at once; an insert where a removal starts goes first */
export function applyTextEdits(source: string, edits: TextEdit[]): Arranged {
	const sorted = [...edits].sort((a, b) => a.from - b.from || a.to - b.to);
	let out = '';
	let last = 0;
	const at: number[] = [];
	for (const e of sorted) {
		out += source.slice(last, e.from);
		for (const m of e.marks ?? []) at.push(out.length + m);
		out += e.text;
		last = e.to;
	}
	return { source: out + source.slice(last), at };
}

export function lineStart(source: string, pos: number) {
	return source.lastIndexOf('\n', pos - 1) + 1;
}

export function lineEnd(source: string, pos: number) {
	const nl = source.indexOf('\n', pos);
	return nl < 0 ? source.length : nl;
}

export function indentAt(source: string, pos: number) {
	return /^[ \t]*/.exec(source.slice(lineStart(source, pos)))![0];
}

const IN_TEXT = /(?<!\\)([%#&_^])/g;
const IN_MATH = /(?<!\\)([%#])/g;
// a diagram's cell or arrow label is math already, and its `&` the next cell
const IN_DIAGRAM = /(?<!\\)([%#&])/g;

/** typed text as TeX takes it: a `%` or a `#` can only be meant as the character, and outside math so can a `&`, a
 *  `_` or a `^`, never a comment, a parameter, a column, a subscript or a superscript. In a diagram, which is math
 *  already, a `$` typed around math is left out */
export function texText(text: string, diagram = false) {
	if (diagram) return text.replace(/(?<!\\)\$/g, '').replace(IN_DIAGRAM, '\\$1');
	return text
		.split(/(?<!\\)(\$)/)
		.map((part, k, parts) => {
			const math = parts.slice(0, k).filter((p) => p === '$').length % 2 === 1;
			return math ? part.replace(IN_MATH, '\\$1') : part.replace(IN_TEXT, (c) => (c === '^' ? '\\^{}' : `\\${c}`));
		})
		.join('');
}

/** written text as it is typed, the other way */
export function typedText(text: string) {
	return text
		.replace(/\\\^\{\}/g, '^')
		.replace(/\\mathchar"0026 ?/g, '&')
		.replace(/\\([%#&_])/g, '$1');
}

/** the text in braces when `needs` finds what the syntax around it would read as its own, unless braced already */
export function bracedIf(text: string, needs: RegExp) {
	return needs.test(text) && !/^\{.*\}$/s.test(text) ? `{${text}}` : text;
}

export function escapeRegExp(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
