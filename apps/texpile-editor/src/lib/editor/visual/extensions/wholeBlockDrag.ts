// a text selection that covers a block's whole text drags as the block, the way a ctrl-click node
// selection does: the drop cursor runs between blocks and the drop can land after the last one,
// instead of the text merging into whichever paragraph is under the pointer
import { NodeSelection, Plugin, PluginKey, TextSelection, type Selection } from 'prosemirror-state';

export const wholeBlockDragKey = new PluginKey('whole-block-drag');

// a caption, a note or a term title is part of its float or list and stays where it is
export const PLAIN_BLOCKS = new Set(['paragraph', 'heading']);

/** the position before the block whose entire text `selection` covers, if its parent can do without it */
export function wholeBlockOf(selection: Selection): number | null {
	if (!(selection instanceof TextSelection) || selection.empty) return null;
	const { $from, $to } = selection;
	if (!$from.sameParent($to) || !PLAIN_BLOCKS.has($from.parent.type.name)) return null;
	if ($from.parentOffset !== 0 || $to.parentOffset !== $to.parent.content.size) return null;
	const index = $from.index($from.depth - 1);
	return $from.node($from.depth - 1).canReplace(index, index + 1) ? $from.before() : null;
}

export function wholeBlockDragPlugin(): Plugin {
	return new Plugin({
		key: wholeBlockDragKey,
		props: {
			handleDOMEvents: {
				dragstart(view) {
					const pos = wholeBlockOf(view.state.selection);
					if (pos !== null) view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
					return false;
				}
			}
		}
	});
}
