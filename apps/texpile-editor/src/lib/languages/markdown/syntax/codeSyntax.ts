// A code span may open right after an escaped backtick (`\``); @lezer/markdown takes that backtick as part of the span's
// opening run and finds no span
import type { MarkdownConfig } from '@lezer/markdown';

const BACKTICK = 96;
const BACKSLASH = 92;

export const codeSyntax: MarkdownConfig = {
	parseInline: [
		{
			name: 'AfterEscapedBacktick',
			parse(cx, next, start) {
				if (next !== BACKTICK || cx.char(start - 1) !== BACKTICK || cx.char(start - 2) !== BACKSLASH) return -1;
				let slashes = 0;
				while (cx.char(start - 2 - slashes) === BACKSLASH) slashes++;
				if (slashes % 2 === 0) return -1;
				let pos = start + 1;
				while (pos < cx.end && cx.char(pos) === BACKTICK) pos++;
				const size = pos - start;
				let run = 0;
				for (; pos < cx.end; pos++) {
					if (cx.char(pos) !== BACKTICK) {
						run = 0;
						continue;
					}
					run++;
					if (run === size && cx.char(pos + 1) !== BACKTICK) {
						return cx.addElement(
							cx.elt('InlineCode', start, pos + 1, [cx.elt('CodeMark', start, start + size), cx.elt('CodeMark', pos + 1 - size, pos + 1)])
						);
					}
				}
				return -1;
			},
			before: 'InlineCode'
		}
	]
};
