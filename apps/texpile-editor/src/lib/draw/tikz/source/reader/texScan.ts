// what a closer is counted against: a `{...}` inside `[...]` or `(...)` hides their closers
const CLOSERS: Record<string, string> = { '{': '}', '[': ']', '(': ')' };

/** past spaces and `%` comments */
export function skipBlank(source: string, from: number, to = source.length) {
	let i = from;
	while (i < to) {
		if (/\s/.test(source[i])) i++;
		else if (source[i] === '%') {
			const nl = source.indexOf('\n', i);
			i = nl < 0 || nl > to ? to : nl + 1;
		} else break;
	}
	return i;
}

/** past the group opened at `from`, or `to` when it does not close before it */
export function groupEnd(source: string, from: number, to = source.length) {
	const open = source[from];
	const close = CLOSERS[open];
	let depth = 0;
	for (let i = from; i < to; i++) {
		const c = source[i];
		if (c === '\\') i++;
		else if (c === '%') {
			const nl = source.indexOf('\n', i);
			i = nl < 0 || nl >= to ? to : nl;
		} else if (c === '{' && open !== '{') i = groupEnd(source, i, to) - 1;
		else if (c === open) depth++;
		else if (c === close && --depth === 0) return i + 1;
	}
	return to;
}

/** a control word, `\draw`, or a control symbol, `\\` */
export function commandAt(source: string, at: number) {
	return /^\\(?:[A-Za-z@]+|.)/s.exec(source.slice(at, at + 64))?.[0] ?? '';
}

/** an identifier as TikZ's keys and keywords are spelled */
export function wordAt(source: string, at: number) {
	return /^[A-Za-z][-A-Za-z0-9_:@]*/.exec(source.slice(at, at + 64))?.[0] ?? '';
}
