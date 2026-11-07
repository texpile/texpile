// A deletion or typing that crosses a table's edge into its cells takes the whole table, caption and all, as it takes a
// figure. ProseMirror cannot cut a table in half: from a list into a cell it throws, and from a caption
// past the grid it leaves a table with no cells, which reopens as raw source.
import { Plugin, TextSelection } from 'prosemirror-state';
import type { Node as PMNode, ResolvedPos } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

function isTable(node: PMNode): boolean {
	return node.type.name === 'table_wrapper' || node.type.spec.tableRole === 'table';
}

function reachesGrid(node: PMNode, start: number, lo: number, hi: number): boolean {
	if (node.type.spec.tableRole === 'table') return true;
	let reached = false;
	node.forEach((child, offset) => {
		const from = start + offset;
		if (child.type.spec.tableRole === 'table' && from < hi && from + child.nodeSize > lo) reached = true;
	});
	return reached;
}

function tableCrossed($pos: ResolvedPos, other: number): { from: number; to: number } | null {
	const lo = Math.min($pos.pos, other);
	const hi = Math.max($pos.pos, other);
	let outer = 0;
	let crossed = false;
	for (let d = 1; d <= $pos.depth; d++) {
		if (!isTable($pos.node(d))) continue;
		outer ||= d;
		if ((other < $pos.start(d) || other > $pos.end(d)) && reachesGrid($pos.node(d), $pos.start(d), lo, hi)) crossed = true;
	}
	return crossed ? { from: $pos.before(outer), to: $pos.after(outer) } : null;
}

/** the range grown to whole tables at whichever end sits in one the other end is outside of */
export function acrossTables(doc: PMNode, from: number, to: number): { from: number; to: number } | null {
	if (from >= to) return null;
	let a = from;
	let b = to;
	for (let grew = true; grew;) {
		grew = false;
		const atA = tableCrossed(doc.resolve(a), b);
		if (atA && atA.from < a) {
			a = atA.from;
			grew = true;
		}
		const atB = tableCrossed(doc.resolve(b), a);
		if (atB && atB.to > b) {
			b = atB.to;
			grew = true;
		}
	}
	return a === from && b === to ? null : { from: a, to: b };
}

function selected(view: EditorView): { from: number; to: number } | null {
	const sel = view.state.selection;
	return sel instanceof TextSelection ? acrossTables(view.state.doc, sel.from, sel.to) : null;
}

export const wholeTableEdits = new Plugin({
	props: {
		handleKeyDown(view, event) {
			if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
			const r = selected(view);
			if (!r) return false;
			view.dispatch(view.state.tr.delete(r.from, r.to).scrollIntoView());
			return true;
		},
		handleTextInput(view, from, to, text) {
			const r = acrossTables(view.state.doc, from, to);
			if (!r) return false;
			view.dispatch(view.state.tr.insertText(text, r.from, r.to).scrollIntoView());
			return true;
		},
		handlePaste(view, _event, slice) {
			const r = selected(view);
			if (!r) return false;
			view.dispatch(view.state.tr.replaceRange(r.from, r.to, slice).scrollIntoView());
			return true;
		},
		handleDOMEvents: {
			// widened before ProseMirror's own cut runs, so what goes on the clipboard is what goes from the page
			cut(view) {
				const r = selected(view);
				if (r)
					view.dispatch(view.state.tr.setSelection(TextSelection.between(view.state.doc.resolve(r.from), view.state.doc.resolve(r.to))));
				return false;
			}
		}
	}
});
