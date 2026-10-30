import type { ArrangeTarget } from '../figure/figureLanguage';
import type { FigureEditorState } from '../state/editorState.svelte';
import { canDrop, draggedIds, dropStatements } from './arrangeCommands';
import type { ObjectListRow } from './objectRows';

export type DropPlace = 'before' | 'after' | 'into';

/** a row dragged up or down the list: where it would land, shown while it is over another row */
export class ObjectsDrag {
	ids = $state.raw<number[]>([]);
	over = $state.raw<{ i: number; place: DropPlace } | null>(null);
	#editor: FigureEditorState;

	constructor(editor: FigureEditorState) {
		this.#editor = editor;
	}

	start(e: DragEvent, i: number) {
		this.ids = draggedIds(this.#editor, i);
		// Firefox starts no drag without data
		e.dataTransfer?.setData('text/plain', '');
		// eslint-disable-next-line no-param-reassign -- the DnD API works by mutating the event's dataTransfer
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	/** the top and bottom quarters of a scope's row put it beside the scope, the middle inside */
	move(e: DragEvent, row: ObjectListRow) {
		if (!this.ids.length) return;
		if (!canDrop(this.#editor, this.ids, row.st.i)) {
			this.over = null;
			return;
		}
		e.preventDefault();
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const y = (e.clientY - r.top) / r.height;
		const place: DropPlace = row.st.kind === 'scope' ? (y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into') : y < 0.5 ? 'before' : 'after';
		if (this.over?.i !== row.st.i || this.over.place !== place) this.over = { i: row.st.i, place };
	}

	drop(e: DragEvent) {
		e.preventDefault();
		const over = this.over;
		const ids = this.ids;
		this.end();
		if (!over) return;
		const to: ArrangeTarget = over.place === 'into' ? { into: over.i } : over.place === 'before' ? { before: over.i } : { after: over.i };
		dropStatements(this.#editor, ids, to);
	}

	end() {
		this.ids = [];
		this.over = null;
	}
}
