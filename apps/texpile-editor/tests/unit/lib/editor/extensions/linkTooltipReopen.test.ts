// @vitest-environment jsdom
//
// The rule this guards: a click back onto a link reopens its tooltip after the tooltip closed
// itself (a save, Escape, an outside click). The plugin used to compare the new state to the last
// one it showed a tooltip for, see no change, and never reopen.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { createLinkPlugin } from '$lib/editor/visual/extensions/link/linkPlugin';

const created: { onUpdate: (href: string, title: string | null) => void; onClose: () => void }[] = [];
vi.mock('$lib/editor/visual/extensions/link/linkTooltipFactory.svelte', () => ({
	createLinkTooltip: (o: (typeof created)[number]) => created.push(o),
	destroyLinkTooltip: () => {}
}));

// jsdom has no layout; coordsAtPos only needs rects that exist
if (!Range.prototype.getClientRects) {
	Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
	Range.prototype.getBoundingClientRect = () => new DOMRect();
}

// "see docs here": "docs" is 5-9, linked
function mountEditor() {
	const link = schema.marks.link.create({ href: 'https://a.example', title: null });
	const doc = schema.node('doc', null, [
		schema.node('paragraph', null, [schema.text('see '), schema.text('docs', [link]), schema.text(' here')])
	]);
	const place = document.createElement('div');
	document.body.appendChild(place);
	const view = new EditorView(place, { state: EditorState.create({ doc, plugins: [createLinkPlugin()] }) });
	return { view, place };
}

const clickAt = (view: EditorView, pos: number) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));

describe('link tooltip reopens on a click back into the same link', () => {
	beforeEach(() => created.splice(0));

	it('after saving an edit', () => {
		const { view, place } = mountEditor();
		clickAt(view, 6);
		expect(created).toHaveLength(1);
		created[0].onUpdate('https://b.example', null);
		expect(created).toHaveLength(1);
		clickAt(view, 7);
		expect(created).toHaveLength(2);
		view.destroy();
		place.remove();
	});

	it('after the tooltip closed itself', () => {
		const { view, place } = mountEditor();
		clickAt(view, 6);
		created[0].onClose();
		clickAt(view, 7);
		expect(created).toHaveLength(2);
		view.destroy();
		place.remove();
	});
});

describe('a link whose text is its address keeps the two together', () => {
	beforeEach(() => created.splice(0));

	it('typing into the text carries the href', () => {
		const { view, place } = mountEditor();
		// "url" is 5-8 and both text and href
		const bare = schema.marks.link.create({ href: 'https://', title: null });
		const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('see '), schema.text('https://', [bare])])]);
		view.updateState(EditorState.create({ doc, plugins: view.state.plugins }));
		// inside the link, not after it: the mark is non-inclusive, so typing at the end starts plain text
		view.dispatch(view.state.tr.insertText('hi', 12));
		const mark = view.state.doc.nodeAt(5)!.marks[0];
		const shown = view.state.doc.textBetween(5, 15);
		expect(shown).toBe('https:/hi/');
		expect(mark.attrs.href).toBe(shown);
		view.destroy();
		place.remove();
	});

	it('leaves a link whose text differs from its href alone', () => {
		const { view, place } = mountEditor();
		view.dispatch(view.state.tr.insertText('!', 9));
		expect(view.state.doc.nodeAt(5)!.marks[0].attrs.href).toBe('https://a.example');
		view.destroy();
		place.remove();
	});
});
