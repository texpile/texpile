// the caret engine's stream (7.1): every place a key can leave the caret between blocks, in document order, from the caret
// policy of each block's view. Every block crossing asks it, so a block is passed, selected or entered the same way by
// every key, a click's neighbor and a collaborator's caret
import { NodeSelection, Selection, TextSelection } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import type { Node as PMNode, ResolvedPos } from 'prosemirror-model';
import type { VisualView } from '../contracts/viewTypes';
import { caretPolicyOf } from '../geometry/caretPolicy';
import { ISLANDS } from '../islands/islandCode';

/** text: a caret at a textblock's edge. node: a block selected whole. gap: a gap cursor between blocks */
export type BlockStop = { readonly kind: 'text' | 'node' | 'gap'; readonly pos: number };

/**
 * how the caret meets a block. text: it walks the block's text. whole: one stop, the block selected. captioned: the block
 * selected, then its caption's text. island: its source text, which a range passes whole. container: its children
 */
export type BlockRole = 'text' | 'whole' | 'captioned' | 'island' | 'container';

/** `extend`: the far end of a range, which stands only in text and passes a figure whole. `enterTables`: a range that
 *  goes into a table's cells (a word move, Ctrl+End), where Shift+arrows take the table whole */
export type StopQuery = { readonly extend?: boolean; readonly enterTables?: boolean };

// GapCursor.valid is real at runtime but @internal in the typings; lineParagraph.ts widens it for line chips
function gapValid($pos: ResolvedPos): boolean {
	return (GapCursor as unknown as { valid($pos: ResolvedPos): boolean }).valid($pos);
}

/** a textblock holding nothing but chips on lines of their own (\appendix, \medskip): the first such chip from `dir` */
function lineChipAtEdge(view: VisualView, node: PMNode, pos: number, dir: -1 | 1): number | null {
	let edge: { child: PMNode; offset: number } | null = null;
	node.forEach((child, offset) => {
		if (child.isText && !child.text!.trim()) return;
		if (dir < 0 || !edge) edge = { child, offset };
	});
	const found = edge as { child: PMNode; offset: number } | null;
	return found && !found.child.isText && caretPolicyOf(view, found.child) === 'ownLine' ? pos + 1 + found.offset : null;
}

export function blockRoleOf(view: VisualView, node: PMNode): BlockRole {
	const policy = caretPolicyOf(view, node);
	if (node.isTextblock) {
		// an atom whose own view shows its text is a figure and its caption; one with no caption has no text to go on into
		const shown = policy === 'caption' || (policy === 'text' && !!view.props.nodeViews?.[node.type.name]);
		if (node.isAtom) return shown && node.content.size ? 'captioned' : 'whole';
		if (policy === 'island') return 'island';
		// a code or raw block laid out as text is its source; one drawn as a card is whole
		if (policy === 'text') return ISLANDS.has(node.type.name) ? 'island' : 'text';
		return 'whole';
	}
	if (node.isLeaf || node.isAtom || policy === 'formula' || policy === 'drawnBlock') return 'whole';
	return 'container';
}

/** text a key meets first past `$pos` in `dir`, looking into containers down to their first block: a gap with text beyond
 *  it is no stop, as the gap between two slides whose titles are text */
function textBeyond(view: VisualView, $from: ResolvedPos, dir: -1 | 1): boolean {
	let $pos = $from;
	// at a container's end what follows the container is beyond
	while (!(dir > 0 ? $pos.nodeAfter : $pos.nodeBefore) && $pos.depth > 0) $pos = $pos.doc.resolve(dir > 0 ? $pos.after() : $pos.before());
	let node = dir > 0 ? $pos.nodeAfter : $pos.nodeBefore;
	let pos = dir > 0 ? $pos.pos : $pos.pos - (node?.nodeSize ?? 0);
	while (node && !node.type.spec.createGapCursor && blockRoleOf(view, node) === 'container') {
		const child: PMNode | null = dir > 0 ? node.firstChild : node.lastChild;
		pos = dir > 0 ? pos + 1 : pos + node.nodeSize - 1 - (child?.nodeSize ?? 0);
		node = child;
	}
	if (!node || node.type.spec.createGapCursor) return false;
	const role = blockRoleOf(view, node);
	return (role === 'text' || role === 'island') && lineChipAtEdge(view, node, pos, dir) === null;
}

function edgeOf(node: PMNode, pos: number, dir: -1 | 1): number {
	return dir > 0 ? pos + 1 : pos + node.nodeSize - 1;
}

/** the stop a block that `dir` meets at `pos` gives, or null when the walk goes on past or into it */
function stopIn(view: VisualView, node: PMNode, pos: number, dir: -1 | 1, query: StopQuery): BlockStop | 'enter' | null {
	const extend = !!query.extend;
	const role = blockRoleOf(view, node);
	// a range meets a table whole: prosemirror-tables would cut it back to the cells it touches
	if (extend && !query.enterTables && node.type.spec.tableRole === 'table') return null;
	if (role === 'container') return 'enter';
	if (role === 'text') {
		const chip = lineChipAtEdge(view, node, pos, dir);
		if (chip !== null && !extend) return { kind: 'node', pos: chip };
		return { kind: 'text', pos: edgeOf(node, pos, dir) };
	}
	if (role === 'captioned') {
		// a range passes a figure whole; forward the figure is selected before its caption, back its caption comes first
		if (extend) return null;
		return dir < 0 ? { kind: 'text', pos: edgeOf(node, pos, dir) } : { kind: 'node', pos };
	}
	if (extend) return null;
	if (role === 'island') return { kind: 'text', pos: edgeOf(node, pos, dir) };
	return NodeSelection.isSelectable(node) ? { kind: 'node', pos } : null;
}

/**
 * the first stop from `from`, a place between blocks, in `dir`. `skipGapAt` is a gap the caret stands on, which is not a
 * stop again. Null past the document's edge
 */
export function blockStopFrom(view: VisualView, from: number, dir: -1 | 1, query: StopQuery = {}, skipGapAt = -1): BlockStop | null {
	const { doc } = view.state;
	const extend = !!query.extend;
	let $at = doc.resolve(from);
	for (;;) {
		if (!extend && $at.pos !== skipGapAt && !$at.parent.inlineContent && gapValid($at) && !textBeyond(view, $at, dir))
			return { kind: 'gap', pos: $at.pos };
		const node = dir > 0 ? $at.nodeAfter : $at.nodeBefore;
		if (!node) {
			if ($at.depth === 0) return null;
			$at = doc.resolve(dir > 0 ? $at.after() : $at.before());
			continue;
		}
		const pos = dir > 0 ? $at.pos : $at.pos - node.nodeSize;
		const stop = stopIn(view, node, pos, dir, query);
		if (stop === 'enter') $at = doc.resolve(dir > 0 ? pos + 1 : pos + node.nodeSize - 1);
		else if (stop) return stop;
		else $at = doc.resolve(dir > 0 ? pos + node.nodeSize : pos);
	}
}

/** the stop past the block the selection is in or on, in `dir`: the first one a key that leaves it reaches */
export function stopBeyond(view: VisualView, selection: Selection, dir: -1 | 1, query: StopQuery = {}): BlockStop | null {
	if (selection instanceof GapCursor) return blockStopFrom(view, selection.head, dir, query, selection.head);
	if (selection instanceof NodeSelection) {
		const { node, from, to } = selection;
		// a selected figure goes on into its caption
		if (dir > 0 && node.isTextblock && blockRoleOf(view, node) === 'captioned') return { kind: 'text', pos: from + 1 };
		return blockStopFrom(view, dir > 0 ? to : from, dir, query);
	}
	// a range moves from its head, as a caret does
	const $edge = selection.$head;
	for (let depth = $edge.depth; depth > 0; depth--) {
		const node = $edge.node(depth);
		if (!node.isTextblock) continue;
		const pos = $edge.before(depth);
		// back from a caption's start the figure it belongs to is selected
		if (dir < 0 && !query.extend && blockRoleOf(view, node) === 'captioned') return { kind: 'node', pos };
		return blockStopFrom(view, dir > 0 ? pos + node.nodeSize : pos, dir, query);
	}
	return blockStopFrom(view, $edge.pos, dir, query);
}

/** the document's first (dir 1) or last (dir -1) stop */
export function documentStop(view: VisualView, dir: -1 | 1, query: StopQuery = {}): BlockStop | null {
	return blockStopFrom(view, dir > 0 ? 0 : view.state.doc.content.size, dir, query);
}

export function selectionOfStop(view: VisualView, stop: BlockStop): Selection {
	const { doc } = view.state;
	if (stop.kind === 'node') return NodeSelection.create(doc, stop.pos);
	if (stop.kind === 'gap') return new GapCursor(doc.resolve(stop.pos));
	return TextSelection.create(doc, stop.pos);
}
