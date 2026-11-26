// A source paragraph as the model reads it: markup gone, formulas and references as $x$, one space between words
import type { ReviewReading } from './reviewTypes';

const FORMULA_OR_REFERENCE = /\$|\\[([]|\\begin\s*\{|\\(?:eq|c|C|auto|page|name)?ref\b|\\\w*cite\w*/;
// a list's or a table's own markup; what is either side of it is never one sentence
const LAYOUT_ENV = /\\(?:begin|end)\s*\{(?:itemize|enumerate|description|tabular\*?|tabularx|longtable|center|quote|quotation)\}/g;
const BREAK = /\\item\b|&|\\\\|\\par\b|\\newline\b/;

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
	// a line break in the text ends a list item or a table cell
	function breakLine(at: number): void {
		if (text === '' || text.endsWith('\n')) return;
		if (text.endsWith(' ')) text = `${text.slice(0, -1)}\n`;
		else {
			text += '\n';
			origin.push(at);
		}
	}
	const end = from + masked.length;
	let i = from;
	let first = 0;
	for (let last = spans.length; first < last;) {
		const mid = (first + last) >> 1;
		if (spans[mid][1] <= from) first = mid + 1;
		else last = mid;
	}
	for (let k = first; k < spans.length && spans[k][0] < end; k++) {
		const [a, b] = spans[k];
		if (b <= i) continue;
		for (; i < a; i++) put(masked[i - from], i - from);
		const markup = source.slice(Math.max(a, from), Math.min(b, end));
		if (/^[~\s]/.test(markup)) put(' ', i - from);
		const layout = markup.replace(LAYOUT_ENV, '');
		if (layout !== markup || BREAK.test(markup)) breakLine(i - from);
		if (FORMULA_OR_REFERENCE.test(layout.replace(BREAK, ''))) put('$x$', i - from);
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
