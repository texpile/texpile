// Select-all that respects the field the caret is in, then the document.
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { ResolvedPos } from 'prosemirror-model';

// captions and notes hold prose but are not `isolating` (table cells are, via prosemirror-tables):
// reaching the whole document from inside one is the same surprise
const FIELD_NODES = new Set(['table_caption', 'table_notes']);
// code held in the document takes its own text first, as its CodeMirror did in the DOM editor
const ISLANDS = new Set(['code_block', 'raw_latex', 'inline_latex']);

function fieldDepth($pos: ResolvedPos): number | null {
	for (let d = $pos.depth; d > 0; d--) {
		const { spec, name, isAtom } = $pos.node(d).type;
		// an ATOM you can still be inside is a widget with a text field in it: a figure caption, the
		// key of a ref or a citation. Each reads as its own box, whatever the schema calls it
		if (spec.isolating || isAtom || FIELD_NODES.has(name) || ISLANDS.has(name)) return d;
	}
	return null;
}

/**
 * Ctrl+A inside a table cell or a caption used to select the WHOLE document, so the next keystroke
 * replaced it (and autosave wrote that a second later). Take the field first; a second press falls
 * through to the document.
 */
export function selectAllScoped(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const { $from, from, to } = state.selection;
	const depth = fieldDepth($from);
	if (depth === null) return false;
	const start = $from.start(depth);
	const end = $from.end(depth);
	// already at or past the field's edges: widen, which is what the base command does
	if (to > end || (from <= start && to >= end)) return false;
	dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, start, end)).scrollIntoView());
	return true;
}
