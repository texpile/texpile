// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { caretWherePressed, forgetPress, recordPress } from '$lib/editor/visual/extensions/mathlivebridge/caret/mathPressBeside';

// "Last word $y$": the math at 11..14, the paragraph's end at 14
const doc = schema.node('doc', null, [
	schema.node('paragraph', null, [schema.text('Last word '), schema.node('inline_math', null, [schema.text('y')])])
]);
const viewPressedAt = (pos: number) => {
	const view = { posAtCoords: () => ({ pos, inside: -1 }) } as unknown as EditorView;
	const target = document.createElement('p');
	const event = new MouseEvent('mousedown', { button: 0, detail: 1 });
	Object.defineProperty(event, 'target', { value: target });
	recordPress(view, event);
	return view;
};

describe('a press beside inline math', () => {
	it('puts the caret after the math when the browser read it before', () => {
		const view = viewPressedAt(14);
		expect(caretWherePressed(view, doc.resolve(11), doc.resolve(11))?.head).toBe(14);
		// Chrome's caret in the field's host reads as the math's own text
		expect(caretWherePressed(view, doc.resolve(12), doc.resolve(12))?.head).toBe(14);
	});

	it('leaves a caret the press does not contradict', () => {
		const view = viewPressedAt(14);
		expect(caretWherePressed(view, doc.resolve(5), doc.resolve(5))).toBeNull();
		expect(caretWherePressed(view, doc.resolve(14), doc.resolve(14))).toBeNull();
	});

	it('is forgotten once a key is pressed', () => {
		const view = viewPressedAt(14);
		forgetPress(view);
		expect(caretWherePressed(view, doc.resolve(11), doc.resolve(11))).toBeNull();
	});
});
