// @lezer/markdown's table refuses a delimiter row with spaces after its last pipe, which a hard break's trailing spaces give
import { tags as t } from '@lezer/highlight';
import type { BlockContext, Element, LeafBlock, LeafBlockParser, Line, MarkdownConfig } from '@lezer/markdown';

function parseRow(cx: BlockContext, line: string, startI = 0, elts?: Element[], offset = 0): number {
	let count = 0;
	let first = true;
	let cellStart = -1;
	let cellEnd = -1;
	let esc = false;
	function parseCell() {
		elts!.push(
			cx.elt('TableCell', offset + cellStart, offset + cellEnd, cx.parser.parseInline(line.slice(cellStart, cellEnd), offset + cellStart))
		);
	}
	for (let i = startI; i < line.length; i++) {
		const next = line.charCodeAt(i);
		if (next === 124 && !esc) {
			if (!first || cellStart > -1) count++;
			first = false;
			if (elts) {
				if (cellStart > -1) parseCell();
				elts.push(cx.elt('TableDelimiter', i + offset, i + offset + 1));
			}
			cellStart = cellEnd = -1;
		} else if (esc || (next !== 32 && next !== 9)) {
			if (cellStart < 0) cellStart = i;
			cellEnd = i + 1;
		}
		esc = !esc && next === 92;
	}
	if (cellStart > -1) {
		count++;
		if (elts) parseCell();
	}
	return count;
}

function hasPipe(str: string, start: number): boolean {
	for (let i = start; i < str.length; i++) {
		const next = str.charCodeAt(i);
		if (next === 124) return true;
		if (next === 92) i++;
	}
	return false;
}

const DELIMITER_LINE = /^[>\s]*\|?(\s*:?-+:?\s*\|)+(\s*:?-+:?\s*)?\s*$/;

class TableParser implements LeafBlockParser {
	rows: false | null | Element[] = null;

	nextLine(cx: BlockContext, line: Line, leaf: LeafBlock): boolean {
		if (this.rows == null) {
			this.rows = false;
			let lineText;
			if ((line.next === 45 || line.next === 58 || line.next === 124) && DELIMITER_LINE.test((lineText = line.text.slice(line.pos)))) {
				const firstRow: Element[] = [];
				const firstCount = parseRow(cx, leaf.content, 0, firstRow, leaf.start);
				if (firstCount === parseRow(cx, lineText, 0))
					this.rows = [
						cx.elt('TableHeader', leaf.start, leaf.start + leaf.content.length, firstRow),
						cx.elt('TableDelimiter', cx.lineStart + line.pos, cx.lineStart + line.text.length)
					];
			}
		} else if (this.rows) {
			const content: Element[] = [];
			parseRow(cx, line.text, line.pos, content, cx.lineStart);
			this.rows.push(cx.elt('TableRow', cx.lineStart + line.pos, cx.lineStart + line.text.length, content));
		}
		return false;
	}

	finish(cx: BlockContext, leaf: LeafBlock): boolean {
		if (!this.rows) return false;
		cx.addLeafElement(leaf, cx.elt('Table', leaf.start, leaf.start + leaf.content.length, this.rows as readonly Element[]));
		return true;
	}
}

export const tableSyntax: MarkdownConfig = {
	defineNodes: [
		{ name: 'Table', block: true },
		{ name: 'TableHeader', style: { 'TableHeader/...': t.heading } },
		'TableRow',
		{ name: 'TableCell', style: t.content },
		{ name: 'TableDelimiter', style: t.processingInstruction }
	],
	parseBlock: [
		{
			name: 'Table',
			leaf: (_, leaf) => (hasPipe(leaf.content, 0) ? new TableParser() : null),
			endLeaf(cx, line, leaf) {
				if (leaf.parsers.some((p) => p instanceof TableParser) || !hasPipe(line.text, line.basePos)) return false;
				const next = cx.peekLine();
				return DELIMITER_LINE.test(next) && parseRow(cx, line.text, line.basePos) === parseRow(cx, next, line.basePos);
			},
			before: 'SetextHeading'
		}
	]
};
