// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { slidePlugins } from '$lib/languages/latex/visual/plugins/slides/slidePlugin';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';

const n = schema.nodes;
const para = (text: string) => n.paragraph.create(null, schema.text(text));
const DECK = n.doc.create(null, [
	n.frame.create(null, [
		n.frame_title.create(null, schema.text('First Frame')),
		para('Frame words one.'),
		n.beamer_block.create(null, [n.beamer_block_title.create(null, schema.text('Block Title')), para('Block body text.')])
	]),
	n.frame.create(null, [para('Second frame words.')])
]);

function textAt(doc: PMNode, words: string): number {
	let at = -1;
	doc.descendants((node, pos) => {
		if (at < 0 && node.isText && node.text!.includes(words)) at = pos + node.text!.indexOf(words);
		return at < 0;
	});
	return at;
}

function press(words: string, key: string, atEnd = false): { handled: boolean; same: boolean } {
	const doc = DECK;
	const state = EditorState.create({ doc, plugins: slidePlugins() });
	const view = new EditorView(document.body.appendChild(document.createElement('div')), { state });
	const at = textAt(doc, words) + (atEnd ? words.length : 0);
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
	const handled = view.someProp('handleKeyDown', (f) => f(view, new KeyboardEvent('keydown', { key }))) ?? false;
	const same = view.state.doc.eq(doc);
	view.destroy();
	return { handled, same };
}

describe('keys at the edges of a slide', () => {
	it('Backspace at the start of a frame text leaves it under its title', () => {
		expect(press('Frame words one', 'Backspace')).toEqual({ handled: true, same: true });
	});

	it('Backspace at the start of a block body leaves it under the block title', () => {
		expect(press('Block body text', 'Backspace')).toEqual({ handled: true, same: true });
	});

	it('Backspace at the start of a frame keeps it a frame of its own', () => {
		expect(press('Second frame words', 'Backspace')).toEqual({ handled: true, same: true });
	});

	it('Delete at the end of a title keeps the text under it', () => {
		expect(press('First Frame', 'Delete', true)).toEqual({ handled: true, same: true });
	});

	it('leaves a Backspace inside the text to the editor', () => {
		expect(press('words one', 'Backspace').handled).toBe(false);
	});
});

describe('Enter at the end of a frame subtitle', () => {
	it('puts the caret in a paragraph before a block that opens the frame body', () => {
		const block = n.beamer_block.create(null, [n.beamer_block_title.create(null, schema.text('Blk')), para('Body')]);
		const frame = n.frame.create(null, [
			n.frame_title.create(null, schema.text('T')),
			n.frame_subtitle.create(null, schema.text('Sub')),
			block
		]);
		const doc = n.doc.create(null, [frame]);
		const state = EditorState.create({ doc, plugins: slidePlugins() });
		const view = new EditorView(document.body.appendChild(document.createElement('div')), { state });
		view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, textAt(doc, 'Sub') + 3)));
		view.someProp('handleKeyDown', (f) => f(view, new KeyboardEvent('keydown', { key: 'Enter' })));
		expect(view.state.selection.$from.parent.type.name).toBe('paragraph');
		expect(view.state.doc.firstChild!.child(2).type.name).toBe('paragraph');
		view.destroy();
	});
});
