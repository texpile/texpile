// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection, type Selection } from 'prosemirror-state';
import type { CanvasView } from '$lib/editor/canvas';
import type { Platform } from '$lib/editor/keys/platformKeys';
import { captureKeys } from '$lib/editor/canvas/interaction/keys/captureKeys';
import { settleTestView, testSchema } from '../../testing/testCanvasView';
import { createLaidOutTestView } from '../../testing/laidOutTestView';

const { paragraph, image, cite } = testSchema.nodes;
const text = (value: string) => testSchema.text(value);

const CODES: Record<string, number> = {
	Backspace: 8,
	Enter: 13,
	Escape: 27,
	ArrowLeft: 37,
	ArrowUp: 38,
	ArrowRight: 39,
	ArrowDown: 40,
	Delete: 46,
	b: 66,
	d: 68,
	f: 70,
	h: 72,
	i: 73,
	n: 78,
	p: 80,
	y: 89,
	z: 90
};

/** a doc of paragraph `one`, a block image, paragraph `two` (ltr) or Hebrew in the first */
function docOf(first: string, ...inline: ReturnType<typeof text | typeof cite.create>[]): ReturnType<typeof testSchema.node> {
	return testSchema.node('doc', null, [
		paragraph.create(null, [text(first), ...inline]),
		image.create({ label: 'fig:a' }),
		paragraph.create(null, text('two'))
	]);
}

async function viewOn(doc: ReturnType<typeof docOf>, select: (doc: ReturnType<typeof docOf>) => Selection): Promise<CanvasView> {
	const view = createLaidOutTestView(EditorState.create({ doc, selection: select(doc) }));
	await settleTestView(view);
	return view;
}

function caret(pos: number) {
	return (doc: ReturnType<typeof docOf>) => TextSelection.create(doc, pos);
}

function press(view: CanvasView, key: string, init: KeyboardEventInit = {}, platform: Platform = 'linux'): boolean {
	return captureKeys(view, new KeyboardEvent('keydown', { key, keyCode: CODES[key], ...init }), platform);
}

describe('captureKeys: Backspace and Delete', () => {
	it('leave a character to the native delete, and take a node beside the caret whole', async () => {
		const view = await viewOn(docOf('ab', cite.create({ key: 'k' })), caret(3));
		expect(press(view, 'Backspace')).toBe(false);
		expect(view.state.doc.child(0).childCount).toBe(2);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)));
		expect(press(view, 'Backspace')).toBe(true);
		expect(view.state.doc.child(0).textContent).toBe('ab');
		expect(view.state.doc.child(0).childCount).toBe(1);
		view.destroy();
	});

	it('stop at a textblock edge and over a range across textblocks, so the native delete cannot cross them', async () => {
		const view = await viewOn(docOf('ab'), caret(1));
		expect(press(view, 'Backspace')).toBe(true);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
		expect(press(view, 'Delete')).toBe(true);
		const second = view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize + 1;
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, second + 1)));
		expect(press(view, 'Delete')).toBe(true);
		view.destroy();
	});

	it('take Ctrl+H and Ctrl+D as Backspace and Delete on macOS only', async () => {
		const view = await viewOn(docOf('ab'), caret(1));
		expect(press(view, 'h', { ctrlKey: true }, 'mac')).toBe(true);
		expect(press(view, 'h', { ctrlKey: true }, 'linux')).toBe(false);
		expect(press(view, 'd', { ctrlKey: true }, 'mac')).toBe(false);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
		expect(press(view, 'd', { ctrlKey: true }, 'mac')).toBe(true);
		view.destroy();
	});

	it('leave Shift+Delete to the clipboard', async () => {
		const view = await viewOn(docOf('ab'), caret(1));
		expect(press(view, 'Delete', { shiftKey: true })).toBe(false);
		view.destroy();
	});
});

describe('captureKeys: Escape and Enter', () => {
	it('Escape puts the caret after a selected inline node and is otherwise swallowed', async () => {
		const view = await viewOn(docOf('ab', cite.create({ key: 'k' })), (doc) => NodeSelection.create(doc, 3));
		expect(press(view, 'Escape')).toBe(true);
		expect(view.state.selection).toBeInstanceOf(TextSelection);
		expect(view.state.selection.head).toBe(4);
		expect(press(view, 'Escape')).toBe(true);
		expect(view.state.selection.head).toBe(4);
		view.destroy();
	});

	it('Enter is swallowed for the keymaps and the input surface', async () => {
		const view = await viewOn(docOf('ab'), caret(2));
		expect(press(view, 'Enter')).toBe(true);
		view.destroy();
	});
});

describe('captureKeys: the keymap keys', () => {
	it('swallow Mod-B, Mod-I, Mod-Y and Mod-Z so the browser applies no formatting or undo of its own', async () => {
		const view = await viewOn(docOf('ab'), caret(2));
		for (const key of ['b', 'i', 'y', 'z']) {
			expect(press(view, key, { ctrlKey: true }, 'linux'), `Ctrl+${key}`).toBe(true);
			expect(press(view, key, { metaKey: true }, 'mac'), `Cmd+${key}`).toBe(true);
		}
		expect(press(view, 'b', { metaKey: true }, 'linux')).toBe(false);
		view.destroy();
	});
});
