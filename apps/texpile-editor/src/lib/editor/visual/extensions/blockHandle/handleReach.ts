// whether the pointer still belongs to the block the handle stands on
type Span = { top: number; bottom: number };

// the pointer overshoots a 22px button by a little on its way in
const SLACK = 4;

/**
 * True beside the block in a gutter, where the hand is on its way to the buttons, and under the block as far down as
 * the buttons hang, where a short block's gear sits level with the next block.
 * `text`: the editor's column; `buttonsBottom`: the foot of the handle's lowest button
 */
export function pointerStaysWithBlock(
	pointer: { x: number; y: number },
	text: { left: number; right: number },
	block: Span,
	buttonsBottom: number
): boolean {
	const bottom = Math.max(block.bottom, buttonsBottom) + SLACK;
	if (pointer.x < text.left || pointer.x > text.right) return pointer.y >= block.top - SLACK && pointer.y <= bottom;
	return pointer.y > block.bottom && pointer.y <= bottom;
}
