import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from '$lib/schema/schema';
import { markIsActive, activeMarkColor } from '$lib/editor/comp/toolbar/markState';

// regression: markIsActive used to return rangeHasMark's boolean for range selections and the
// toolbar read .attrs.color off it. selecting highlighted text (or applying a highlight to a
// selection) threw in the toolbar $effect on every transaction and froze the whole UI.
describe('toolbar mark state', () => {
	const doc = schema.nodes.doc.create(null, [
		schema.nodes.paragraph.create(null, [
			schema.text('plain '),
			schema.text('marked', [schema.marks.highlight.create({ color: 'cyan' }), schema.marks.textcolor.create({ color: 'red' })]),
			schema.text(' tail')
		])
	]);
	const select = (from: number, to?: number) =>
		EditorState.create({ schema, doc, selection: TextSelection.create(doc, from, to) });

	it('range selection over marked text reports the color without throwing', () => {
		const state = select(2, 12); // spans plain + marked text
		expect(activeMarkColor(state, schema.marks.highlight)).toBe('cyan');
		expect(activeMarkColor(state, schema.marks.textcolor)).toBe('red');
		expect(markIsActive(state, schema.marks.highlight)).toBe(true);
	});

	it('range selection over plain text reports nothing', () => {
		const state = select(1, 6);
		expect(activeMarkColor(state, schema.marks.highlight)).toBeNull();
		expect(markIsActive(state, schema.marks.highlight)).toBe(false);
	});

	it('cursor inside marked text reports the color', () => {
		const state = select(9);
		expect(activeMarkColor(state, schema.marks.highlight)).toBe('cyan');
		expect(markIsActive(state, schema.marks.textcolor)).toBe(true);
	});

	it('cursor in plain text with stored marks reports the stored color', () => {
		const base = select(3);
		const state = base.apply(base.tr.addStoredMark(schema.marks.highlight.create({ color: 'yellow' })));
		expect(activeMarkColor(state, schema.marks.highlight)).toBe('yellow');
		expect(markIsActive(state, schema.marks.highlight)).toBe(true);
	});
});
