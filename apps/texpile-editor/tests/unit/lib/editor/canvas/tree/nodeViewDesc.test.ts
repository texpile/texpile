// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { faceElement, FaceElement, type CanvasNodeViews, type CanvasView } from '$lib/editor/canvas';
import { caretPolicyOf } from '$lib/editor/canvas/geometry/caretPolicy';
import { createTestCanvasView, testSchema as s } from '../testing/testCanvasView';

const decorated = new PluginKey<DecorationSet>('decorated');
/** decorations a test sets with a meta, as a comment or a table selection plugin would */
const decorationPlugin = new Plugin<DecorationSet>({
	key: decorated,
	state: {
		init: () => DecorationSet.empty,
		apply: (tr, set) => (tr.getMeta(decorated) as DecorationSet | undefined) ?? set.map(tr.mapping, tr.doc)
	},
	props: { decorations: (state) => decorated.getState(state) }
});

function paperView(): CanvasView {
	const doc = s.node('doc', null, [
		s.node('paragraph', null, [s.text('one '), s.node('cite', { key: 'knuth' }), s.text(' two')]),
		s.node('blockquote', null, [s.node('paragraph', null, [s.text('quoted')])])
	]);
	return createTestCanvasView(EditorState.create({ doc, plugins: [decorationPlugin] }));
}

function elementAt(view: CanvasView, pos: number): FaceElement {
	const el = view.nodeDOM(pos);
	if (!(el instanceof FaceElement)) throw new Error(`no element at ${pos}`);
	return el;
}

function decorate(view: CanvasView, decorations: Decoration[]): void {
	view.dispatch(view.state.tr.setMeta(decorated, DecorationSet.create(view.state.doc, decorations)));
}

describe('element trees', () => {
	it('keep their elements while the user types, as prosemirror-view keeps its DOM', () => {
		const view = paperView();
		const paragraph = elementAt(view, 0);
		const cite = elementAt(view, 5);
		const quoted = elementAt(view, 12);
		expect(paragraph.childNodes.filter((c) => c instanceof FaceElement)).toEqual([cite]);
		view.dispatch(view.state.tr.insertText('zero ', 1));
		expect(elementAt(view, 0)).toBe(paragraph);
		expect(elementAt(view, 10)).toBe(cite);
		expect(elementAt(view, 17)).toBe(quoted);
		view.dispatch(view.state.tr.insertText('!', 19));
		expect(elementAt(view, 17)).toBe(quoted);
		expect(elementAt(view, 0)).toBe(paragraph);
	});

	it('give a widget its place as it is now, after text typed above moved it', () => {
		const view = paperView();
		let pos: (() => number | undefined) | null = null;
		const widget = Decoration.widget(13, () => document.createElement('span'), {
			key: 'mark',
			canvas: {
				kind: 'inline',
				build: (ctx: { pos(): number | undefined; el(tag: string): FaceElement }) => {
					pos = ctx.pos;
					return ctx.el('span');
				}
			}
		});
		decorate(view, [widget]);
		elementAt(view, 11);
		expect(pos!()).toBe(13);
		view.dispatch(view.state.tr.insertText('zero ', 1));
		elementAt(view, 16);
		expect(pos!()).toBe(18);
	});

	it('keep their elements when a node decoration comes and goes, patching only its attributes', () => {
		const view = paperView();
		const quote = elementAt(view, 11);
		decorate(view, [Decoration.node(11, view.state.doc.content.size, { class: 'selectedCell', 'data-find': '1' })]);
		expect(elementAt(view, 11)).toBe(quote);
		expect(quote.classList.contains('selectedCell')).toBe(true);
		expect(quote.getAttribute('data-find')).toBe('1');
		decorate(view, []);
		expect(elementAt(view, 11)).toBe(quote);
		expect(quote.classList.contains('selectedCell')).toBe(false);
		expect(quote.hasAttribute('data-find')).toBe(false);
	});

	it('leave text decorations out of the tree, and give an inline atom under one its attributes', () => {
		const view = paperView();
		const paragraph = elementAt(view, 0);
		const version = paragraph.version;
		decorate(view, [Decoration.inline(1, 8, { class: 'pm-comment', 'data-comment': 't1' })]);
		expect(elementAt(view, 0)).toBe(paragraph);
		expect(paragraph.version).toBe(version);
		expect(elementAt(view, 5).getAttribute('data-comment')).toBe('t1');
	});

	it('move the selected class with a NodeSelection', () => {
		const view = paperView();
		const cite = elementAt(view, 5);
		view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 5)));
		expect(cite.classList.contains('ProseMirror-selectednode')).toBe(true);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
		expect(cite.classList.contains('ProseMirror-selectednode')).toBe(false);
	});
});

function viewsOf(doc: ReturnType<typeof s.node>, nodeViews: CanvasNodeViews): CanvasView {
	return createTestCanvasView(EditorState.create({ doc }), { props: { nodeViews } });
}

describe('node views', () => {
	it('are kept, updated, built again and destroyed by prosemirror-view rules', () => {
		const log: string[] = [];
		const nodeViews: CanvasNodeViews = {
			// no contentDOM: built again on any change of its content
			heading(node) {
				log.push(`heading ${node.textContent}`);
				return { dom: faceElement('h1'), destroy: () => log.push(`destroy ${node.textContent}`) };
			},
			// contentDOM: kept while the markup stays
			blockquote() {
				log.push('quote');
				const dom = faceElement('blockquote');
				return { dom, contentDOM: dom };
			},
			// its update decides
			paragraph(node) {
				log.push(`paragraph ${node.textContent}`);
				const dom = faceElement('p');
				return { dom, contentDOM: dom, update: (next) => !next.textContent.includes('!') };
			}
		};
		const doc = s.node('doc', null, [
			s.node('heading', null, [s.text('title')]),
			s.node('blockquote', null, [s.node('paragraph', null, [s.text('quoted')])])
		]);
		const view = viewsOf(doc, nodeViews);
		const quote = elementAt(view, 7);
		const paragraph = elementAt(view, 8);
		view.dispatch(view.state.tr.insertText('x', 10));
		expect(elementAt(view, 7)).toBe(quote);
		expect(elementAt(view, 8)).toBe(paragraph);
		view.dispatch(view.state.tr.insertText('!', 10));
		expect(elementAt(view, 7)).toBe(quote);
		expect(elementAt(view, 8)).not.toBe(paragraph);
		const heading = elementAt(view, 0);
		view.dispatch(view.state.tr.insertText('y', 1));
		expect(elementAt(view, 0)).not.toBe(heading);
		view.dispatch(view.state.tr.delete(0, 8));
		// blocks build when first asked for, and a view is destroyed before its node builds again
		expect(log).toEqual([
			'quote',
			'paragraph quoted',
			'heading title',
			'paragraph q!xuoted',
			'destroy title',
			'heading ytitle',
			'destroy ytitle'
		]);
	});

	it('select and deselect with a NodeSelection; a view without selectNode wears the default look', () => {
		const calls: string[] = [];
		const nodeViews: CanvasNodeViews = {
			cite: () => ({ dom: faceElement('span'), selectNode: () => calls.push('select'), deselectNode: () => calls.push('deselect') })
		};
		const doc = s.node('doc', null, [s.node('paragraph', null, [s.text('one '), s.node('cite'), s.text(' two')]), s.node('image')]);
		const view = viewsOf(doc, nodeViews);
		const image = elementAt(view, 11);
		const select = (pos: number) => view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
		select(5);
		select(11);
		expect(image.classList.contains('ProseMirror-selectednode')).toBe(true);
		expect(elementAt(view, 5).classList.contains('ProseMirror-selectednode')).toBe(false);
		select(5);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
		expect(image.classList.contains('ProseMirror-selectednode')).toBe(false);
		expect(calls).toEqual(['select', 'deselect', 'select', 'deselect']);
	});

	it('give a never-built chip its caret policy from one detached build', () => {
		const built: string[] = [];
		const destroyed: string[] = [];
		const nodeViews: CanvasNodeViews = {
			cite(node) {
				built.push(node.attrs.key);
				const dom = faceElement('span');
				if (node.attrs.key === 'vspace') dom.setAttribute('data-chip-character', '');
				return { dom, destroy: () => destroyed.push(node.attrs.key) };
			}
		};
		const view = viewsOf(s.node('doc', null, [s.node('paragraph', null, [s.text('one')])]), nodeViews);
		const chip = s.node('cite', { key: 'vspace' });
		expect(caretPolicyOf(view, chip)).toBe('character');
		expect(caretPolicyOf(view, chip)).toBe('character');
		expect(caretPolicyOf(view, s.node('cite', { key: 'knuth' }))).toBe('atom');
		expect(built).toEqual(['vspace', 'knuth']);
		expect(destroyed).toEqual(['vspace', 'knuth']);
	});
});
