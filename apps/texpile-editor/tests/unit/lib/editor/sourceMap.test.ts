// caret positions through the source map: exact on prose, the run beside markup, the block when
// a document has no runs
import { describe, it, expect } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { blockAtPm, blockAtSource, caretAtOffset, offsetAtPm, pmAtOffset } from '$lib/editor/visual/sourceMap';
import type { SourceMap } from '$lib/editor/visual/sourceSpans';

const SRC = [
	'\\documentclass{article}',
	'\\begin{document}',
	'Alpha opening words with a \\textbf{bold} claim and more prose to anchor on.',
	'',
	'\\section{Methods setup}',
	'',
	'Second paragraph where zebra quantum banana appears exactly once, then zebra again.',
	'',
	'\\end{document}'
].join('\n');

function posOf(doc: PMNode, needle: string): number {
	let found = -1;
	doc.descendants((n, pos) => {
		if (found >= 0) return false;
		if (n.isText) {
			const i = n.text!.indexOf(needle);
			if (i >= 0) found = pos + i;
		}
		return found < 0;
	});
	if (found < 0) throw new Error(`no text ${needle}`);
	return found;
}

describe('caret positions through the source map', () => {
	const { doc, map } = parseLatexFile(SRC);

	it('lands on the exact character both ways', () => {
		const pm = posOf(doc, 'zebra quantum');
		const off = SRC.indexOf('zebra quantum');
		expect(offsetAtPm(map, pm + 6)).toBe(off + 6);
		expect(pmAtOffset(map, off + 6)).toBe(pm + 6);
		const bold = posOf(doc, 'bold');
		expect(offsetAtPm(map, bold + 2)).toBe(SRC.indexOf('bold') + 2);
	});

	it('puts a caret that sits in markup on the run beside it, inside the same block', () => {
		const inCommand = SRC.indexOf('\\section{') + 4;
		expect(pmAtOffset(map, inCommand, 1)).toBe(posOf(doc, 'Methods'));
		expect(pmAtOffset(map, inCommand, -1)).toBe(posOf(doc, 'Methods'));
		const closing = SRC.indexOf('{bold}') + 5;
		expect(pmAtOffset(map, closing, 1)).toBe(posOf(doc, 'bold') + 4);
	});

	it('names the block a position is in', () => {
		expect(blockAtPm(map, posOf(doc, 'Methods'))!.srcFrom).toBe(SRC.indexOf('\\section'));
		expect(blockAtSource(map, SRC.indexOf('Methods'))!.pmFrom).toBe(posOf(doc, 'Methods') - 1);
		expect(blockAtSource(map, SRC.indexOf('\\documentclass'))).toBeNull();
	});

	it('falls back to the block when a document has no runs', () => {
		const blocksOnly: SourceMap = { leaves: [], blocks: map.blocks };
		const block = blockAtPm(map, posOf(doc, 'zebra'))!;
		expect(offsetAtPm(blocksOnly, posOf(doc, 'zebra'))).toBe(block.srcFrom);
		expect(pmAtOffset(blocksOnly, SRC.indexOf('zebra'))).toBe(block.pmFrom + 1);
	});

	it('keeps a caret after a trailing space with its paragraph, not the heading below', () => {
		const typed = SRC.replace('anchor on.', 'anchor on. ');
		const parsed = parseLatexFile(typed);
		const end = posOf(parsed.doc, 'anchor on.') + 'anchor on.'.length;
		expect(caretAtOffset(parsed.map, typed, typed.indexOf('anchor on. ') + 11)).toBe(end);
	});

	it('has no answer for a document with no map', () => {
		expect(offsetAtPm({ leaves: [], blocks: [] }, 3)).toBeNull();
		expect(pmAtOffset({ leaves: [], blocks: [] }, 3)).toBeNull();
	});
});
