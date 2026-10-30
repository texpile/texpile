import type { CodeFold } from './figureLanguage';

const CLOSE: Record<string, string> = { '{': '}', '[': ']', '(': ')' };

/** where the quoted text starting at `k` ends: its closing quote, or the end of its line */
function quoteEnd(source: string, k: number) {
	let at = k + 1;
	while (at < source.length && source[at] !== '"' && source[at] !== '\n') at += source[at] === '\\' ? 2 : 1;
	return at;
}

/** what is inside each `{`, `[` or `(` that ends its line and closes on a later one, as code editors fold a block; text
 *  in quotes and after `comment` is skipped */
export function bracketFolds(source: string, comment: string): CodeFold[] {
	const open: { at: number; char: string }[] = [];
	const folds: CodeFold[] = [];
	for (let k = 0; k < source.length; k++) {
		const c = source[k];
		if (source.startsWith(comment, k)) {
			const end = source.indexOf('\n', k);
			k = end < 0 ? source.length : end;
		} else if (c === '"') k = quoteEnd(source, k);
		else if (c === '\\') k++;
		else if (CLOSE[c]) open.push({ at: k, char: c });
		else if (open.length && CLOSE[open.at(-1)!.char] === c) {
			const o = open.pop()!;
			const lineEnd = source.indexOf('\n', o.at);
			const endsLine = lineEnd >= 0 && !source.slice(o.at + 1, lineEnd).trim();
			if (endsLine && lineEnd < k) folds.push({ from: o.at + 1, to: k, label: null, collapsed: false });
		}
	}
	return folds;
}
