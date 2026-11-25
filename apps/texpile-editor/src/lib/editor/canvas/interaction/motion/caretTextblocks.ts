// the textblocks a native move walks: the one holding the head and the next one in a direction that takes a caret
import type { Node as PMNode, ResolvedPos } from 'prosemirror-model';
import { blockRoleOf, blockStopFrom } from '../../caret/blockStops';
import type { VisualView } from '../../contracts/viewTypes';

export type HeldTextblock = { readonly pos: number; readonly node: PMNode };

/** the textblock holding a position, also from inside an inline node with content (a raw chip) */
export function textblockAround($pos: ResolvedPos): HeldTextblock | null {
	for (let depth = $pos.depth; depth > 0; depth--)
		if ($pos.node(depth).isTextblock) return { pos: $pos.before(depth), node: $pos.node(depth) };
	return null;
}

export function contentEdge(textblock: HeldTextblock, dir: -1 | 1): number {
	return dir < 0 ? textblock.pos + 1 : textblock.pos + textblock.node.nodeSize - 1;
}

/** the facing edge of the first textblock from `from`, a position between blocks, in `dir` that takes the head: the caret
 *  engine's first text stop, past the blocks it selects whole. A range's end stands only in text */
export function caretEdgeFrom(view: VisualView, from: number, dir: -1 | 1, extend = false): number | null {
	const { doc } = view.state;
	for (let at = from, gap = -1; ;) {
		const stop = blockStopFrom(view, at, dir, { extend, enterTables: true }, gap);
		if (!stop) return null;
		if (stop.kind === 'text') return stop.pos;
		gap = stop.kind === 'gap' ? stop.pos : -1;
		if (stop.kind === 'gap') {
			at = stop.pos;
			continue;
		}
		const node = doc.nodeAt(stop.pos)!;
		// a selected figure's caption is the text past it
		if (dir > 0 && blockRoleOf(view, node) === 'captioned') return stop.pos + 1;
		at = dir > 0 ? stop.pos + node.nodeSize : stop.pos;
	}
}

/** the facing edge of the next textblock past `textblock` that takes a caret (a formula or a drawn block is passed) */
export function facingEdgeBeyond(view: VisualView, textblock: HeldTextblock, dir: -1 | 1, extend: boolean): number | null {
	return caretEdgeFrom(view, dir > 0 ? textblock.pos + textblock.node.nodeSize : textblock.pos, dir, extend);
}
