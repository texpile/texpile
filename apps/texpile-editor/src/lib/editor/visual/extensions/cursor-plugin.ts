// selection-driven UI: hands the live selection to the range painter, which shades what the browser
// will not paint (CM-backed leaves, a suggestion's old words), and syncs the cursorInCm store the
// menu bar uses to disable commands that would eat raw blocks.
import { NodeSelection, Plugin, PluginKey } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';
import { DecorationSet, type EditorView } from 'prosemirror-view';
import { cursorInCm } from '$lib/stores/editorStore';
import { paintRange } from '$lib/editor/visual/highlight/paintRange';
import { rangeBandPainter } from '$lib/editor/visual/highlight/rangeBands';
import { oldWordsInSelection } from './pmSuggestionsState';
import { selectionHeldVisible } from './persistentSelection/persistentSelectionPlugin';
import { pmCommentsKey } from './pmComments';

const CM_NODE_TYPES = new Set(['raw_latex', 'code_block', 'block_math']);

function isCursorInCm(state: EditorState): boolean {
	const $from = state.selection.$from;
	for (let d = $from.depth; d >= 0; d--) {
		if (CM_NODE_TYPES.has($from.node(d).type.name)) return true;
	}
	return false;
}

function buildDecorations(state: EditorState, key: string): DecorationSet {
	if (state.selection.empty) return DecorationSet.empty;
	const { from, to } = state.selection;
	// the browser paints the text of a focused selection, so only what it skips is drawn; with focus
	// parked in a menu it paints nothing and the words need drawing too, in the same colour either
	// way. the old opaque Tailwind blue read as patchwork against the native highlight
	const held = selectionHeldVisible(state);
	// a comment or Refine being written for a passage paints it in this colour already, and owns it while open
	if (held && pmCommentsKey.getState(state)?.pending) return DecorationSet.empty;
	const decos = paintRange(state.doc, {
		from,
		to,
		tint: 'var(--editor-selection)',
		key,
		reach: 'line',
		nativeText: !held,
		nativeNode: !held && state.selection instanceof NodeSelection
	});
	return decos.length ? DecorationSet.create(state.doc, decos) : DecorationSet.empty;
}

// a suggestion's old words are a widget, which no decoration reaches: the class goes on the element
function shadeOldWords(view: EditorView, key: string, shadedBefore: boolean): boolean {
	const crossed = oldWordsInSelection(view.state);
	if (crossed.size === 0 && !shadedBefore) return false;
	for (const el of view.dom.querySelectorAll<HTMLElement>('.pm-suggest-old')) {
		const id = el.dataset.comment ?? '';
		// the words wear their own tint already; selected, the selection's colour goes over it (app.css)
		el.classList.toggle('pm-range-selected', crossed.has(id));
		el.classList.toggle('pm-range-node', crossed.has(id));
		if (crossed.has(id)) el.dataset.band = `${key}-old-${id}`;
		else delete el.dataset.band;
	}
	return crossed.size > 0;
}

export const cursorPluginKey = new PluginKey('cursor');

let cursorPlugins = 0;

export function createCursorPlugin() {
	// band names stay apart when two editors are open side by side
	const key = `sel${++cursorPlugins}`;
	return new Plugin({
		key: cursorPluginKey,
		props: {
			decorations(state) {
				try {
					return buildDecorations(state, key);
				} catch {
					return DecorationSet.empty;
				}
			}
		},
		// cursorInCm sync: cheaper as a view() diff than a decorations() rebuild
		view(view) {
			// only the focused editor's caret is the menus' business
			let last = isCursorInCm(view.state);
			if (view.editable) cursorInCm.current = last;
			let oldWordsShaded = false;
			const painter = rangeBandPainter(view);
			return {
				update(v) {
					oldWordsShaded = shadeOldWords(v, key, oldWordsShaded);
					painter.repaint();
					const cur = isCursorInCm(v.state);
					if (cur !== last && v.editable) {
						last = cur;
						cursorInCm.current = cur;
					}
				},
				destroy() {
					painter.destroy();
					// reset so a stale true doesn't keep the menus disabled
					if (view.editable) cursorInCm.current = false;
				}
			};
		}
	});
}
