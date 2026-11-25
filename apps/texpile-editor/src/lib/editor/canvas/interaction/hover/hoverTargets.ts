// what a hit says about the pointer's place in the document (11.7): the node it is over and the blocks the chrome belongs to
import type { Node as PMNode } from 'prosemirror-model';
import type { HoverState } from '../../contracts/inputTypes';
import type { CanvasHit } from '../../contracts/geometryTypes';

function placeIn(doc: PMNode, pos: number): { blockFor: number | null; tableFor: number | null } {
	if (pos < 0 || pos > doc.content.size) return { blockFor: null, tableFor: null };
	const $pos = doc.resolve(pos);
	let tableFor: number | null = null;
	for (let depth = $pos.depth; depth >= 1 && tableFor === null; depth--)
		if ($pos.node(depth).type.spec.tableRole === 'table') tableFor = $pos.before(depth);
	const blockFor = $pos.depth >= 1 ? $pos.before(1) : $pos.nodeAfter ? pos : null;
	return { blockFor, tableFor };
}

export function hoverStateOf(hit: CanvasHit | null, doc: PMNode): HoverState {
	if (!hit) return { chain: [], pos: null, part: null, blockFor: null, tableFor: null };
	const target = hit.target.kind === 'cell' ? hit.target.inner : hit.target;
	const { blockFor, tableFor } = placeIn(doc, hit.inside > -1 ? hit.inside : hit.pos);
	return {
		chain: hit.chain,
		pos: hit.inside > -1 ? hit.inside : null,
		part: target.kind === 'facePart' ? target.part : null,
		blockFor,
		tableFor
	};
}

export function sameHover(a: HoverState, b: HoverState): boolean {
	return a.chain[0] === b.chain[0] && a.pos === b.pos && a.part === b.part && a.blockFor === b.blockFor && a.tableFor === b.tableFor;
}
