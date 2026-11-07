// GitHub's footnotes: `[^label]` references and `[^label]: text` definitions, which go on over indented lines
import type { MarkdownConfig } from '@lezer/markdown';

const DEFINITION = /^\[\^([^\s\]]+)\]:/;
const REFERENCE = /^\[\^([^\s\]]+)\]/;

export const footnoteSyntax: MarkdownConfig = {
	defineNodes: [
		{
			name: 'FootnoteDefinition',
			// a blank line goes on, and so does a line indented as a block of its own
			composite(_cx, line) {
				if (line.pos === line.text.length) return true;
				if (line.indent < line.baseIndent + 4) return false;
				line.moveBaseColumn(line.baseIndent + 4);
				return true;
			}
		},
		{ name: 'FootnoteLabel' },
		{ name: 'FootnoteReference' }
	],
	parseBlock: [
		{
			name: 'FootnoteDefinition',
			parse(cx, line) {
				if (line.indent - line.baseIndent >= 4) return false;
				const m = DEFINITION.exec(line.text.slice(line.pos));
				if (!m) return false;
				cx.startComposite('FootnoteDefinition', line.pos);
				cx.addElement(cx.elt('FootnoteLabel', cx.lineStart + line.pos, cx.lineStart + line.pos + m[0].length));
				line.moveBase(line.pos + m[0].length);
				return null;
			},
			endLeaf: (_cx, line) => line.indent - line.baseIndent < 4 && DEFINITION.test(line.text.slice(line.pos)),
			before: 'FencedCode'
		}
	],
	parseInline: [
		{
			name: 'FootnoteReference',
			parse(cx, next, pos) {
				if (next !== 91) return -1;
				const m = REFERENCE.exec(cx.slice(pos, Math.min(cx.end, pos + 200)));
				if (!m || cx.char(pos + m[0].length) === 40) return -1;
				return cx.addElement(cx.elt('FootnoteReference', pos, pos + m[0].length));
			},
			before: 'Link'
		}
	]
};
