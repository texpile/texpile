// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { ClickCounter } from '$lib/editor/canvas/interaction/pointer/clickCounter';
import { pointAt } from '../../geometry/geometryFixture';
import { paragraph, pointerOn } from './pointerFixture';

const two = schema.nodes.doc.create(null, [
	paragraph.create(null, schema.text('alpha beta gamma')),
	paragraph.create(null, schema.text('delta epsilon'))
]);
const second = 1 + 'alpha beta gamma'.length + 2;

describe('click counting and rules', () => {
	it('counts presses under 500 ms and 10 px on one button', () => {
		const counter = new ClickCounter(false);
		const press = (x: number, init: MouseEventInit = {}) => new MouseEvent('mousedown', { clientX: x, ...init });
		expect([counter.next(press(0), 0), counter.next(press(7), 300), counter.next(press(7), 500), counter.next(press(7), 600)]).toEqual([
			'single',
			'double',
			'triple',
			'single'
		]);
		expect([counter.next(press(0), 2000), counter.next(press(30), 2100), counter.next(press(30, { button: 2 }), 2200)]).toEqual([
			'single',
			'single',
			'single'
		]);
	});

	it('a double click selects the word without the space after it, and Shift-click extends from the anchor', () => {
		const pointer = pointerOn(two, (d) => TextSelection.create(d, 1));
		const at = pointAt(pointer.geometry, 8, 1);
		const click = (init: MouseEventInit = {}) => pointer.click(at, init);
		const doubled = pointer.doubleClick(at);
		expect([doubled.from, doubled.to]).toEqual([7, 11]);
		const extended = click({ shiftKey: true });
		expect(extended.anchor).toBe(7);
		const far = pointer.click(pointAt(pointer.geometry, 14, 1), { shiftKey: true });
		expect([far.anchor, far.head]).toEqual([7, 14]);
	});

	it('a triple click selects the paragraph and dragging on extends by whole paragraphs', () => {
		const pointer = pointerOn(two, (d) => TextSelection.create(d, 1));
		const first = pointAt(pointer.geometry, 5, 1);
		const triple = pointer.tripleClick(first, pointAt(pointer.geometry, second + 3, 1));
		expect([triple.anchor, triple.head]).toEqual([1, 1 + 'alpha beta gamma'.length + 2 + 'delta epsilon'.length]);
	});

	it('a middle press moves no caret and the right button inside a range keeps it', () => {
		const pointer = pointerOn(two, (d) => TextSelection.create(d, 3, 9));
		expect(pointer.click(pointAt(pointer.geometry, 5, 1), { button: 2 }).toJSON()).toEqual({ type: 'text', anchor: 3, head: 9 });
		expect(pointer.click(pointAt(pointer.geometry, 14, 1), { button: 1 }).toJSON()).toEqual({ type: 'text', anchor: 3, head: 9 });
	});
});
