import type { FigureEditorState } from '../state/editorState.svelte';
import { deleteSelection, duplicateSelection } from '../state/selection/selectionCommands';
import { handleArrangeKey, renameStatement } from './arrangeCommands';
import { objectRows } from './objectRows';

/** the objects list's own state: which scopes are folded and which row is being renamed */
export class ObjectsList {
	collapsed = $state.raw<ReadonlySet<number>>(new Set());
	renaming = $state(0);
	rows = $derived.by(() => objectRows(this.#editor, this.collapsed));
	/** whether any row folds, so rows keep a column for the chevron */
	foldable = $derived(this.rows.some((r) => r.scope));
	#editor: FigureEditorState;

	constructor(editor: FigureEditorState) {
		this.#editor = editor;
	}

	#fold(i: number, folded: boolean) {
		const next = new Set(this.collapsed);
		if (folded) next.add(i);
		else next.delete(i);
		this.collapsed = next;
	}

	toggleFolded(i: number) {
		this.#fold(i, !this.collapsed.has(i));
	}

	/** Shift picks the rows from the last one picked, Ctrl adds or drops one */
	selectRow(e: MouseEvent, i: number) {
		const ed = this.#editor;
		if (e.shiftKey && ed.selected) {
			const ids = this.rows.map((r) => r.st.i);
			const [a, b] = [ids.indexOf(ed.selected), ids.indexOf(i)].sort((x, y) => x - y);
			if (a >= 0) ed.selectMany(ids.slice(a, b + 1), i);
		} else if (e.ctrlKey || e.metaKey) ed.toggleSelected(i);
		else ed.select(i);
	}

	/** null leaves the label as it was */
	finishRename(i: number, label: string | null) {
		if (this.renaming !== i) return;
		this.renaming = 0;
		if (label !== null) renameStatement(this.#editor, i, label);
	}

	/** the list's keys, as a file tree's; true when the key was the list's */
	handleKey(e: KeyboardEvent) {
		const ed = this.#editor;
		if (handleArrangeKey(e, ed)) return true;
		const mod = e.ctrlKey || e.metaKey;
		const rows = this.rows;
		const at = rows.findIndex((r) => r.st.i === ed.selected);
		const row = rows[at];
		if (mod && e.key.toLowerCase() === 'a') ed.selectAll();
		else if (mod && e.key.toLowerCase() === 'd') duplicateSelection(ed);
		else if (mod || e.altKey) return false;
		else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			const next = rows[Math.max(0, Math.min(rows.length - 1, at < 0 ? 0 : at + (e.key === 'ArrowDown' ? 1 : -1)))];
			if (next) ed.select(next.st.i);
		} else if (e.key === 'ArrowRight' && row?.scope) this.#fold(row.st.i, false);
		else if (e.key === 'ArrowLeft' && row?.scope && row.open) this.#fold(row.st.i, true);
		else if (e.key === 'ArrowLeft' && row) ed.select(ed.tree.parent.get(row.st.i) || row.st.i);
		else if ((e.key === 'F2' || e.key === 'Enter') && row) this.renaming = row.st.i;
		else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection(ed);
		else if (e.key === 'Escape' && ed.selection.length) ed.select(0);
		else return false;
		return true;
	}
}
