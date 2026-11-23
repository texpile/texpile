import type { Command, EditorState } from 'prosemirror-state';
import type { DecorationSet } from 'prosemirror-view';

/** Backspace at the start of a heading that prints a number takes the number off first, as Word does with a list */
export function unnumberHeading(numbersOf: (state: EditorState) => DecorationSet | undefined): Command {
	return (state, dispatch) => {
		const { $from, empty } = state.selection;
		const heading = $from.parent;
		if (!empty || $from.parentOffset !== 0 || heading.type.name !== 'heading' || heading.attrs.numbered === false) return false;
		const pos = $from.before();
		const printed = numbersOf(state)
			?.find(pos, pos + heading.nodeSize)
			.some((decoration) => decoration.from === pos && ((decoration.spec as { numbers?: unknown[] }).numbers?.length ?? 0) > 0);
		if (!printed) return false;
		const attrs = { ...heading.attrs, numbered: false, ...('shortTitle' in heading.attrs ? { shortTitle: null } : {}) };
		dispatch?.(state.tr.setNodeMarkup(pos, undefined, attrs).scrollIntoView());
		return true;
	};
}
