import type { EditorState } from 'prosemirror-state';
import type { MarkType } from 'prosemirror-model';

export function markIsActive(state: EditorState, type: MarkType): boolean {
	const { from, to, empty } = state.selection;
	if (empty) return !!type.isInSet(state.storedMarks || state.selection.$head.marks());
	return state.doc.rangeHasMark(from, to, type);
}

/** color attr of the first `type` mark in the selection, else null. rangeHasMark only returns a boolean, so scan nodes for the mark instance (reading .attrs off the boolean froze the whole UI). */
export function activeMarkColor(state: EditorState, type: MarkType): string | null {
	const { from, to, empty } = state.selection;
	if (empty) {
		const mark = type.isInSet(state.storedMarks || state.selection.$head.marks());
		return mark ? mark.attrs.color : null;
	}
	let color: string | null = null;
	state.doc.nodesBetween(from, to, (node) => {
		if (color !== null) return false;
		const mark = type.isInSet(node.marks);
		if (mark) color = mark.attrs.color;
	});
	return color;
}
