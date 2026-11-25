// an inline flow split around its block-level objects; a line chip alone in its paragraph is one line (4.7)
import type { InlineObject, InlinePiece } from './inlineContent';
import { isBlockLevel } from './lineBoxes';

export type FlowPart =
	| { readonly kind: 'flow'; readonly pieces: readonly InlinePiece[] }
	/** alone: the paragraph's only child, a full-width box aligned to the top of a line of its own with the strut */
	| { readonly kind: 'block'; readonly object: InlineObject; readonly alone: boolean };

export function isBlockObject(piece: InlinePiece): piece is InlineObject {
	return piece.kind === 'object' && isBlockLevel(piece.style.layout);
}

/** flows with something on them and the blocks between them: a line chip ends the line before it, and none follows it empty */
export function splitAroundBlocks(pieces: readonly InlinePiece[]): FlowPart[] {
	const blocks = pieces.filter(isBlockObject);
	if (!blocks.length) return [{ kind: 'flow', pieces }];
	const content = pieces.filter((piece) => piece.kind !== 'generated');
	if (content.length === 1 && blocks.length === 1) return [{ kind: 'block', object: blocks[0], alone: true }];
	const parts: FlowPart[] = [];
	let flow: InlinePiece[] = [];
	function endFlow(): void {
		if (flow.some((piece) => piece.kind !== 'generated')) parts.push({ kind: 'flow', pieces: flow });
		flow = [];
	}
	for (const piece of pieces) {
		if (!isBlockObject(piece)) {
			flow.push(piece);
			continue;
		}
		endFlow();
		parts.push({ kind: 'block', object: piece, alone: false });
	}
	endFlow();
	return parts;
}
