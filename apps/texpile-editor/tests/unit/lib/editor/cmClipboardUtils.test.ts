// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { copySelection, cutSelection, pasteAtCursor } from '../../../../src/lib/editor/source/cmClipboardUtils';

let clipboard = '';
let denied = false;

beforeEach(() => {
	clipboard = '';
	denied = false;
	// jsdom ships no clipboard, and the real one needs a user gesture even when it does
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: {
			writeText: (t: string) => (denied ? Promise.reject(new Error('denied')) : ((clipboard = t), Promise.resolve())),
			readText: () => (denied ? Promise.reject(new Error('denied')) : Promise.resolve(clipboard))
		}
	});
});

/** a live view, the way the source editor mounts one. destroy eagerly: a live view keeps measuring
 *  in rAF, which throws in a layout-less jsdom. */
async function withView(doc: string, selection: { anchor: number; head: number }, run: (view: EditorView) => Promise<void>) {
	const view = new EditorView({ state: EditorState.create({ doc, selection }), parent: document.body });
	try {
		await run(view);
	} finally {
		view.destroy();
	}
}

describe('source editor clipboard', () => {
	it('cuts the selection out of the document and onto the clipboard', async () => {
		await withView('alpha beta', { anchor: 0, head: 5 }, async (view) => {
			await cutSelection(view);
			expect(clipboard).toBe('alpha');
			expect(view.state.doc.toString()).toBe(' beta');
		});
	});

	// a menu is reachable with the caret parked anywhere, so every command has to survive
	// being invoked on nothing at all
	it('cuts nothing when the selection is empty', async () => {
		await withView('alpha beta', { anchor: 3, head: 3 }, async (view) => {
			clipboard = 'kept';
			await cutSelection(view);
			expect(clipboard).toBe('kept');
			expect(view.state.doc.toString()).toBe('alpha beta');
		});
	});

	it('copies nothing when the selection is empty, rather than clearing the clipboard', async () => {
		await withView('alpha beta', { anchor: 3, head: 3 }, async (view) => {
			clipboard = 'kept';
			await copySelection(view);
			expect(clipboard).toBe('kept');
		});
	});

	it('pastes over the selection and leaves the caret after the inserted text', async () => {
		await withView('alpha beta', { anchor: 0, head: 5 }, async (view) => {
			clipboard = 'gamma!';
			await pasteAtCursor(view);
			expect(view.state.doc.toString()).toBe('gamma! beta');
			expect(view.state.selection.main.head).toBe(6);
		});
	});

	// CodeMirror holds a Windows line break as one character
	it('pastes Windows line breaks at the end of the document', async () => {
		await withView('alpha ', { anchor: 6, head: 6 }, async (view) => {
			clipboard = 'a\r\nb\r\nc';
			await pasteAtCursor(view);
			expect(view.state.doc.toString()).toBe('alpha a\nb\nc');
			expect(view.state.selection.main.head).toBe(11);
		});
	});

	it('pastes nothing when the clipboard is empty, keeping the selection intact', async () => {
		await withView('alpha beta', { anchor: 0, head: 5 }, async (view) => {
			await pasteAtCursor(view);
			expect(view.state.doc.toString()).toBe('alpha beta');
			expect(view.state.selection.main.from).toBe(0);
			expect(view.state.selection.main.to).toBe(5);
		});
	});

	// the permission prompt belongs to the browser; a refusal must not surface as an unhandled
	// rejection out of a menu click
	it('survives a clipboard the browser refuses', async () => {
		await withView('alpha beta', { anchor: 0, head: 5 }, async (view) => {
			denied = true;
			await expect(copySelection(view)).resolves.toBeUndefined();
			await expect(pasteAtCursor(view)).resolves.toBeUndefined();
			expect(view.state.doc.toString()).toBe('alpha beta');
		});
	});
});
