// the math in a title block ($^{1}$ beside a name, $\mu$ in a title), typeset as it is in a paragraph
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { renderStaticMath } from '$lib/editor/visual/extensions/mathlivebridge/mathStatic';
import type { Piece } from '$lib/languages/latex/parser/tree/walk/pieceCursor';
import { isInlineMath } from '../parts/inlineMath';
import { bodyOf } from '$lib/languages/latex/parser/tree/walk/stretch';

export function titleMath(piece: Piece, src: string): ChipFace | null {
	if (piece.kind !== 'node' || !isInlineMath(piece.node.name)) return null;
	const body = bodyOf(piece.node);
	return { dom: renderStaticMath(src.slice(body.from, body.to), false) };
}
