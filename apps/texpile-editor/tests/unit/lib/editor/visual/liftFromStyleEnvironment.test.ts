import { afterEach, describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { styleEnvironment } from '$lib/editor/visual/insert/insertItems.svelte';
import { liftFromStyleEnvironment } from '$lib/editor/visual/liftFromStyleEnvironment';

const p = (words: string) => schema.nodes.paragraph.create(null, schema.text(words));
const env = (name: string, ...children: ReturnType<typeof p>[]) => schema.nodes.environment.create({ name }, children);

function backspaceAtStartOf(doc: ReturnType<typeof schema.nodes.doc.create>, pos: number) {
	let state = EditorState.create({ doc, selection: TextSelection.create(doc, pos) });
	const ran = liftFromStyleEnvironment(state, (tr) => (state = state.apply(tr)));
	return { ran, state };
}

describe('Backspace at the start of a paragraph style environment', () => {
	afterEach(() => (styleEnvironment.current = () => false));

	it('lifts the first paragraph out and leaves the rest in the environment', () => {
		styleEnvironment.current = (node) => node.attrs.name === 'theorem';
		const doc = schema.nodes.doc.create(null, [p('Above'), env('theorem', p('One'), p('Two'))]);
		const { ran, state } = backspaceAtStartOf(doc, p('Above').nodeSize + 2);
		expect(ran).toBe(true);
		expect(state.doc.child(1).textContent).toBe('One');
		expect(state.doc.child(1).type.name).toBe('paragraph');
		expect(state.doc.child(2).childCount).toBe(1);
	});

	it('unwraps a lone paragraph, and leaves any other environment to the usual Backspace', () => {
		styleEnvironment.current = (node) => node.attrs.name === 'theorem';
		const lone = backspaceAtStartOf(schema.nodes.doc.create(null, [p('Above'), env('theorem', p('One'))]), p('Above').nodeSize + 2);
		expect(lone.state.doc.childCount).toBe(2);
		expect(lone.state.doc.child(1).type.name).toBe('paragraph');
		const box = backspaceAtStartOf(schema.nodes.doc.create(null, [p('Above'), env('minipage', p('One'))]), p('Above').nodeSize + 2);
		expect(box.ran).toBe(false);
	});
});
