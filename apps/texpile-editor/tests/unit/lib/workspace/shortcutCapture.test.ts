// @vitest-environment jsdom
// Ctrl+Shift+G reaches Source Control before an editor can take it as find-previous. Ctrl on every
// platform, as in VS Code: Cmd+Shift+G stays find-previous on a Mac.
import { it, expect, vi } from 'vitest';
import { createCaptureKeydownHandler } from '$lib/workspace/shortcuts';

function press(init: KeyboardEventInit) {
	const openSourceControl = vi.fn();
	const e = new KeyboardEvent('keydown', { cancelable: true, ...init });
	createCaptureKeydownHandler({ openSourceControl })(e);
	return { opened: openSourceControl.mock.calls.length > 0, prevented: e.defaultPrevented };
}

it('opens Source Control on Ctrl+Shift+G, and keeps the key from the editor', () => {
	expect(press({ key: 'G', ctrlKey: true, shiftKey: true })).toEqual({ opened: true, prevented: true });
});

it('leaves Cmd+Shift+G, Ctrl+G and Ctrl+Alt+Shift+G alone', () => {
	expect(press({ key: 'G', metaKey: true, shiftKey: true }).opened).toBe(false);
	expect(press({ key: 'g', ctrlKey: true }).opened).toBe(false);
	expect(press({ key: 'G', ctrlKey: true, altKey: true, shiftKey: true }).opened).toBe(false);
});
