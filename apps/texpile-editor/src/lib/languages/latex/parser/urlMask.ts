// \url and \href take their URL verbatim: a % in one is no comment
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
