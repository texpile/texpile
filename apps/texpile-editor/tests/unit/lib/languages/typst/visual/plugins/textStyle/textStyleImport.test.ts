import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { typstTextStyle } from '$lib/languages/typst/visual/extensions/css/typstTextStyle';

const SRC = '#text(1.5em, weight: "bold")[Title *here*]\n\nPlain #text(size: 9pt, fill: luma(120), lang: "de")[small] words.\n';

describe('styled text', () => {
	it('is a run of text under a mark that keeps its arguments, and saves untouched byte for byte', () => {
		const parsed = parseTypstFile(SRC);
		const first = parsed.doc.child(0).firstChild!;
		expect(first.text).toBe('Title ');
		expect(first.marks.map((mark) => [mark.type.name, mark.attrs.args])).toEqual([['typ_text', '1.5em, weight: "bold"']]);
		expect(typstTextStyle('1.5em, weight: "bold"')).toBe('font-size: 1.5em; font-weight: 700');
		expect(typstTextStyle('size: 9pt, fill: luma(120), lang: "de"')).toBe('font-size: 9pt; color: rgb(120, 120, 120)');
		expect(serializeTypstFile(parsed, parsed.doc)).toBe(SRC);
	});

	it('writes an edited run inside the same call, its arguments as they were', () => {
		const parsed = parseTypstFile(SRC);
		let at = -1;
		parsed.doc.descendants((node, pos) => {
			if (at < 0 && node.isText && node.text === 'small') at = pos + 5;
		});
		const state = EditorState.create({ doc: parsed.doc });
		const edited = state.apply(state.tr.insertText('er', at)).doc;
		expect(serializeTypstFile(parsed, edited)).toBe(SRC.replace('[small]', '[smaller]'));
	});
});
