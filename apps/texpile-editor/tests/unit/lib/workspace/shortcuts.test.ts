// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { PaletteActions } from '$lib/workspace/commandPalette.svelte';

const store = { path: '/w/gone.tex' as string | null };
vi.mock('$lib/workspace/workspaceStore', () => ({
	focusedTab: () => (store.path ? { path: store.path } : null),
	showTab: () => {}
}));

const { createKeydownHandler } = await import('$lib/workspace/shortcuts');
const { setPaletteActions } = await import('$lib/workspace/commandPalette.svelte');

const inert = {
	closeTab: () => {},
	reopenTab: () => {},
	isGuest: () => false,
	save: () => {},
	toggleGlobalSearch: () => {},
	terminalAvailable: () => false,
	isCompiling: () => false,
	runCompile: () => {},
	stopCompile: () => {},
	openPreferences: () => {},
	openFolder: () => {},
	stepDocumentHistory: () => {}
};

function ctrlW() {
	return { ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, key: 'w', preventDefault: () => {} } as KeyboardEvent;
}

describe('Ctrl+W', () => {
	// the document buffer drops its path when a file fails to load; the tab is still there
	it('closes the focused tab even when no document is loaded', () => {
		const closeTab = vi.fn();
		const handle = createKeydownHandler({ ...inert, closeTab });
		handle(ctrlW());
		expect(closeTab).toHaveBeenCalledWith({ path: '/w/gone.tex', compare: undefined });
	});
});

// Ctrl+, toggled subscript in the editors and opened nothing; the desktop convention is Preferences
describe('Ctrl+,', () => {
	it('opens Preferences and swallows the key', () => {
		const openPreferences = vi.fn();
		const preventDefault = vi.fn();
		const handle = createKeydownHandler({ ...inert, openPreferences });
		handle({ ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, key: ',', preventDefault } as unknown as KeyboardEvent);
		expect(openPreferences).toHaveBeenCalledTimes(1);
		expect(preventDefault).toHaveBeenCalled();
		handle({ ctrlKey: true, metaKey: false, shiftKey: true, altKey: false, key: ',', preventDefault } as unknown as KeyboardEvent);
		expect(openPreferences).toHaveBeenCalledTimes(1); // Shift variant is the editors' subscript
	});
});

describe('Ctrl+Shift+T', () => {
	it('reopens the last closed tab and leaves Ctrl+T alone', () => {
		const reopenTab = vi.fn();
		const closeTab = vi.fn();
		const handle = createKeydownHandler({ ...inert, closeTab, reopenTab });
		handle({
			ctrlKey: true,
			metaKey: false,
			shiftKey: true,
			altKey: false,
			key: 't',
			preventDefault: () => {}
		} as unknown as KeyboardEvent);
		handle({
			ctrlKey: true,
			metaKey: false,
			shiftKey: false,
			altKey: false,
			key: 't',
			preventDefault: () => {}
		} as unknown as KeyboardEvent);
		expect(reopenTab).toHaveBeenCalledTimes(1);
		expect(closeTab).not.toHaveBeenCalled();
	});
});

// after a card's Reject button unmounts the focus is on the body, where no editor sees the key
describe('undo and redo', () => {
	it('reach the open document from outside a text field, by either redo key', () => {
		const stepDocumentHistory = vi.fn();
		const handle = createKeydownHandler({ ...inert, stepDocumentHistory });
		const press = (key: string, target: Element) =>
			handle({
				ctrlKey: true,
				metaKey: false,
				shiftKey: key === 'Z',
				altKey: false,
				key,
				target,
				preventDefault: () => {}
			} as unknown as KeyboardEvent);
		press('z', document.body);
		press('y', document.body);
		press('Z', document.body);
		expect(stepDocumentHistory.mock.calls).toEqual([['undo'], ['redo'], ['redo']]);
		press('z', document.body.appendChild(document.createElement('textarea')));
		expect(stepDocumentHistory).toHaveBeenCalledTimes(3);
	});
});

describe('Ctrl+O', () => {
	const press = (target: EventTarget) =>
		({
			ctrlKey: true,
			metaKey: false,
			shiftKey: false,
			altKey: false,
			key: 'o',
			target,
			preventDefault: () => {}
		}) as unknown as KeyboardEvent;

	it('opens a folder, but leaves the key to the shell in the terminal', () => {
		const openFolder = vi.fn();
		const handle = createKeydownHandler({ ...inert, openFolder });
		handle(press(document.body));
		expect(openFolder).toHaveBeenCalledTimes(1);
		const term = document.body.appendChild(document.createElement('div'));
		term.className = 'xterm';
		handle(press(term.appendChild(document.createElement('textarea'))));
		expect(openFolder).toHaveBeenCalledTimes(1);
	});
});

describe('Alt+Z', () => {
	const press = (target: EventTarget, preventDefault = () => {}) =>
		({
			ctrlKey: false,
			metaKey: false,
			shiftKey: false,
			altKey: true,
			key: 'z',
			code: 'KeyZ',
			target,
			preventDefault
		}) as unknown as KeyboardEvent;

	it('opens the Zotero picker from the editor, and leaves the key to a text field and to a window that cannot cite', () => {
		const insertZoteroCitation = vi.fn();
		const cites = (canZoteroCite: boolean) =>
			setPaletteActions({ canZoteroCite: () => canZoteroCite, insertZoteroCitation } as unknown as PaletteActions);
		const handle = createKeydownHandler(inert);
		const editor = document.body.appendChild(document.createElement('div'));
		editor.contentEditable = 'true';
		cites(true);
		handle(press(editor));
		expect(insertZoteroCitation).toHaveBeenCalledTimes(1);
		handle(press(document.body.appendChild(document.createElement('input'))));
		const preventDefault = vi.fn();
		cites(false);
		handle(press(editor, preventDefault));
		expect(insertZoteroCitation).toHaveBeenCalledTimes(1);
		expect(preventDefault).not.toHaveBeenCalled();
		setPaletteActions(null);
	});
});
