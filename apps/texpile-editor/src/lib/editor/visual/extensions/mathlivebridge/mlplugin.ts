import { Plugin, PluginKey, TextSelection, type PluginSpec } from 'prosemirror-state';
import { EditorView, type Decoration, type NodeViewConstructor } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { MathLiveView } from './mlview.svelte';
import { caretWherePressed, forgetPress, recordPress } from './caret/mathPressBeside';

export type MathLivePluginState = {
	/** cursor pos before entering a math node, decides front vs back placement on expand. */
	prevCursorPos: number;
};
const MATHLIVE_PLUGIN_KEY = new PluginKey<MathLivePluginState>('prosemirror-mathlive');

const mathPluginSpec: PluginSpec<MathLivePluginState> = {
	key: MATHLIVE_PLUGIN_KEY,
	state: {
		init() {
			return {
				prevCursorPos: 0
			};
		},
		apply(tr, value, oldState) {
			return {
				prevCursorPos: oldState.selection.from
			};
		}
	},
	// the browser's own moves (End after a trailing equation) could leave the caret in an equation's text, where typing
	// went nowhere and Ctrl+M threw; unless its field is being edited, the caret goes beside the equation
	appendTransaction(trs, _old, state) {
		const { selection } = state;
		if (!trs.some((tr) => tr.selectionSet) || !(selection instanceof TextSelection) || !selection.empty) return null;
		const $caret = selection.$from;
		if ($caret.parent.type.name !== 'inline_math' || document.activeElement?.tagName === 'MATH-FIELD') return null;
		return state.tr.setSelection(TextSelection.create(state.doc, $caret.parentOffset === 0 ? $caret.before() : $caret.after()));
	},
	props: {
		nodeViews: {
			inline_math: createMathView(false),
			block_math: createMathView(true)
		},
		createSelectionBetween: caretWherePressed
	}
};

export const mathlivePlugin = new Plugin(mathPluginSpec);

export function createMathView(displayMode: boolean): NodeViewConstructor {
	return (node: Node, view: EditorView, getPos: boolean | (() => number | undefined), decorations: readonly Decoration[]): MathLiveView => {
		const nodeView = new MathLiveView(node, view, getPos as () => number, MATHLIVE_PLUGIN_KEY, displayMode, decorations);

		return nodeView;
	};
}

import { keydownHandler } from 'prosemirror-keymap';
import { isMac } from '$lib/platform';
import { NodeSelection, EditorState, Transaction } from 'prosemirror-state';
import { verticalArrowKeyDown, verticalArrowsAfterUpdate, verticalArrowsMouseDown } from './mlVerticalArrows';

// selects an adjacent mathfield on left/right when there is no text node between it and the cursor.
function mlHorizontalArrowHandler(dir: 'left' | 'right') {
	return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
		const { $from, empty } = state.selection;
		if (!empty) return false;

		const parent = $from.parent;
		if (parent.type.name !== 'paragraph') return false;

		const indexInParent = $from.index();

		if (dir === 'right') {
			if (indexInParent < parent.childCount) {
				const nextChild = parent.child(indexInParent);
				if (nextChild.type.name === 'inline_math') {
					const offsetInParent = $from.parentOffset;
					let posBeforeNext = 0;
					for (let i = 0; i < indexInParent; i++) {
						posBeforeNext += parent.child(i).nodeSize;
					}
					if (offsetInParent === posBeforeNext) {
						const mathPos = $from.before() + 1 + posBeforeNext;
						const tr = state.tr.setSelection(NodeSelection.create(state.doc, mathPos));
						dispatch?.(tr);
						return true;
					}
				}
			}
		} else {
			if (indexInParent > 0) {
				const prevChild = parent.child(indexInParent - 1);
				if (prevChild.type.name === 'inline_math') {
					const offsetInParent = $from.parentOffset;
					let posAfterPrev = 0;
					for (let i = 0; i < indexInParent; i++) {
						posAfterPrev += parent.child(i).nodeSize;
					}
					if (offsetInParent === posAfterPrev) {
						const mathPos = $from.before() + 1 + posAfterPrev - prevChild.nodeSize;
						const tr = state.tr.setSelection(NodeSelection.create(state.doc, mathPos));
						dispatch?.(tr);
						return true;
					}
				}
			}
		}

		return false;
	};
}

// prosemirror only steps a shift selection over leaf atoms and math holds text, so the browser got the key and stalled at the field
function mlShiftArrowHandler(dir: -1 | 1) {
	return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
		const sel = state.selection;
		if (!(sel instanceof TextSelection)) return false;
		const { $head } = sel;
		const node = $head.textOffset ? null : dir < 0 ? $head.nodeBefore : $head.nodeAfter;
		if (node?.type.name !== 'inline_math') return false;
		dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, sel.anchor, $head.pos + dir * node.nodeSize)));
		return true;
	};
}

// a word key takes the math as one word, as LyX's does an inset: ProseMirror would select it, and so enter it
function mlWordArrowHandler(dir: -1 | 1) {
	return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
		const sel = state.selection;
		if (!(sel instanceof TextSelection) || !sel.empty) return false;
		const { $head } = sel;
		const node = $head.textOffset ? null : dir < 0 ? $head.nodeBefore : $head.nodeAfter;
		if (node?.type.name !== 'inline_math') return false;
		dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, $head.pos + dir * node.nodeSize)));
		return true;
	};
}

// as LyX, Backspace or Delete beside a formula goes into it first, where one key took the whole formula
function mlDeleteHandler(dir: -1 | 1) {
	return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
		const sel = state.selection;
		if (!(sel instanceof TextSelection) || !sel.empty) return false;
		const { $head } = sel;
		const node = $head.textOffset ? null : dir < 0 ? $head.nodeBefore : $head.nodeAfter;
		if (node?.type.name !== 'inline_math') return false;
		dispatch?.(state.tr.setSelection(NodeSelection.create(state.doc, dir < 0 ? $head.pos - node.nodeSize : $head.pos)));
		return true;
	};
}

const word = isMac ? 'Alt' : 'Ctrl';
const horizontalArrowKeyDown = keydownHandler({
	ArrowRight: mlHorizontalArrowHandler('right'),
	ArrowLeft: mlHorizontalArrowHandler('left'),
	'Shift-ArrowRight': mlShiftArrowHandler(1),
	'Shift-ArrowLeft': mlShiftArrowHandler(-1),
	[`${word}-ArrowRight`]: mlWordArrowHandler(1),
	[`${word}-ArrowLeft`]: mlWordArrowHandler(-1),
	[`Shift-${word}-ArrowRight`]: mlShiftArrowHandler(1),
	[`Shift-${word}-ArrowLeft`]: mlShiftArrowHandler(-1),
	Backspace: mlDeleteHandler(-1),
	Delete: mlDeleteHandler(1)
});

/** must come before the regular keymap in plugin order. */
export const mlarrowHandlers = new Plugin({
	props: {
		handleKeyDown: (view, event) => {
			forgetPress(view);
			return verticalArrowKeyDown(view, event) || horizontalArrowKeyDown(view, event);
		},
		handleDOMEvents: {
			mousedown: (view, event) => {
				recordPress(view, event);
				return verticalArrowsMouseDown(view);
			}
		}
	},
	view: () => ({
		update: (view, before) => verticalArrowsAfterUpdate(view, !view.state.selection.eq(before.selection))
	})
});
