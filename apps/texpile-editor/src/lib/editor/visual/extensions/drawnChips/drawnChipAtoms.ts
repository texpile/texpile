// atoms only while drawn: comments and suggestions read the schema's atoms as having no text
import { NodeSelection, Plugin, Selection, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { Node, ResolvedPos } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { GapCursor } from 'prosemirror-gapcursor';
import type { VisualView } from '$lib/editor/canvas';
import { chipShows, drawnChipOf } from './chipShows';
import { openDrawnChip } from './drawnChipView';
import { isLineParagraph, lineChipAtEdge } from '$lib/editor/visual/lineParagraph';
import { gapCursorAt } from '$lib/editor/visual/gapSelection';

type Side = -1 | 1;

function select(view: EditorView, tr: Transaction): true {
	view.dispatch(tr.scrollIntoView());
	return true;
}

/** the drawn chip across the block edge at `$edge`: a chip block, or a chip on a line of its own the textblock there
 *  meets the key with */
function chipAcross(state: EditorState, $edge: ResolvedPos, side: Side): { node: Node; pos: number } | null {
	const node = side < 0 ? $edge.nodeBefore : $edge.nodeAfter;
	const pos = side < 0 ? $edge.pos - (node?.nodeSize ?? 0) : $edge.pos;
	const chip = lineChipAtEdge(node, pos, side);
	if (chip !== null) return { node: state.doc.nodeAt(chip)!, pos: chip };
	return node && drawnChipOf(node) ? { node, pos } : null;
}

/** the drawn chip beside an empty caret, inline in its line or the block across its textblock's edge */
function chipBeside(state: EditorState, side: Side): { node: Node; pos: number } | null {
	const { selection } = state;
	if (selection instanceof GapCursor) return chipAcross(state, selection.$head, side);
	if (!(selection instanceof TextSelection) || !selection.empty) return null;
	const $head = selection.$head;
	const inline = side < 0 ? $head.nodeBefore : $head.nodeAfter;
	if (inline && drawnChipOf(inline)) return { node: inline, pos: side < 0 ? $head.pos - inline.nodeSize : $head.pos };
	if ($head.depth === 0) return null;
	const atEdge = side < 0 ? $head.parentOffset === 0 : $head.parentOffset === $head.parent.content.size;
	if (!atEdge) return null;
	return chipAcross(state, state.doc.resolve(side < 0 ? $head.before() : $head.after()), side);
}

function selectedChip(state: EditorState) {
	const { selection } = state;
	return selection instanceof NodeSelection ? drawnChipOf(selection.node) : null;
}

/** a selected figure card opens its figure, as Edit figure in the bar over it does */
function openFigureCard(view: EditorView): boolean {
	const { selection } = view.state;
	if (!(selection instanceof NodeSelection) || chipShows(selection.node) !== 'figure-card') return false;
	const [edit] = (view as unknown as VisualView).canvas.blockActions(selection.from);
	edit?.run();
	return !!edit;
}

function onKey(view: EditorView, event: KeyboardEvent): boolean {
	if (event.isComposing) return false;
	if (event.ctrlKey || event.metaKey || event.altKey) return false;
	const { state } = view;
	const side: Side = event.key === 'Backspace' ? -1 : 1;
	switch (event.key) {
		case 'Enter': {
			if (event.shiftKey) return false;
			if (!selectedChip(state)) return openFigureCard(view);
			openDrawnChip(view, state.selection.from);
			return true;
		}
		case 'Backspace':
		case 'Delete': {
			if (event.shiftKey) return false;
			const beside = chipBeside(state, side);
			if (!beside) return false;
			// a letter goes at once; anything bigger is selected first, so one key never takes a footnote's whole text
			if (drawnChipOf(beside.node)?.character) return select(view, state.tr.delete(beside.pos, beside.pos + beside.node.nodeSize));
			return select(view, state.tr.setSelection(NodeSelection.create(state.doc, beside.pos)));
		}
	}
	return false;
}

function chipAround($pos: ResolvedPos): { from: number; to: number } | null {
	return $pos.depth > 0 && drawnChipOf($pos.parent) ? { from: $pos.before(), to: $pos.after() } : null;
}

// a caret placed inside a drawn chip's text (a search match, a caret moved near it) takes the chip whole. A range that
// ends there, as a drag onto the chip does, takes the chip into the range: selecting the chip alone dropped the drag
function withWholeChips(state: EditorState): Selection | null {
	const { selection, doc } = state;
	if (!(selection instanceof TextSelection)) return null;
	const [anchorIn, headIn] = [chipAround(selection.$anchor), chipAround(selection.$head)];
	if (!anchorIn && !headIn) return null;
	if (anchorIn && headIn && anchorIn.from === headIn.from) return NodeSelection.create(doc, headIn.from);
	const forward = selection.head > selection.anchor;
	const anchor = anchorIn ? (forward ? anchorIn.from : anchorIn.to) : selection.anchor;
	const head = headIn ? (forward ? headIn.to : headIn.from) : selection.head;
	return TextSelection.create(doc, anchor, head);
}

// a caret at the edge of a line paragraph (a click above \appendix) is the gap beside it, where one is. One after a chip
// on a line of its own that ends its textblock has no line to stand on (End on the line before \appendix): Chrome drew
// it at the end of the divider. It goes to the line before the chip, or past a line paragraph
function caretOffLineEdge(state: EditorState): Selection | null {
	const { selection, doc } = state;
	if (!(selection instanceof TextSelection) || !selection.empty) return null;
	const { $head } = selection;
	if ($head.depth === 0) return null;
	const atEnd = $head.parentOffset === $head.parent.content.size;
	if (isLineParagraph($head.parent)) {
		if ($head.parentOffset === 0) return gapCursorAt(doc.resolve($head.before()));
		if (!atEnd) return null;
		const $after = doc.resolve($head.after());
		return gapCursorAt($after) ?? Selection.findFrom($after, 1);
	}
	const chip = $head.nodeBefore;
	return atEnd && chip && drawnChipOf(chip)?.ownLine ? TextSelection.create(doc, $head.pos - chip.nodeSize) : null;
}

export function drawnChipAtomsPlugin(): Plugin {
	return new Plugin({
		props: { handleKeyDown: onKey },
		appendTransaction(transactions, _old, state) {
			if (!transactions.some((tr) => tr.selectionSet || tr.docChanged)) return null;
			const whole = withWholeChips(state) ?? caretOffLineEdge(state);
			return whole && state.tr.setSelection(whole);
		}
	});
}
