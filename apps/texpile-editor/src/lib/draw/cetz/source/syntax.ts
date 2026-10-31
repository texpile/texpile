// enough of Typst's code syntax to find a canvas, its statements and their arguments: brackets matched past
// strings, comments and the text of content blocks

const OPENERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

/** where a comment, string or raw block that starts at `at` ends, or `at` itself when none starts there */
function skipQuoted(src: string, at: number, markup: boolean): number {
	if (src.startsWith('//', at)) {
		const nl = src.indexOf('\n', at);
		return nl < 0 ? src.length : nl;
	}
	if (src.startsWith('/*', at)) {
		const end = src.indexOf('*/', at + 2);
		return end < 0 ? src.length : end + 2;
	}
	if (src[at] === '`') {
		const fence = /^`+/.exec(src.slice(at))![0];
		const end = src.indexOf(fence, at + fence.length);
		return end < 0 ? src.length : end + fence.length;
	}
	if (markup && src[at] === '\\') return Math.min(at + 2, src.length);
	if (!markup && src[at] === '"') {
		let k = at + 1;
		while (k < src.length && src[k] !== '"') k += src[k] === '\\' ? 2 : 1;
		return Math.min(k + 1, src.length);
	}
	return at;
}

/** the index of the bracket that closes the one at `open`, or -1 */
export function closingBracket(src: string, open: number): number {
	const stack: string[] = [];
	for (let k = open; k < src.length; k++) {
		const markup = stack.at(-1) === ']';
		const skipped = skipQuoted(src, k, markup);
		if (skipped !== k) {
			k = skipped - 1;
			continue;
		}
		const c = src[k];
		// a content block's text is markup: only its brackets count
		if (markup && c !== '[' && c !== ']') continue;
		if (c in OPENERS) stack.push(OPENERS[c]);
		else if (c === ')' || c === ']' || c === '}') {
			if (stack.pop() !== c) return -1;
			if (!stack.length) return k;
		}
	}
	return -1;
}

export type Span = { from: number; to: number };

/** the statements of a code block body, at its own depth: a newline or `;` ends one */
export function splitStatements(src: string, from: number, to: number): Span[] {
	const out: Span[] = [];
	let start = -1;
	let lastEnd = -1;
	function end() {
		if (start >= 0) out.push({ from: start, to: lastEnd });
		start = -1;
	}
	for (let k = from; k < to; k++) {
		const c = src[k];
		if (c === '\n' || c === ';') {
			end();
			continue;
		}
		if (c === ' ' || c === '\t' || c === '\r') continue;
		const skipped = skipQuoted(src, k, false);
		if (skipped !== k && (src.startsWith('//', k) || src.startsWith('/*', k))) {
			k = skipped - 1;
			continue;
		}
		if (start < 0) start = k;
		if (c in OPENERS) {
			const close = closingBracket(src, k);
			k = close < 0 ? to : close;
		} else if (skipped !== k) k = skipped - 1;
		lastEnd = k + 1;
	}
	end();
	return out;
}

export type Arg = { from: number; to: number; name: string | null; value: Span };

/** the arguments between `(` and its `)`, each with its value and the name it is given, if any */
export function splitArgs(src: string, open: number, close: number): Arg[] {
	const out: Arg[] = [];
	let k = open + 1;
	let start = k;
	function push(end: number) {
		const text = src.slice(start, end);
		const lead = text.length - text.trimStart().length;
		const from = start + lead;
		const to = start + text.trimEnd().length;
		if (to <= from) return;
		const named = /^([A-Za-z_][\w-]*)\s*:/.exec(src.slice(from, to));
		const valueFrom = named ? from + named[0].length + /^\s*/.exec(src.slice(from + named[0].length))![0].length : from;
		out.push({ from, to, name: named ? named[1] : null, value: { from: valueFrom, to } });
	}
	for (; k < close; k++) {
		const c = src[k];
		const skipped = skipQuoted(src, k, false);
		if (skipped !== k) {
			k = skipped - 1;
			continue;
		}
		if (c in OPENERS) {
			const end = closingBracket(src, k);
			if (end < 0) break;
			k = end;
		} else if (c === ',') {
			push(k);
			start = k + 1;
		}
	}
	push(close);
	return out;
}

const NUMBER = String.raw`-?\d+(?:\.\d+)?`;
const PAIR = new RegExp(String.raw`^\(\s*(${NUMBER})\s*,\s*(${NUMBER})\s*,?\s*\)$`);

/** `(x, y)` written with plain numbers, else null */
export function readPair(text: string): [number, number] | null {
	const m = PAIR.exec(text.trim());
	return m ? [Number(m[1]), Number(m[2])] : null;
}

export function readNumber(text: string): number | null {
	return new RegExp(`^${NUMBER}$`).test(text.trim()) ? Number(text) : null;
}
