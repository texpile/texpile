import { it, expect } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { wordBeingTypedPlugin } from '$lib/editor/canvas/layout/linebreak/wordBeingTyped';
import { ViewLineBreaking } from '$lib/editor/canvas/layout/linebreak/viewBreaking';
import { layoutTestBlock, lineTexts } from '../layoutFixture';

const TEXT = 'one two three four five six seven eight nine ten eleven twelve thirteen';

it('keeps the lines above an edit while the caret stays and breaks the paragraph whole once it leaves', () => {
	const paragraphs = [schema.nodes.paragraph.create(null, schema.text(TEXT)), schema.nodes.paragraph.create(null, schema.text('after'))];
	let state = EditorState.create({ doc: schema.nodes.doc.create(null, paragraphs), plugins: [wordBeingTypedPlugin()] });
	state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1 + TEXT.length)));
	const breaking = new ViewLineBreaking(() => 'none');
	const layout = (): string[] => lineTexts(layoutTestBlock(state.doc.child(0), { width: 150, breaking }));
	layout();
	let before = state;
	state = state.apply(state.tr.insertText('q'));
	expect(breaking.update(before, state)).toEqual([]);
	expect(layout()).toEqual(['one two three ', 'four five six ', 'seven eight ', 'nine ten eleven ', 'twelve ', 'thirteenq']);
	before = state;
	state = state.apply(state.tr.setSelection(TextSelection.atEnd(state.doc)));
	expect(breaking.update(before, state)).toEqual([state.doc.child(0)]);
	expect(layout()).toEqual(['one two three ', 'four five ', 'six seven ', 'eight nine ten ', 'eleven twelve ', 'thirteenq']);
});

it('breaks a paragraph whole when the selected formula in it changes', () => {
	const formula = (text: string) => schema.nodes.inline_math.create(null, schema.text(text));
	const at = 1 + TEXT.length + 1;
	let state = EditorState.create({
		doc: schema.nodes.doc.create(null, [
			schema.nodes.paragraph.create(null, [schema.text(TEXT + ' '), formula('xyzxyzxyzxyzxyz'), schema.text(' end')])
		]),
		plugins: [wordBeingTypedPlugin()]
	});
	state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, at)));
	const breaking = new ViewLineBreaking(() => 'none');
	layoutTestBlock(state.doc.child(0), { width: 150, breaking });
	const before = state;
	const tr = state.tr.replaceWith(at, at + state.doc.nodeAt(at)!.nodeSize, formula('x'));
	state = state.apply(tr.setSelection(NodeSelection.create(tr.doc, at)));
	breaking.update(before, state);
	expect(breaking.kept.holds(state.doc.child(0))).toBe(false);
});
