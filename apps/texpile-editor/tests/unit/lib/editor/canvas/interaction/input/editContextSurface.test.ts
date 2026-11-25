// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { InputSink, TextMirror } from '$lib/editor/canvas/contracts/inputTypes';
import { createEditContextSurface } from '$lib/editor/canvas/interaction/input/editContextSurface';

class FakeEditContext extends EventTarget {
	text = '';
	selectionStart = 0;
	selectionEnd = 0;
	updateText(start: number, end: number, text: string): void {
		this.text = this.text.slice(0, start) + text + this.text.slice(end);
	}
	updateSelection(start: number, end: number): void {
		this.selectionStart = start;
		this.selectionEnd = end;
	}
	updateControlBounds(): void {}
	updateSelectionBounds(): void {}
	updateCharacterBounds(): void {}
}

function mirrorOf(text: string, caret: number): TextMirror {
	return { text, start: 1, selection: { start: caret, end: caret }, toDoc: (offset) => offset + 1, fromDoc: (pos) => pos - 1 };
}

afterEach(() => {
	delete (window as unknown as { EditContext?: unknown }).EditContext;
});

describe('the EditContext surface', () => {
	it('takes the caret a handled key left before the frame after it, so the next letter lands there', () => {
		(window as unknown as { EditContext: unknown }).EditContext = FakeEditContext;
		let mirror = mirrorOf('first line', 10);
		const sink = {
			keydown: () => {
				mirror = mirrorOf('', 0);
				return true;
			},
			mirror: () => mirror
		} as unknown as InputSink;
		const root = document.body.appendChild(document.createElement('div'));
		const surface = createEditContextSurface(root, sink);
		surface.sync(mirror, null, new DOMRect());
		const context = (root as unknown as { editContext: FakeEditContext }).editContext;
		expect(context.selectionStart).toBe(10);
		root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		expect(context.text).toBe('');
		expect(context.selectionStart).toBe(0);
		surface.destroy();
	});
});
