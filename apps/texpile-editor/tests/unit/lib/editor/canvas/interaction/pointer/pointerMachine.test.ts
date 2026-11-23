// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { TextSelection, type Transaction } from 'prosemirror-state';
import { POINTER_DRAG_META } from '$lib/editor/canvas/interaction/pointer/autoscroll';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { pressPreventsDefault } from '$lib/editor/canvas/view/pressRouting';
import { pointAt } from '../../geometry/geometryFixture';
import { blockquote, caretAt, labelPos, paragraph, pointerOn, words } from './pointerFixture';

describe('PointerMachine', () => {
	it('a click a pixel beside an inline atom puts the caret on that side, a click on it selects it', () => {
		const doc = schema.nodes.doc.create(null, [words]);
		const pointer = pointerOn(doc, caretAt(1));
		const atom = pointer.geometry.nodeRect(labelPos)!.rect;
		const y = atom.y + atom.height / 2;
		expect(pointer.click({ x: atom.x - 1, y }).head).toBe(labelPos);
		expect(pointer.click({ x: atom.x + atom.width + 1, y }).head).toBe(labelPos + 1);
		const selected = pointer.click({ x: atom.x + 15, y });
		expect([selected.from, selected.to, selected.toJSON().type]).toEqual([labelPos, labelPos + 1, 'node']);
	});

	it('Ctrl-click selects the enclosing paragraph, and on the same spot again its parent', () => {
		const quoted = blockquote.create(null, paragraph.create(null, schema.text('inner words')));
		const doc = schema.nodes.doc.create(null, [quoted]);
		const pointer = pointerOn(doc, caretAt(3));
		const at = pointAt(pointer.geometry, 5);
		expect(pointer.click(at, { ctrlKey: true }).toJSON()).toEqual({ type: 'node', anchor: 1 });
		expect(pointer.click(at, { ctrlKey: true }).toJSON()).toEqual({ type: 'node', anchor: 0 });
	});

	it('the right button inside a text selection keeps it, outside it moves the caret', () => {
		const doc = schema.nodes.doc.create(null, [words]);
		const pointer = pointerOn(doc, (d) => TextSelection.create(d, 1, 4));
		expect(pointer.click(pointAt(pointer.geometry, 2, 1), { button: 2 }).toJSON()).toEqual({ type: 'text', anchor: 1, head: 4 });
		const end = labelPos + 3;
		expect(pointer.click(pointAt(pointer.geometry, end, 1), { button: 2 }).toJSON()).toEqual({ type: 'text', anchor: end, head: end });
	});

	it('a middle press moves no caret and leaves its default to the browser', () => {
		const doc = schema.nodes.doc.create(null, [words]);
		const pointer = pointerOn(doc, caretAt(1));
		const at = pointAt(pointer.geometry, 8);
		const before = pointer.view.state.selection.from;
		expect(pointer.click(at, { button: 1 }).from).toBe(before);
		expect(pressPreventsDefault(new MouseEvent('mousedown', { button: 1 }), true)).toBe(false);
		expect(pressPreventsDefault(new MouseEvent('mousedown', { button: 0 }), true)).toBe(true);
	});
});

describe('PointerMachine drag', () => {
	it('tags the selection a drag extends with the no-reveal meta and not the click that began it', () => {
		const doc = schema.nodes.doc.create(null, [
			paragraph.create(null, schema.text('first words')),
			paragraph.create(null, schema.text('second words'))
		]);
		const pointer = pointerOn(doc, caretAt(1));
		const metas: (boolean | undefined)[] = [];
		const dispatch = pointer.view.dispatch.bind(pointer.view);
		Object.assign(pointer.view, {
			dispatch(tr: Transaction) {
				if (tr.selectionSet) metas.push(tr.getMeta(POINTER_DRAG_META));
				dispatch(tr);
			}
		});
		pointer.tripleClick(pointAt(pointer.geometry, 3, 1), pointAt(pointer.geometry, 20, 1));
		expect(metas.length).toBeGreaterThan(1);
		expect(metas[0]).toBeUndefined();
		expect(metas.at(-1)).toBe(true);
	});
});
