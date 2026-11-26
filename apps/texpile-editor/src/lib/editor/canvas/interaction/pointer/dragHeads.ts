// where a drag's head goes for what the pointer is over
import { Selection } from 'prosemirror-state';
import type { Node as PMNode, ResolvedPos } from 'prosemirror-model';
import type { CanvasHit, CaretPlace } from '../../contracts/geometryTypes';
import type { VisualView } from '../../contracts/viewTypes';
import { takesCaret } from '../../geometry/caretPolicy';

/** a drag's head: over a block drawn whole or past the text, that block's edge under the pointer. The nearest text caret
 *  there can lie lines above it, and the range jumped back and forth across what came between */
export function dragHead(hit: CanvasHit): CaretPlace {
	const { target } = hit;
	const edge =
		target.kind === 'leaf' ||
		target.kind === 'between' ||
		(target.kind === 'formula' && target.display) ||
		(target.kind === 'margin' && (target.side === 'above' || target.side === 'below'));
	return edge ? { pos: hit.pos, affinity: 1 } : hit.caret;
}

function cellOf($pos: ResolvedPos): PMNode | null {
	for (let depth = $pos.depth; depth > 0; depth--) if (/cell/.test($pos.node(depth).type.spec.tableRole ?? '')) return $pos.node(depth);
	return null;
}

/** prosemirror-tables takes a range that ends at the start of a cell's text, from outside the cell, for a triple click and
 *  selects the paragraph it began in: a drag stops at the last place before that cell, which shades the same */
export function beforeCellStart($anchor: ResolvedPos, $head: ResolvedPos): ResolvedPos {
	if ($head.parentOffset > 0 || !$head.parent.isTextblock) return $head;
	const cell = cellOf($head);
	if (!cell || cell === cellOf($anchor)) return $head;
	return Selection.findFrom($head.doc.resolve($head.before()), -1, true)?.$head ?? $head;
}

function textIn(view: VisualView, node: PMNode, from: number, index: number, dir: -1 | 1): number | null {
	if (node.inlineContent) return from;
	let pos = from;
	for (let i = index - (dir > 0 ? 0 : 1); dir > 0 ? i < node.childCount : i >= 0; i += dir) {
		const child = node.child(i);
		if (!child.isAtom || (child.inlineContent && takesCaret(view, dir > 0 ? pos : pos - child.nodeSize))) {
			const inner = textIn(view, child, pos + dir, dir < 0 ? child.childCount : 0, dir);
			if (inner !== null) return inner;
		}
		pos += child.nodeSize * dir;
	}
	return null;
}

/** TextSelection.between's search toward the anchor, entering a figure's caption: it passed every figure, so below the
 *  last one the range jumped back above them all */
export function textHeadToward(view: VisualView, $anchor: ResolvedPos, $head: ResolvedPos): ResolvedPos {
	if ($head.parent.inlineContent) return $head;
	const dir = $head.pos > $anchor.pos ? -1 : 1;
	for (let depth = $head.depth; depth >= 0; depth--) {
		const found =
			depth === $head.depth
				? textIn(view, $head.parent, $head.pos, $head.index(), dir)
				: textIn(
						view,
						$head.node(depth),
						dir < 0 ? $head.before(depth + 1) : $head.after(depth + 1),
						$head.index(depth) + (dir > 0 ? 1 : 0),
						dir
					);
		if (found !== null) return $head.doc.resolve(found);
	}
	return $head;
}
