import { describe, expect, it } from 'vitest';
import { EditorState, type ChangeSpec } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import {
	buildWrapIndents,
	MARKDOWN_LIST_MARKER,
	TYPST_LIST_MARKER,
	updateWrapIndents,
	wrapColumns
} from '$lib/editor/source/extensions/wrap-indent/wrapIndent';

function listed(indents: DecorationSet): [number, string][] {
	const out: [number, string][] = [];
	for (let it = indents.iter(); it.value; it.next()) out.push([it.from, it.value.spec.attributes.style]);
	return out;
}

describe('wrapped row indent', () => {
	it('starts under the text, past a list marker where the language has one', () => {
		expect(wrapColumns('    \\begin{itemize}', 4, null)).toBe(4);
		expect(wrapColumns('\t\\item first', 4, null)).toBe(4);
		expect(wrapColumns('  - nested item', 4, TYPST_LIST_MARKER)).toBe(4);
		expect(wrapColumns('12. twelfth', 4, TYPST_LIST_MARKER)).toBe(4);
		expect(wrapColumns('/ Term: description', 4, TYPST_LIST_MARKER)).toBe(2);
		expect(wrapColumns('- [x] done', 4, MARKDOWN_LIST_MARKER)).toBe(6);
		expect(wrapColumns('-not a list', 4, TYPST_LIST_MARKER)).toBe(0);
	});

	it('after edits, matches the document read from scratch', () => {
		let state = EditorState.create({ doc: 'intro\n  - one\n    - two\n\tthree\n+ four\n' });
		let indents = buildWrapIndents(state.doc, state.tabSize, TYPST_LIST_MARKER, 40);
		const edits: ChangeSpec[][] = [
			[{ from: 0, insert: '  ' }],
			[{ from: 8, to: 9 }],
			[{ from: 14, insert: '\n      - inserted' }],
			[
				{ from: 2, insert: '- ' },
				{ from: 20, to: 26, insert: 'x\n  y' }
			],
			[{ from: 0, to: 12 }]
		];
		for (const changes of edits) {
			const tr = state.update({ changes });
			indents = updateWrapIndents(indents, tr.changes, state.doc, tr.state.doc, state.tabSize, TYPST_LIST_MARKER, 40);
			state = tr.state;
			expect(listed(indents)).toEqual(listed(buildWrapIndents(state.doc, state.tabSize, TYPST_LIST_MARKER, 40)));
		}
	});
});
