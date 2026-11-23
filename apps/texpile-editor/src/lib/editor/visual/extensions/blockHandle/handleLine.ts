// the height the handle stands at beside a block: level with its first line, as Notion's does
import type { EditorView } from 'prosemirror-view';
import { caretPolicyAt } from '$lib/editor/canvas';

const TEXT_LINE = 28;
// a first line further down than this is no first line: a label inside a drawing, say
const FIRST_LINE_WITHIN = 48;

/** the middle of the block's first line; a display formula has no line of text, and takes its own middle */
export function handleLineMiddle(view: EditorView, pos: number, block: DOMRect): number {
	const node = view.state.doc.nodeAt(pos);
	if (!node || (node.isBlock && caretPolicyAt(view, pos) === 'formula')) return (block.top + block.bottom) / 2;
	const line = view.canvas.rangeClientRects(pos, pos + node.nodeSize, 'text').find((rect) => rect.height > 0);
	const middle = line ? (line.top + line.bottom) / 2 : null;
	if (middle !== null && middle - block.top <= FIRST_LINE_WITHIN) return middle;
	return block.top + Math.min(block.height, TEXT_LINE) / 2;
}
