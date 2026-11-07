import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Fragment, Slice } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { regenerateCopiedLabels } from '$lib/editor/visual/extensions/paste-uuid-fix';

const equation = () => schema.nodes.block_math.create({ label: 'eq:a' }, schema.text('x'));

function labelAfterPaste(replaceAll: boolean): string {
	const doc = schema.topNodeType.create(null, [schema.nodes.paragraph.create(null, schema.text('a')), equation()]);
	let state = EditorState.create({ doc });
	if (replaceAll) state = state.apply(state.tr.setSelection(TextSelection.create(doc, 0, doc.content.size)));
	const slice = new Slice(Fragment.from(equation()), 0, 0);
	return regenerateCopiedLabels(slice, { state } as EditorView).content.firstChild!.attrs.label;
}

describe('the label of a pasted equation', () => {
	it('is renamed while the original stays in the document', () => {
		expect(labelAfterPaste(false)).toMatch(/^eq:a-copy-/);
	});

	it('stays when the paste replaces the original', () => {
		expect(labelAfterPaste(true)).toBe('eq:a');
	});
});

describe('the key of a pasted inline label', () => {
	it('is renamed while the document keeps the original outside the paste', () => {
		const para = () => schema.nodes.paragraph.create(null, [schema.text('a'), schema.nodes.label.create({ name: 'thm:a' })]);
		const doc = schema.topNodeType.create(null, [para()]);
		const state = EditorState.create({ doc });
		const slice = new Slice(Fragment.from(para()), 0, 0);
		const pasted = regenerateCopiedLabels(slice, { state } as EditorView).content.firstChild!.lastChild!;
		expect(pasted.attrs.name).toMatch(/^thm:a-copy-/);
	});
});
