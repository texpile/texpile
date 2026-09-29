// Previous and next change in a visual comparison: the marks visualDiffPlugin draws, stepped
// through from the caret and wrapping round, the way Alt+F5 steps through the source editor's.
// Marks that touch are one change: a replaced word is a deletion widget beside an insertion.
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { visualDiffKey } from './visualDiffPlugin';

/** exported for the tests: the changes as ranges, in document order, touching marks merged */
export function changeRanges(view: EditorView): { from: number; to: number }[] {
	const decos = visualDiffKey.getState(view.state)?.decorations.find() ?? [];
	const sorted = [...decos].sort((a, b) => a.from - b.from);
	const out: { from: number; to: number }[] = [];
	for (const d of sorted) {
		const last = out.at(-1);
		if (last && d.from <= last.to + 1) last.to = Math.max(last.to, d.to);
		else out.push({ from: d.from, to: d.to });
	}
	return out;
}

/** move the caret to the next (1) or previous (-1) change and bring it into view; false with none */
export function stepVisualDiff(view: EditorView, dir: 1 | -1): boolean {
	const ranges = changeRanges(view);
	if (!ranges.length) return false;
	const doc = view.state.doc;
	const head = view.state.selection.head;
	// where the caret lands for a change, which is not always its start: a deleted paragraph's mark
	// sits between blocks, and the caret goes into the next one. Compared by that too, or the caret
	// already there would be sent back to it on every press
	function land(r: { from: number }): number {
		return TextSelection.near(doc.resolve(Math.min(r.from, doc.content.size))).head;
	}
	const target =
		dir === 1
			? (ranges.find((r) => r.from > head && land(r) > head) ?? ranges[0])
			: ([...ranges].reverse().find((r) => r.to < head && land(r) < head) ?? ranges.at(-1)!);
	view.dispatch(view.state.tr.setSelection(TextSelection.near(doc.resolve(Math.min(target.from, doc.content.size)))).scrollIntoView());
	view.focus();
	return true;
}
