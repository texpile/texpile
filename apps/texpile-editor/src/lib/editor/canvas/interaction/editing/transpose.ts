// macOS Ctrl+T: the characters either side of the caret swap, or the two before it at a paragraph's end
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { Fragment } from 'prosemirror-model';
import type { CanvasGeometry } from '../../contracts/geometryTypes';

function onlyText(fragment: Fragment): boolean {
	let text = true;
	fragment.forEach((node) => (text &&= node.isText));
	return text;
}

export function transposeTr(state: EditorState, geometry: CanvasGeometry): Transaction | null {
	const { selection, doc } = state;
	if (!(selection instanceof TextSelection) || !selection.empty || !selection.$head.parent.inlineContent) return null;
	const { head, $head } = selection;
	const stops = geometry.stopsOf($head.before()).positions;
	const at = stops.indexOf(head);
	if (at < 0) return null;
	const [from, mid, to] = at === stops.length - 1 ? [stops[at - 2], stops[at - 1], head] : [stops[at - 1], head, stops[at + 1]];
	if (from === undefined || mid === undefined || to === undefined) return null;
	if (!onlyText(doc.slice(from, to).content)) return null;
	const [first, second] = [doc.resolve(from).nodeAfter!, doc.resolve(mid).nodeAfter!];
	const { schema } = state;
	const swapped = [schema.text(doc.textBetween(mid, to), second.marks), schema.text(doc.textBetween(from, mid), first.marks)];
	const tr = state.tr.replaceWith(from, to, swapped);
	return tr.setSelection(TextSelection.create(tr.doc, to));
}
