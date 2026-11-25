import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import type { DecorationSet } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { listNumbersPlugin, plainItemLabels } from '$lib/editor/visual/extensions/listNumbers/listNumbers';

function labelsIn(state: EditorState, plugin: ReturnType<typeof listNumbersPlugin>): string[] {
	const set = plugin.getState(state) as DecorationSet;
	return set
		.find()
		.map((decoration) => (decoration as unknown as { type: { attrs: Record<string, string> } }).type.attrs['data-item-label']);
}

describe('list item labels', () => {
	it('follow a key typed in an item without counting the document again', () => {
		const item = (text: string) => schema.nodes.list.create({ kind: 'ordered' }, schema.nodes.paragraph.create(null, schema.text(text)));
		const doc = schema.nodes.doc.create(null, [item('one'), item('two'), item('three')]);
		let counted = 0;
		const plugin = listNumbersPlugin((counting: PMNode) => (counted++, plainItemLabels(counting)));
		let state = EditorState.create({ doc, plugins: [plugin] });
		counted = 0;
		state = state.apply(state.tr.insertText('x', 4));
		expect(counted).toBe(0);
		expect(labelsIn(state, plugin)).toEqual(['1.', '2.', '3.']);
		state = state.apply(state.tr.delete(0, doc.child(0).nodeSize));
		expect(counted).toBe(1);
		expect(labelsIn(state, plugin)).toEqual(['1.', '2.']);
	});
});
