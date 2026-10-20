// \url and \href take their URL verbatim, but unified-latex tokenizes the argument like prose: a %
// starts a comment that swallows the closing brace, a # is a parameter token. The URL argument is
// masked to same-length placeholders before the parse (positions stay valid for the span capture)
// and every string in the AST is unmasked after it.
import { callsIn, rolesOf } from '../knowledge/calls/commandCalls';

const PERCENT = '';
const HASH = '';

export function maskUrlSpecials(src: string): string {
	if (!src.includes('%') && !src.includes('#')) return src;
	let out = '';
	let last = 0;
	for (const call of callsIn(src, ['url']))
		for (const { arg, from, to } of call.args) {
			if (!rolesOf(arg).includes('url')) continue;
			out += src.slice(last, from) + src.slice(from, to).replace(/%/g, PERCENT).replace(/#/g, HASH);
			last = to;
		}
	return out + src.slice(last);
}

/** whether the last line of `text` ends in a comment; a % in a URL argument is part of the URL */
export function endsInComment(text: string): boolean {
	return text.includes('%') && /(^|[^\\])(\\\\)*%[^\n]*$/.test(maskUrlSpecials(text));
}

export function unmaskUrlSpecials(node: unknown): void {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const kid of node) unmaskUrlSpecials(kid);
		return;
	}
	const n = node as { content?: unknown; args?: unknown };
	if (typeof n.content === 'string') {
		if (n.content.includes(PERCENT) || n.content.includes(HASH)) n.content = n.content.replace(//g, '%').replace(//g, '#');
	} else unmaskUrlSpecials(n.content);
	unmaskUrlSpecials(n.args);
}
