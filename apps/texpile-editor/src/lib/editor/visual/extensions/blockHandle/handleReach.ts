// whether the pointer still belongs to the block the handle stands on
type Span = { top: number; bottom: number };

// the pointer overshoots a 22px button by a little on its way in
const SLACK = 4;

/**
 * True beside the block in a gutter, where the hand is on its way to the buttons, and over or under the block as far
 * as the buttons reach, where a short block's buttons sit level with the blocks around it.
 * `text`: the editor's column; `buttons`: the handle's buttons from the top of the first to the foot of the last
 */
export function pointerStaysWithBlock(
	pointer: { x: number; y: number },
	text: { left: number; right: number },
	block: Span,
	buttons: Span
): boolean {
	const top = Math.min(block.top, buttons.top) - SLACK;
	const bottom = Math.max(block.bottom, buttons.bottom) + SLACK;
	if (pointer.y < top || pointer.y > bottom) return false;
	if (pointer.x < text.left || pointer.x > text.right) return true;
	return pointer.y < block.top || pointer.y > block.bottom;
}

/**
 * The top of the handle's buttons: the first one level with the block's first line, and a column of them taller than
 * its block centered on it, so it hangs as far over the block before as over the one after.
 * `line`: the middle of the first line; `height`: of all the buttons; `button`: of one
 */
export function handleTop(line: number, block: Span, height: number, button: number): number {
	return Math.min(line - button / 2, (block.top + block.bottom - height) / 2);
}
