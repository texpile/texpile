// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { CanvasHit } from '$lib/editor/canvas';
import { FaceElement } from '$lib/editor/canvas';
import { hoverStateOf } from '$lib/editor/canvas/interaction/hover/hoverTargets';
import { PointerHover } from '$lib/editor/canvas/interaction/hover/pointerHover';
import { hoverHint, shownTip } from '$lib/components/tooltip.svelte';

const { doc, paragraph, label } = schema.nodes;
const document = doc.create(null, [
	paragraph.create(null, [schema.text('tail '), label.create()]),
	paragraph.create(null, schema.text('next'))
]);

function hitOn(inside: number, chain: FaceElement[] = []): CanvasHit {
	return {
		inside,
		pos: inside,
		caret: { pos: inside, affinity: 1 },
		target: { kind: 'text', textblock: 0 },
		chain,
		cursor: 'text',
		hint: null
	} as unknown as CanvasHit;
}

describe('hover', () => {
	it('names the top-level block under the pointer and nothing when the pointer is off the paper', () => {
		expect(hoverStateOf(hitOn(3), document).blockFor).toBe(0);
		expect(hoverStateOf(hitOn(document.child(0).nodeSize + 2), document).blockFor).toBe(document.child(0).nodeSize);
		expect(hoverStateOf(null, document)).toEqual({ chain: [], pos: null, part: null, blockFor: null, tableFor: null });
	});

	it('sets the cursor and carries the hover state to the innermost element once per frame', () => {
		vi.useFakeTimers();
		const dom = window.document.createElement('div');
		const inner = new FaceElement('span', null, false);
		inner.hint = 'A label';
		const states: string[] = [];
		const hints: unknown[] = [];
		let current = hitOn(3, [inner]);
		const hover = {
			chain: [] as FaceElement[],
			pos: null as number | null,
			part: null,
			blockFor: null,
			tableFor: null,
			update(next: object) {
				Object.assign(hover, next);
			}
		};
		const pointer = new PointerHover({
			dom,
			hover: hover as never,
			doc: () => document,
			hit: () => current,
			setElementHover: (element, on) => states.push(`${element.tagName}:${on}`),
			showHint: (hint) => hints.push(hint && hint.text),
			hintRect: () => new DOMRect(1, 2, 3, 4)
		});
		const frame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => (callback(0), 0));
		pointer.move(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }));
		expect([dom.style.cursor, states, hints]).toEqual(['text', ['SPAN:true'], ['A label']]);
		current = hitOn(8, []);
		pointer.move(new MouseEvent('mousemove', { clientX: 6, clientY: 5 }));
		expect([states, hints]).toEqual([
			['SPAN:true', 'SPAN:false'],
			['A label', null]
		]);
		frame.mockRestore();
		vi.useRealTimers();
	});
});

describe('hoverHint', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		hoverHint(null);
		vi.useRealTimers();
	});

	it('shows after the tooltip delay, not before, and closes with the pointer', () => {
		const hint = { text: 'Cite', rect: new DOMRect(0, 0, 10, 10), win: window };
		hoverHint(hint);
		vi.advanceTimersByTime(300);
		expect(shownTip.current).toBeNull();
		vi.advanceTimersByTime(150);
		expect(shownTip.current?.text).toBe('Cite');
		hoverHint(null);
		expect(shownTip.current).toBeNull();
	});
});
