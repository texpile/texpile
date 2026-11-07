// \verb|text| and the other commands with a verbatim argument (\lstinline, \Verb, \mintinline) drawn as inline code
import { faceElement, type ChipFace } from '$lib/languages/latex/visual/core';
import { verbatimArgumentEnd, verbatimArgumentStart, verbatimCommandNames } from '$lib/languages/latex/knowledge/calls/verbatimCalls';

let known: Set<string> | null = null;

/** what a verbatim call prints; null when `source` is no such call */
export function verbatimTextOf(source: string): string | null {
	const head = /^\\([a-zA-Z]+)/.exec(source);
	known ??= new Set(verbatimCommandNames());
	if (!head || !known.has(head[1])) return null;
	const start = verbatimArgumentStart(source, head[0].length, head[1]);
	if (start < 0) return null;
	const end = verbatimArgumentEnd(source, start, head[1]);
	return end < 0 ? null : source.slice(start + 1, end - 1);
}

export function verbatimFace(text: string): ChipFace {
	const dom = faceElement('code', 'drawn-verbatim', text);
	return { dom };
}
