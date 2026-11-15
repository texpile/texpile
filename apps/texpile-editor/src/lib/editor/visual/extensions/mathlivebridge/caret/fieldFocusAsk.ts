// a field built as the caret arrived takes its focus late, and a key held down has moved the selection on by then: kept,
// the field showed its caret beside the gap cursor below it and took the next key
import type { Selection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

export class FieldFocusAsk {
	private under: Selection | null = null;
	private arrivedAt = 0;

	ask(view: EditorView): void {
		this.under = view.state.selection;
	}

	/** a focus arriving after the selection moved on goes back to the page */
	late(view: EditorView, arrived: boolean): boolean {
		const under = this.under;
		if (!under) return false;
		// mathlive calls the focus handler once before the focus is there: the ask waits for the real one
		if (under.eq(view.state.selection)) {
			if (arrived) this.arrivedAt = performance.now();
			return false;
		}
		this.under = null;
		view.focus();
		return true;
	}

	/** the field lost the keyboard. Within 100 ms of taking it mathlive takes it back on a timer, and that focus goes back too */
	drop(): void {
		if (performance.now() - this.arrivedAt > 100) this.under = null;
	}
}
