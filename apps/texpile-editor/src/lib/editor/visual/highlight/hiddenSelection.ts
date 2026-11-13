// a selection ProseMirror hides (a selected node, a table's cells, a gap cursor) is hidden on the node that holds it
import type { Node } from 'prosemirror-model';
import { GapCursor } from 'prosemirror-gapcursor';
import { NodeSelection, Plugin, type EditorState, type Selection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import './hiddenSelection.css';

const IN_TABLE = new Set(['row', 'cell', 'header_cell']);

/** the node whose box holds all the browser would paint of `selection`; null for one that shows, or one held by the page */
export function hiddenSelectionHolder(selection: Selection): { from: number; to: number } | null {
	if (selection.visible) return null;
	if (selection instanceof NodeSelection) return { from: selection.from, to: selection.to };
	const { $from, $to } = selection;
	let depth = $from.sharedDepth($to.pos);
	// the browser's range over selected cells runs through the cells between them; a gap cursor stays in its own block
	if (!selection.empty) while (depth > 0 && IN_TABLE.has(($from.node(depth) as Node).type.spec.tableRole as string)) depth--;
	return depth > 0 ? { from: $from.before(depth), to: $from.after(depth) } : null;
}

function decorate(state: EditorState): DecorationSet {
	const { selection } = state;
	const decorations: Decoration[] = [];
	const holder = hiddenSelectionHolder(selection);
	if (holder) decorations.push(Decoration.node(holder.from, holder.to, { class: 'pm-selection-hidden' }));
	// Chrome paints the caret of a gap in the block beside it
	if (selection instanceof GapCursor) {
		const { pos, nodeBefore, nodeAfter } = selection.$head;
		if (nodeBefore) decorations.push(Decoration.node(pos - nodeBefore.nodeSize, pos, { class: 'pm-beside-gap' }));
		if (nodeAfter) decorations.push(Decoration.node(pos, pos + nodeAfter.nodeSize, { class: 'pm-beside-gap' }));
	}
	return decorations.length ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty;
}

export function hiddenSelectionPlugin(): Plugin {
	return new Plugin({
		props: {
			attributes: { class: 'pm-block-carets' },
			decorations: decorate
		}
	});
}
