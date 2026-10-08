// An editor dragged out of the window opens under the pointer that let it go, and never off the screen
import { describe, expect, it } from 'vitest';
import { editorWindowBounds } from '../../../../../src/views/workspace/groups/window/editorWindowBounds';

const screen = { availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1080 };

describe('editorWindowBounds', () => {
	it('puts the window under the pointer, kept on the screen', () => {
		expect(editorWindowBounds({ x: 600, y: 100 }, screen)).toEqual({ left: 480, top: 80, width: 760, height: 900 });
		expect(editorWindowBounds({ x: 1900, y: 1070 }, screen)).toEqual({ left: 1160, top: 180, width: 760, height: 900 });
	});

	it('fits a screen smaller than the window', () => {
		expect(editorWindowBounds({ x: 10, y: 10 }, { availWidth: 700, availHeight: 600 })).toEqual({
			left: 0,
			top: 0,
			width: 700,
			height: 600
		});
	});
});
