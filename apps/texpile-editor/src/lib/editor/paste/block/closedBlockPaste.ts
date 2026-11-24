import { Slice, type Node as PMNode } from 'prosemirror-model';
import { TextSelection, type EditorState } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import { PLAIN_BLOCKS } from '$lib/editor/visual/extensions/wholeBlockDrag';

function closedBlockOf(slice: Slice): PMNode | null {
	const { content, openStart, openEnd } = slice;
	const block = content.firstChild;
	return openStart === 0 && openEnd === 0 && content.childCount === 1 && block && PLAIN_BLOCKS.has(block.type.name) ? block : null;
}

function holdsBlockAt(state: EditorState, block: PMNode): boolean {
	const { selection } = state;
	if (selection instanceof GapCursor) return true;
	const { $from } = selection;
	if (!selection.empty || !PLAIN_BLOCKS.has($from.parent.type.name) || $from.depth === 0) return false;
	const parent = $from.node($from.depth - 1);
	const index = $from.index($from.depth - 1);
	const atStart = $from.parentOffset === 0;
	const atEnd = $from.parentOffset === $from.parent.content.size;
	if (atStart && atEnd && $from.parent.type.name === 'paragraph') return parent.canReplaceWith(index, index + 1, block.type);
	if (atStart) return parent.canReplaceWith(index, index, block.type);
	return atEnd && parent.canReplaceWith(index + 1, index + 1, block.type);
}

/** a closed paragraph or heading from a Texpile copy keeps its block where it can land beside one, else it is the text of the block */
export function closedBlockPasteSlice(state: EditorState, slice: Slice): Slice {
	const block = closedBlockOf(slice);
	if (!block || !(state.selection instanceof TextSelection || state.selection instanceof GapCursor)) return slice;
	return holdsBlockAt(state, block) ? slice : new Slice(block.content, 0, 0);
}
