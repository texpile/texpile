// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { CanvasNodeViews, CanvasView } from '$lib/editor/canvas';
import type { Platform } from '$lib/editor/keys/platformKeys';
import { KeyRouter } from '$lib/editor/canvas/interaction/keys/keyRouter';
import { settleTestView, testSchema } from '../../testing/testCanvasView';
import { createLaidOutTestView } from '../../testing/laidOutTestView';

const { paragraph } = testSchema.nodes;
const strong = testSchema.marks.strong;

async function typedIn(paragraphs: string[], head: number, platform: Platform = 'linux') {
	const doc = testSchema.node(
		'doc',
		null,
		paragraphs.map((text) => paragraph.create(null, text ? testSchema.text(text) : null))
	);
	const view = createLaidOutTestView(EditorState.create({ doc, selection: TextSelection.create(doc, head) }), { width: 400 });
	await settleTestView(view);
	const router = new KeyRouter(view, { active: () => null, stopsEvent: () => false }, () => null, platform);
	const press = (key: string, init: KeyboardEventInit = {}) => router.keydown(new KeyboardEvent('keydown', { key, ...init }));
	return { view, press };
}

const text = (view: CanvasView, block = 0) => view.state.doc.child(block).textContent;

describe('Backspace and Delete', () => {
	it('take one code point backward, a whole emoji sequence, and one grapheme forward', async () => {
		const family = '👨‍👩‍👧';
		const { view, press } = await typedIn([`ab${family}cd`], 1 + 2 + family.length);
		press('Backspace');
		expect(text(view)).toBe('abcd');
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
		press('Delete');
		expect(text(view)).toBe('abd');
		view.destroy();
	});

	it('take a combining mark alone going back, and a flag whole', async () => {
		const { view, press } = await typedIn(['xé'], 1 + 3);
		press('Backspace');
		expect(text(view)).toBe('xe');
		view.dispatch(view.state.tr.insertText('🇫🇷', 3));
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 7)));
		press('Backspace');
		expect(text(view)).toBe('xe');
		view.destroy();
	});

	it('take a word with Ctrl and stop at the textblock edge', async () => {
		const { view, press } = await typedIn(['alpha beta gamma'], 1 + 16);
		press('Backspace', { ctrlKey: true });
		expect(text(view)).toBe('alpha beta ');
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
		press('Delete', { ctrlKey: true });
		expect(text(view)).toBe(' beta ');
		view.destroy();
	});

	it('take a drawn chip with the word, as a space and a footnote chip after it go together', async () => {
		const nodeViews: CanvasNodeViews = { cite: (_node, view) => ({ dom: view.canvas.build.el('span', 'chip') }) };
		const doc = testSchema.node('doc', null, [
			paragraph.create(null, [testSchema.text('ab '), testSchema.nodes.cite.create({ key: 'k' })])
		]);
		const view = createLaidOutTestView(EditorState.create({ doc, selection: TextSelection.create(doc, 3) }), {
			width: 400,
			nodeViews
		});
		await settleTestView(view);
		const router = new KeyRouter(view, { active: () => null, stopsEvent: () => false }, () => null, 'linux');
		router.keydown(new KeyboardEvent('keydown', { key: 'Delete', keyCode: 46, ctrlKey: true }));
		expect(view.state.doc.child(0).childCount).toBe(1);
		expect(text(view)).toBe('ab');
		view.destroy();
	});

	it('keep a mark the deletion ended in, so typing after it goes on in the same style', async () => {
		const doc = testSchema.node('doc', null, [paragraph.create(null, [testSchema.text('a '), testSchema.text('bc', [strong.create()])])]);
		const view = createLaidOutTestView(EditorState.create({ doc, selection: TextSelection.create(doc, 5) }), { width: 400 });
		await settleTestView(view);
		const router = new KeyRouter(view, { active: () => null, stopsEvent: () => false }, () => null, 'linux');
		router.keydown(new KeyboardEvent('keydown', { key: 'Backspace', ctrlKey: true }));
		expect(text(view)).toBe('a ');
		expect(view.state.storedMarks?.map((mark) => mark.type.name)).toEqual(['strong']);
		view.destroy();
	});
});

describe('the macOS line and emacs keys', () => {
	it('Cmd+Backspace deletes to the start of the line, Cmd+Delete to its end', async () => {
		const { view, press } = await typedIn(['one two three'], 1 + 7, 'mac');
		press('Backspace', { metaKey: true });
		expect(text(view)).toBe(' three');
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
		press('Delete', { metaKey: true });
		expect(text(view)).toBe(' t');
		view.destroy();
	});

	it('Ctrl+K kills to the paragraph end, kills the break at its end, and Ctrl+Y puts the kills back together', async () => {
		const { view, press } = await typedIn(['first line', 'second'], 1 + 5, 'mac');
		press('k', { ctrlKey: true });
		expect(text(view, 0)).toBe('first');
		press('k', { ctrlKey: true });
		expect(view.state.doc.childCount).toBe(1);
		expect(text(view)).toBe('firstsecond');
		press('End');
		press('y', { ctrlKey: true });
		expect(text(view)).toContain(' line');
		view.destroy();
	});

	it('Ctrl+T swaps the characters around the caret, or the last two at the end, and Ctrl+O opens a line', async () => {
		const { view, press } = await typedIn(['abcd'], 1 + 2, 'mac');
		press('t', { ctrlKey: true });
		expect(text(view)).toBe('acbd');
		expect(view.state.selection.head).toBe(1 + 3);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 5)));
		press('t', { ctrlKey: true });
		expect(text(view)).toBe('acdb');
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
		press('o', { ctrlKey: true });
		expect(view.state.doc.childCount).toBe(2);
		expect(text(view, 0)).toBe('ac');
		expect(view.state.selection.head).toBe(3);
		view.destroy();
	});
});
