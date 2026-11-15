// atoms only while drawn: comments and suggestions read the schema's atoms as having no text
import { NodeSelection, Plugin, Selection, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { Node, ResolvedPos } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { drawnChipOf } from './DrawnChipView';
import { landBesideOldWords, oldWordsAhead } from '$lib/editor/visual/extensions/pmOldWordsCaret';
import { isMac } from '$lib/platform';

type Side = -1 | 1;

function select(view: EditorView, tr: Transaction): true {
	view.dispatch(tr.scrollIntoView());
	return true;
}

/** the drawn chip beside an empty caret, inline in its line or the block across its textblock's edge */
function chipBeside(state: EditorState, side: Side): { node: Node; pos: number } | null {
	const { selection } = state;
	if (!(selection instanceof TextSelection) || !selection.empty) return null;
	const $head = selection.$head;
	const inline = side < 0 ? $head.nodeBefore : $head.nodeAfter;
	if (inline && drawnChipOf(inline)) return { node: inline, pos: side < 0 ? $head.pos - inline.nodeSize : $head.pos };
	if ($head.depth === 0) return null;
	const atEdge = side < 0 ? $head.parentOffset === 0 : $head.parentOffset === $head.parent.content.size;
	if (!atEdge) return null;
	const $edge = state.doc.resolve(side < 0 ? $head.before() : $head.after());
	const node = side < 0 ? $edge.nodeBefore : $edge.nodeAfter;
	return node && drawnChipOf(node) ? { node, pos: side < 0 ? $edge.pos - node.nodeSize : $edge.pos } : null;
}

function inlineChipBeside(state: EditorState, side: Side): { node: Node; pos: number } | null {
	const { selection } = state;
	if (!(selection instanceof TextSelection) || !selection.empty) return null;
	const $head = selection.$head;
	const node = side < 0 ? $head.nodeBefore : $head.nodeAfter;
	if (!node || node.isText || node.type.name === 'inline_math') return null;
	if (!drawnChipOf(node) && !(node.isInline && node.isAtom && NodeSelection.isSelectable(node))) return null;
	return { node, pos: side < 0 ? $head.pos - node.nodeSize : $head.pos };
}

// a chip on a line of its own leaves no place for a caret beside another chip, nor at its paragraph's edge: Chrome took
// the caret to the document's start
function lineChipPast(state: EditorState, side: Side): Selection | null {
	const { selection } = state;
	let past: number;
	let passedLine: boolean;
	if (selection instanceof NodeSelection && selection.node.isInline && drawnChipOf(selection.node)?.ownLine) {
		past = side > 0 ? selection.to : selection.from;
		passedLine = true;
	} else {
		const beside = inlineChipBeside(state, side);
		if (!beside) return null;
		past = side < 0 ? beside.pos : beside.pos + beside.node.nodeSize;
		passedLine = !!drawnChipOf(beside.node)?.ownLine;
	}
	const $past = state.doc.resolve(past);
	const next = side > 0 ? $past.nodeAfter : $past.nodeBefore;
	if (next) {
		if (next.isText || !(passedLine || drawnChipOf(next)?.ownLine) || !NodeSelection.isSelectable(next)) return null;
		return NodeSelection.create(state.doc, side > 0 ? past : past - next.nodeSize);
	}
	return passedLine && $past.depth > 0 ? Selection.findFrom(state.doc.resolve(side > 0 ? $past.after() : $past.before()), side) : null;
}

// up and down beside a chip on a line of its own: the browser put the caret inside the chip, where it shows nowhere,
// and took a few keys to leave it. The chip is selected, and from it the line past it
function lineChipVertical(state: EditorState, side: Side): Selection | null {
	const { selection, doc } = state;
	if (selection instanceof TextSelection && selection.empty) {
		const chip = side < 0 ? selection.$head.nodeBefore : selection.$head.nodeAfter;
		return chip && drawnChipOf(chip)?.ownLine
			? NodeSelection.create(doc, side < 0 ? selection.head - chip.nodeSize : selection.head)
			: null;
	}
	if (!(selection instanceof NodeSelection) || !selection.node.isInline || !drawnChipOf(selection.node)?.ownLine) return null;
	const edge = side < 0 ? selection.from : selection.to;
	const $edge = doc.resolve(edge);
	const next = side < 0 ? $edge.nodeBefore : $edge.nodeAfter;
	if (next?.isText) return TextSelection.create(doc, edge);
	if (next) return NodeSelection.isSelectable(next) ? NodeSelection.create(doc, side < 0 ? edge - next.nodeSize : edge) : null;
	return $edge.depth > 0 ? Selection.findFrom(doc.resolve(side < 0 ? $edge.before() : $edge.after()), side) : null;
}

function onlyWordKey(event: KeyboardEvent): boolean {
	return isMac ? event.altKey && !event.ctrlKey && !event.metaKey : event.ctrlKey && !event.altKey && !event.metaKey;
}

// the browser moves the caret up and down itself, and passes over a chip it cannot put the caret in. The move is kept
// until ProseMirror reads where the caret went; one on a line of its own that the caret passed is selected instead
type VerticalMove = { from: number; side: Side; until: number };
const moving = new WeakMap<EditorView, VerticalMove>();

function passedLine(state: EditorState, move: VerticalMove): number | undefined {
	const { selection, doc } = state;
	if (!(selection instanceof TextSelection) || !selection.empty || (selection.head - move.from) * move.side <= 0) return undefined;
	const low = Math.min(move.from, selection.head);
	const high = Math.max(move.from, selection.head);
	const passed: number[] = [];
	doc.nodesBetween(low, high, (node, pos) => {
		const chip = drawnChipOf(node);
		if (chip?.ownLine && pos >= low && pos + node.nodeSize <= high) passed.push(pos);
		return !chip;
	});
	return move.side > 0 ? passed[0] : passed[passed.length - 1];
}

function stopOnPassedLine(view: EditorView, previous: EditorState): void {
	const move = moving.get(view);
	if (!move || view.state.selection.eq(previous.selection)) return;
	moving.delete(view);
	if (Date.now() > move.until) return;
	const pos = passedLine(view.state, move);
	if (pos === undefined) return;
	queueMicrotask(() => view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)).scrollIntoView()));
}

function blockAcross(view: EditorView, side: Side): { pos: number } | 'end' | null {
	const { selection, doc } = view.state;
	let $edge: ResolvedPos;
	if (selection instanceof NodeSelection) {
		$edge = side > 0 ? selection.$to : selection.$from;
		if (!selection.node.isBlock) {
			const { parent, parentOffset } = $edge;
			if (parentOffset !== (side > 0 ? parent.content.size : 0)) return null;
			$edge = doc.resolve(side > 0 ? $edge.after() : $edge.before());
		}
	} else if (selection instanceof TextSelection && selection.empty && view.endOfTextblock(side > 0 ? 'down' : 'up')) {
		const { $head } = selection;
		let lineBeyond = false;
		$head.parent.forEach((child, offset) => {
			if (drawnChipOf(child)?.ownLine && (side > 0 ? offset >= $head.parentOffset : offset < $head.parentOffset)) lineBeyond = true;
		});
		if (lineBeyond) return null;
		$edge = doc.resolve(side > 0 ? $head.after() : $head.before());
	} else return null;
	// a block ending its container (a chip in \begin{center}) is left toward what the container is beside
	while (!(side > 0 ? $edge.nodeAfter : $edge.nodeBefore) && $edge.depth > 0) {
		$edge = doc.resolve(side > 0 ? $edge.after() : $edge.before());
	}
	const node = side > 0 ? $edge.nodeAfter : $edge.nodeBefore;
	if (!node) return selection instanceof NodeSelection && selection.node.isBlock ? 'end' : null;
	return drawnChipOf(node)?.ownLine ? { pos: side > 0 ? $edge.pos : $edge.pos - node.nodeSize } : null;
}

function selectedChip(state: EditorState) {
	const { selection } = state;
	return selection instanceof NodeSelection ? drawnChipOf(selection.node) : null;
}

function onKey(view: EditorView, event: KeyboardEvent): boolean {
	if (event.isComposing) return false;
	const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
	if ((event.ctrlKey || event.metaKey || event.altKey) && !(horizontal && onlyWordKey(event))) return false;
	const { state } = view;
	const side: Side = event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'Backspace' ? -1 : 1;
	switch (event.key) {
		case 'Enter': {
			const chip = selectedChip(state);
			if (!chip || event.shiftKey) return false;
			chip.openPanel();
			return true;
		}
		case 'ArrowLeft':
		case 'ArrowRight': {
			if (event.shiftKey || oldWordsAhead(state, side > 0)) return false;
			const lineChip = lineChipPast(state, side);
			if (lineChip) return select(view, state.tr.setSelection(lineChip));
			const beside = inlineChipBeside(state, side);
			if (!beside) return false;
			const past = side < 0 ? beside.pos : beside.pos + beside.node.nodeSize;
			return select(view, landBesideOldWords(state, state.tr.setSelection(TextSelection.create(state.doc, past)), past, side > 0));
		}
		case 'ArrowUp':
		case 'ArrowDown': {
			const line = event.shiftKey ? null : lineChipVertical(state, side);
			if (line) return select(view, state.tr.setSelection(line));
			// from the far edge of a selected chip, which is not one the caret passes
			const across = event.shiftKey ? null : blockAcross(view, side);
			if (across) {
				if (across !== 'end') view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, across.pos)).scrollIntoView());
				return true;
			}
			const from = side > 0 ? state.selection.to : state.selection.from;
			if (!event.shiftKey) moving.set(view, { from, side, until: Date.now() + 500 });
			return false;
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

export function drawnChipAtomsPlugin(): Plugin {
	return new Plugin({
		props: { handleKeyDown: onKey },
		view: () => ({ update: stopOnPassedLine }),
		appendTransaction(transactions, _old, state) {
			if (!transactions.some((tr) => tr.selectionSet || tr.docChanged)) return null;
			const whole = withWholeChips(state);
			return whole && state.tr.setSelection(whole);
		}
	});
}
