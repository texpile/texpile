// @lezer/markdown leaves a self-closing tag alone on its line (`<br/>`) out of the HTML blocks CommonMark has for it
import type { MarkdownConfig } from '@lezer/markdown';
import { containerDepth } from './blockLines';

const SELF_CLOSING_TAG = /^\s*<[a-z][\w-]*(?:\s+[a-z:_][\w.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/>\s*$/i;

export const htmlSyntax: MarkdownConfig = {
	parseBlock: [
		{
			name: 'SelfClosingTagBlock',
			parse(cx, line) {
				if (!SELF_CLOSING_TAG.test(line.text.slice(line.pos))) return false;
				const from = cx.lineStart + line.pos;
				while (cx.nextLine()) if (line.text.trim() === '' || containerDepth(line) < cx.depth) break;
				cx.addElement(cx.elt('HTMLBlock', from, cx.prevLineEnd()));
				return true;
			},
			before: 'HTMLBlock'
		}
	]
};
