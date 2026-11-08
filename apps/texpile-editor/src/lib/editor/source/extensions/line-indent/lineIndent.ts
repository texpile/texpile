// Enter indents as VS Code does: the new line keeps the indent of the line above, one level more after an opening
// bracket at its end, one level less when the new line starts with a closing one
import { indentService, type IndentContext } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

export type LineIndentRules = {
	/** a comment at the end of a line, which does not hide a bracket before it */
	trailingComment: RegExp;
	/** a block opened without a bracket, such as LaTeX's \begin{name} */
	opensBlock?: RegExp;
	/** a line starting this way closes a level */
	closesLine: RegExp;
};

// an escaped bracket is text
const ENDS_ON_OPENER = /(?<!\\)(?:\\\\)*[([{]\s*$/;

export function opensLevel(text: string, rules: LineIndentRules): boolean {
	const code = text.replace(rules.trailingComment, '');
	return ENDS_ON_OPENER.test(code) || !!rules.opensBlock?.test(code);
}

/** the nearest line above `pos` that holds more than blanks */
function lineAbove(cx: IndentContext, pos: number): { text: string; from: number } | null {
	let line = cx.lineAt(pos, -1);
	if (line.from === pos) {
		if (pos === 0) return null;
		line = cx.lineAt(pos - 1, -1);
	}
	while (!line.text.trim()) {
		if (line.from === 0) return null;
		line = cx.lineAt(line.from - 1, -1);
	}
	return line;
}

export function indentColumn(cx: IndentContext, pos: number, rules: LineIndentRules): number {
	const above = lineAbove(cx, pos);
	if (!above) return 0;
	const base = cx.lineIndent(above.from, -1);
	const opens = opensLevel(above.text, rules);
	const closes = rules.closesLine.test(cx.textAfterPos(pos));
	if (opens && !closes) return base + cx.unit;
	if (closes && !opens) return Math.max(0, base - cx.unit);
	return base;
}

export function lineIndentation(rules: LineIndentRules): Extension {
	return indentService.of((cx, pos) => indentColumn(cx, pos, rules));
}
