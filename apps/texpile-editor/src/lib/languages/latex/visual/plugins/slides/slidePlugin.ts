import './slides.css';
import type { Node } from 'prosemirror-model';
import { keymap } from 'prosemirror-keymap';
import { Plugin, PluginKey, Selection, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { m } from '$lib/paraglide/messages';

const HINTS: Record<string, () => string> = {
	frame_title: () => m.slide_title_placeholder(),
	frame_subtitle: () => m.slide_subtitle_placeholder(),
	beamer_block_title: () => m.slide_block_title_placeholder()
};

function decorationsOf(doc: Node): DecorationSet {
	const decorations: Decoration[] = [];
	let slide = 0;
	doc.descendants((node, pos) => {
		const hint = HINTS[node.type.name];
		if (hint) {
			if (node.content.size === 0) decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'is-empty', 'data-hint': hint() }));
			return false;
		}
		if (node.isTextblock) return false;
		if (node.type.name === 'frame' && !/\bnoframenumbering\b/.test(String(node.attrs.options))) {
			decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-slide': String(++slide) }));
		}
		const first = node.firstChild;
		if (node.type.name === 'list' && node.attrs.overlay && first?.isTextblock) {
			decorations.push(
				Decoration.node(pos + 1, pos + 1 + first.nodeSize, { class: 'beamer-item-overlay', 'data-overlay': String(node.attrs.overlay) })
			);
		}
		return true;
	});
	return DecorationSet.create(doc, decorations);
}

function leaveTitle(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const { $from, empty } = state.selection;
	if (!empty || !($from.parent.type.name in HINTS)) return false;
	const after = $from.after();
	const beside = state.doc.resolve(after).nodeAfter;
	// a frame's body opening with a block gets a paragraph of its own first, so Enter does not land in the block's title
	if (beside && !beside.isTextblock && $from.parent.type.name !== 'beamer_block_title') {
		if (dispatch) {
			const tr = state.tr.insert(after, state.schema.nodes.paragraph.create());
			dispatch(tr.setSelection(Selection.near(tr.doc.resolve(after + 1))).scrollIntoView());
		}
		return true;
	}
	const next = Selection.findFrom(state.doc.resolve(after), 1, true);
	if (next) dispatch?.(state.tr.setSelection(next).scrollIntoView());
	return true;
}

function dropEmptyTitle(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const { $from, empty } = state.selection;
	const type = $from.parent.type.name;
	if (!empty || $from.parentOffset > 0 || $from.parent.content.size > 0 || (type !== 'frame_title' && type !== 'frame_subtitle'))
		return false;
	if (dispatch) {
		const tr = state.tr.delete($from.before(), $from.after());
		const near = Selection.findFrom(tr.doc.resolve(Math.min($from.before(), tr.doc.content.size)), 1, true);
		dispatch((near ? tr.setSelection(near) : tr).scrollIntoView());
	}
	return true;
}

const SLIDE_BOXES = new Set(['frame', 'beamer_block']);

function stayInSlide(dir: -1 | 1) {
	return (state: EditorState): boolean => {
		const { $from, empty } = state.selection;
		if (!empty || !$from.parent.isTextblock || $from.depth < 2) return false;
		if ($from.parentOffset !== (dir < 0 ? 0 : $from.parent.content.size)) return false;
		const parent = $from.node(-1);
		if (!SLIDE_BOXES.has(parent.type.name)) return false;
		const index = $from.index(-1);
		const beside = dir < 0 ? (index > 0 ? parent.child(index - 1) : null) : index + 1 < parent.childCount ? parent.child(index + 1) : null;
		return !beside || beside.type.name in HINTS || $from.parent.type.name in HINTS;
	};
}

export function slidePlugins(): Plugin[] {
	const key = new PluginKey<DecorationSet>('slides');
	return [
		new Plugin({
			key,
			state: {
				init: (_config, state) => decorationsOf(state.doc),
				apply: (tr, previous) => (tr.docChanged ? decorationsOf(tr.doc) : previous)
			},
			props: { decorations: (state) => key.getState(state) }
		}),
		keymap({ Enter: leaveTitle, Tab: leaveTitle, Backspace: dropEmptyTitle, Delete: dropEmptyTitle }),
		keymap({ Backspace: stayInSlide(-1), Delete: stayInSlide(1) })
	];
}
