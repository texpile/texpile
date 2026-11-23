import { expect, it } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { BlockLayout } from '$lib/editor/canvas';
import { ViewLineBreaking } from '$lib/editor/canvas/layout/linebreak/viewBreaking';
import { wordBeingTypedPlugin } from '$lib/editor/canvas/layout/linebreak/wordBeingTyped';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { fixedStyles } from '../../../testing/fixedStyles';
import { monoMeasure } from '../../../testing/monoMeasure';
import { tableRules } from '../../../testing/tableTestRules';
import { layoutTestBlock, testBlockElements, type KeptElement } from '../../layoutFixture';
import { shapeOf } from '../../warmBlock';

const { doc, environment, table, table_row, table_cell, paragraph } = schema.nodes;
const PROSE = 'the quick brown fox jumps over the lazy dog and then keeps running through the long field until night falls ';

function para(text: string): PMNode {
	return paragraph.create(null, schema.text(text));
}

/** typing in the first paragraph and then leaving it, laid out the way the view does: the last layout is passed on and the paragraphs to break again are carried */
function leave(block: PMNode, away: (state: EditorState) => number) {
	const breaking = new ViewLineBreaking(() => 'none');
	const styles = fixedStyles(tableRules());
	const kept = new Map<PMNode, KeptElement>();
	let previous: BlockLayout | null = null;
	let calls = 0;
	const lay = (top: PMNode): BlockLayout => {
		calls = 0;
		const measure = (font: string, text: string) => (calls++, monoMeasure(font, text));
		return (previous = layoutTestBlock(top, { styles, breaking, elements: testBlockElements(top, kept), previous, measure, width: 300 }));
	};
	let state = EditorState.create({ doc: doc.create(null, block), plugins: [wordBeingTypedPlugin()] });
	state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 12)));
	lay(state.doc.child(0));
	for (const key of 'typed') {
		const before = state;
		state = state.apply(state.tr.insertText(key));
		breaking.update(before, state);
		lay(state.doc.child(0));
	}
	const before = state;
	state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, away(state))));
	expect(breaking.update(before, state).length).toBeGreaterThan(0);
	const warm = lay(state.doc.child(0));
	const cold = layoutTestBlock(state.doc.child(0), { rules: tableRules(), width: 300 });
	return { warm, cold, calls };
}

it('breaks the paragraph the caret left again in a warm block, as a cold layout does', () => {
	const inEnvironment = leave(
		environment.create(null, [para(PROSE.repeat(2)), para(PROSE)]),
		(state) => state.doc.child(0).child(0).nodeSize + 4
	);
	expect(shapeOf(inEnvironment.warm.box)).toEqual(shapeOf(inEnvironment.cold.box));
	expect(inEnvironment.calls).toBeGreaterThan(0);
	const cell = (text: string) => table_cell.create(null, para(text));
	const inTable = leave(
		table.create(null, [table_row.create(null, [cell(PROSE.repeat(2))]), table_row.create(null, [cell(PROSE)])]),
		(state) => state.doc.child(0).child(0).nodeSize + 6
	);
	expect(shapeOf(inTable.warm.box)).toEqual(shapeOf(inTable.cold.box));
});
