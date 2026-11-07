// display math written as a call is the equation node, its arguments kept as written
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';

const call = '#math.equation(\n  block: true,\n  numbering: "(1)",\n  supplement: "Equation",\n  $\n    x^2 + y^2\n  $,\n) <pythagoras>\n';

function saved(src: string, edit?: (state: EditorState) => EditorState): string {
	const parsed = parseTypstFile(src);
	const state = EditorState.create({ doc: parsed.doc });
	return serializeTypstFile(parsed, (edit ? edit(state) : state).doc);
}

describe('an equation written as a call', () => {
	it('is the equation with its label and saves as the file had it', () => {
		const doc = parseTypstFile(call).doc;
		expect(doc.child(0).type.name).toBe('block_math');
		expect(doc.child(0).attrs).toMatchObject({ label: 'pythagoras' });
		expect(doc.child(0).textContent).toBe('x^2 + y^2');
		expect(saved(call)).toBe(call);
	});

	it('keeps its arguments when its formula is edited', () => {
		const out = saved(call, (state) => state.apply(state.tr.insertText(' + z^2', 1 + 'x^2 + y^2'.length)));
		expect(out).toBe(
			'#math.equation(\n  block: true,\n  numbering: "(1)",\n  supplement: "Equation",\n  $ x^2 + y^2 + z^2 $,\n) <pythagoras>\n'
		);
	});
});
