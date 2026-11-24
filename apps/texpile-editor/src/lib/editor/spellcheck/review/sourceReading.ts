// A source paragraph as the model reads it: markup gone, formulas and references as $x$, one space between words
import type { ReviewReading } from './reviewTypes';

const FORMULA_OR_REFERENCE = /\$|\\[([]|\\begin\s*\{|\\(?:eq|c|C|auto|page|name)?ref\b|\\\w*cite\w*/;

/** `masked` is the paragraph Harper read, starting at `from` in `source`; `spans` the masked ranges of the whole source */
export function sourceReading(source: string, from: number, masked: string, spans: readonly [number, number][]): ReviewReading {
	let text = '';
	const origin: number[] = [];
	function put(chars: string, at: number): void {
		for (const ch of chars) {
			if (/\s/.test(ch) && (text === '' || /\s$/.test(text))) continue;
			text += /\s/.test(ch) ? ' ' : ch;
			origin.push(at);
		}
	}
	const end = from + masked.length;
	let i = from;
	for (const [a, b] of spans) {
		if (b <= i || a >= end) continue;
		for (; i < a; i++) put(masked[i - from], i - from);
		const markup = source.slice(Math.max(a, from), Math.min(b, end));
		if (/^[~\s]/.test(markup)) put(' ', i - from);
		if (FORMULA_OR_REFERENCE.test(markup)) put('$x$', i - from);
		i = Math.min(b, end);
	}
	for (; i < end; i++) put(masked[i - from], i - from);
	const trimmed = text.trimEnd();
	return {
		text: trimmed,
		toLinted(offset, length) {
			const start = origin[offset] ?? masked.length;
			const last = length > 0 ? (origin[offset + length - 1] ?? start) : start;
			return { offset: start, length: last + 1 - start };
		}
	};
}
