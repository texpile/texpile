// where a drag's head goes for what the pointer is over
import { Selection } from 'prosemirror-state';
import type { Node as PMNode, ResolvedPos } from 'prosemirror-model';
import type { CanvasHit, CaretPlace } from '../../contracts/geometryTypes';

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
