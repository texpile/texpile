// Backspace or Delete beside a figure, a caption or a code block (display math, verbatim, raw source, a
// Typst figure's code) goes into it, where ProseMirror would join the text into it or pour it into the text
import { Selection, type EditorState, type Transaction } from 'prosemirror-state';
import type { Node, ResolvedPos } from 'prosemirror-model';

const GUARDED = new Set(['image']);
const CAPTIONS = new Set(['float_caption', 'figure_caption', 'table_caption', 'typ_figure_caption']);

/** the position of the boundary between the cursor's textblock and the block before it, when the
 *  cursor sits at the very start of its textblock (mirrors prosemirror-commands' findCutBefore) */
function cutBefore($pos: ResolvedPos): ResolvedPos | null {
	if (!$pos.parent.type.spec.isolating)
		for (let i = $pos.depth - 1; i >= 0; i--) {
			if ($pos.index(i) > 0) return $pos.doc.resolve($pos.before(i + 1));
			if ($pos.node(i).type.spec.isolating) break;
		}
	return null;
}

function cutAfter($pos: ResolvedPos): ResolvedPos | null {
	if (!$pos.parent.type.spec.isolating)
		for (let i = $pos.depth - 1; i >= 0; i--) {
			const parent = $pos.node(i);
			if ($pos.index(i) + 1 < parent.childCount) return $pos.doc.resolve($pos.after(i + 1));
			if (parent.type.spec.isolating) break;
		}
	return null;
}

/** the textblock a join would reach at the block's edge, as prosemirror-commands' joinTextblocksAround walks */
function edgeTextblock(block: Node, side: 'start' | 'end'): Node | null {
	for (let at: Node | null = block; at; at = side === 'start' ? at.firstChild : at.lastChild) {
		if (at.isTextblock) return at;
		if (at.type.spec.isolating) return null;
	}
	return null;
}

/** a caption keeps to its figure: the text outside is never joined into it */
function leavesCaption($cursor: ResolvedPos, $cut: ResolvedPos): boolean {
	const own = $cursor.parent.type.name;
	return GUARDED.has(own) || (CAPTIONS.has(own) && $cut.depth < $cursor.depth - 1);
}

function isGuarded(block: Node, side: 'start' | 'end'): boolean {
	const edge = edgeTextblock(block, side);
	return GUARDED.has(block.type.name) || !!edge?.type.spec.code || CAPTIONS.has(edge?.type.name ?? '');
}

// where the arrow key would go: a figure or a formula selected, the caret at the code's facing edge
function selectBeside(state: EditorState, $cursor: ResolvedPos, $cut: ResolvedPos, dir: -1 | 1, dispatch: (tr: Transaction) => void) {
	const tr = state.tr;
	const emptyLine = $cursor.parent.content.size === 0 && $cursor.parent.type === state.schema.nodes.paragraph;
	if (emptyLine && $cut.depth === $cursor.depth - 1) tr.delete($cursor.before(), $cursor.after());
	const landing = Selection.findFrom(tr.doc.resolve(tr.mapping.map($cut.pos, dir)), dir);
	if (landing) dispatch(tr.setSelection(landing).scrollIntoView());
}

export function selectFigureBackward(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const { $cursor } = state.selection as { $cursor?: ResolvedPos | null };
	if (!$cursor || $cursor.parentOffset > 0 || $cursor.parent.type.spec.code) return false;
	const $cut = cutBefore($cursor);
	const before = $cut?.nodeBefore;
	if ($cut && leavesCaption($cursor, $cut)) return true;
	if (!$cut || !before || !isGuarded(before, 'end')) return false;
	if (dispatch) selectBeside(state, $cursor, $cut, -1, dispatch);
	return true;
}

export function selectFigureForward(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const { $cursor } = state.selection as { $cursor?: ResolvedPos | null };
	if (!$cursor || $cursor.parentOffset < $cursor.parent.content.size || $cursor.parent.type.spec.code) return false;
	const $cut = cutAfter($cursor);
	const after = $cut?.nodeAfter;
	if ($cut && leavesCaption($cursor, $cut)) return true;
	if (!$cut || !after || !isGuarded(after, 'start')) return false;
	if (dispatch) selectBeside(state, $cursor, $cut, 1, dispatch);
	return true;
}
