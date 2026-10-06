// Shift+arrows across blocks, by hand: the browser stops dead in front of a block it cannot put a
// caret in (display math, code, a raw block, a figure), from a line that starts with a chip it runs
// the selection to the start of the document, and with the other end on a gap cursor it does not
// move at all. Up and Down go one line on, at the column the run of presses started from, and past
// a block's last line onto the next block that takes a caret; Left and Right from a block's edge
// go to the next one's facing edge. A table is crossed whole, since prosemirror-tables cuts back a
// text selection that ends in a cell; inside one it moves the head
import { Plugin, TextSelection } from 'prosemirror-state';
import type { ResolvedPos } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { posOnEdgeLine, posOneLineAway } from '../../caretLines';
import { nextCaretBlock, tableDepth, takesCaret } from './caretBlocks';

/** the start of the table `$pos` is in, -1 outside one */
function tableStart($pos: ResolvedPos): number {
	const depth = tableDepth($pos);
	return depth ? $pos.before(depth) : -1;
}

/** past the table around `$pos` in `dir`, or `pos` itself outside one */
function pastTable($pos: ResolvedPos, pos: number, dir: -1 | 1): number {
	const depth = tableDepth($pos);
	return depth ? (dir > 0 ? $pos.after(depth) : $pos.before(depth)) : pos;
}

/** the text block the head goes to */
function targetBlock(view: EditorView, dir: -1 | 1): number | null {
	const { doc } = view.state;
	const { $head, head } = view.state.selection;
	let from = pastTable($head, $head.parent.inlineContent ? (dir > 0 ? $head.after() : $head.before()) : head, dir);
	for (;;) {
		const blockPos = nextCaretBlock(view, from, dir);
		if (blockPos === null) return null;
		const $in = doc.resolve(blockPos + 1);
		if (!tableDepth($in)) return blockPos;
		from = pastTable($in, blockPos, dir);
	}
}

/**
 * an anchor on a gap cursor (Ctrl+Home before \maketitle) or in a block that takes no caret, moved to
 * the nearest text that does, toward the head: TextSelection.between would put it inside the block,
 * and the browser then moves the whole selection somewhere else
 */
function anchorInText(view: EditorView, $anchor: ResolvedPos, head: number): ResolvedPos {
	if ($anchor.parent.inlineContent && takesCaret(view, $anchor.before())) return $anchor;
	const dir = head >= $anchor.pos ? 1 : -1;
	const from = $anchor.parent.inlineContent ? (dir > 0 ? $anchor.after() : $anchor.before()) : $anchor.pos;
	const blockPos = nextCaretBlock(view, from, dir);
	if (blockPos === null) return $anchor;
	return view.state.doc.resolve(dir > 0 ? blockPos + 1 : blockPos + view.state.doc.nodeAt(blockPos)!.nodeSize - 1);
}

// the column a run of presses keeps to, as the browser's own goal column would
const goal = new WeakMap<EditorView, { head: number; x: number }>();

function verticalTarget(view: EditorView, dir: -1 | 1, inText: boolean): number | null {
	const { state } = view;
	const { $head, head } = state.selection;
	const kept = goal.get(view);
	const x = kept?.head === head ? kept.x : view.coordsAtPos(head).left;
	let target = inText ? posOneLineAway(view, $head.before(), head, dir, x) : null;
	if (target === null) {
		// nothing past the last block: the key is kept, or the browser wraps the selection to the top
		const blockPos = targetBlock(view, dir);
		if (blockPos === null) return head;
		const edge = dir > 0 ? blockPos + 1 : blockPos + state.doc.nodeAt(blockPos)!.nodeSize - 1;
		target = posOnEdgeLine(view, blockPos, dir, x) ?? edge;
	}
	goal.set(view, { head: target, x });
	return target;
}

/** past an inline chip beside `$pos` that the browser cannot step over (a raw command, a citation) */
function pastInlineChip(view: EditorView, $pos: ResolvedPos, dir: -1 | 1): number | null {
	const beside = dir > 0 ? $pos.nodeAfter : $pos.nodeBefore;
	if (!beside?.isInline || beside.isText) return null;
	const at = dir > 0 ? $pos.pos : $pos.pos - beside.nodeSize;
	const dom = view.nodeDOM(at);
	return dom instanceof HTMLElement && !dom.isContentEditable ? (dir > 0 ? at + beside.nodeSize : at) : null;
}

// characters are the browser's; from a block's first or last character it goes to the next block's facing edge
function horizontalTarget(view: EditorView, dir: -1 | 1, inText: boolean): number | null {
	const { $head } = view.state.selection;
	if (inText) {
		const past = pastInlineChip(view, $head, dir);
		if (past !== null) return past;
		if ($head.parentOffset !== (dir > 0 ? $head.parent.content.size : 0)) return null;
	}
	const blockPos = targetBlock(view, dir);
	if (blockPos === null) return $head.pos;
	return dir > 0 ? blockPos + 1 : blockPos + view.state.doc.nodeAt(blockPos)!.nodeSize - 1;
}

const KEYS: Record<string, [axis: 'vertical' | 'horizontal', dir: -1 | 1]> = {
	ArrowUp: ['vertical', -1],
	ArrowDown: ['vertical', 1],
	ArrowLeft: ['horizontal', -1],
	ArrowRight: ['horizontal', 1]
};

function onKey(view: EditorView, event: KeyboardEvent): boolean {
	const key = KEYS[event.key];
	if (!key || !event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return false;
	const [axis, dir] = key;
	const { state } = view;
	const { $anchor, $head } = state.selection;
	const table = tableStart($head);
	if (table >= 0 && table === tableStart($anchor)) return false;
	// Ctrl+Home can leave the head inside a block that takes no caret (\maketitle's chip); it moves on from there
	const inText = table < 0 && $head.parent.inlineContent && takesCaret(view, $head.before());
	let target = axis === 'vertical' ? verticalTarget(view, dir, inText) : horizontalTarget(view, dir, inText);
	if (target === null) return false;
	const $from = anchorInText(view, $anchor, target);
	// from a gap cursor both ends land on the same edge; the press still selects one step
	if ($from.pos === target) target = pastInlineChip(view, $from, dir) ?? target;
	view.dispatch(state.tr.setSelection(TextSelection.between($from, state.doc.resolve(target))).scrollIntoView());
	return true;
}

export function shiftArrowsPlugin(): Plugin {
	return new Plugin({ props: { handleKeyDown: onKey } });
}
