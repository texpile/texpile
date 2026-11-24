import { TextSelection } from 'prosemirror-state';
import type { VisualView } from '../contracts/viewTypes';

/** a chip clicked from a caret elsewhere takes the caret to just after it, so closing its panel leaves the writer at the chip */
export function caretToChip(view: VisualView, pos: number): void {
	const { selection, doc } = view.state;
	const node = doc.nodeAt(pos);
	if (!node) return;
	const end = pos + node.nodeSize;
	if (selection.from >= pos && selection.to <= end) return;
	view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, end)));
}
