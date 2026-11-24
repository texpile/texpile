// a code island's text as a CodeMirror state, and a CodeMirror change written back as one ProseMirror change
import { TextSelection, type Transaction } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { EditorSelection, EditorState as CodeState, type Extension, type Transaction as CodeTransaction } from '@codemirror/state';

export const ISLANDS = new Set(['code_block', 'raw_latex', 'inline_latex']);

export type FoundIsland = { island: PMNode; start: number };

/** the island the whole selection is in; its text is its content */
/** the code or raw block holding the whole selection, whose keys stay in it as its CodeMirror kept them; an inline chip's leave it */
export function blockIslandOf(view: Pick<EditorView, 'state'>): FoundIsland | null {
	const found = islandOf(view);
	return found?.island.isBlock ? found : null;
}

export function islandOf(view: Pick<EditorView, 'state'>): FoundIsland | null {
	const { $from, $to } = view.state.selection;
	if (!$from.sameParent($to) || !ISLANDS.has($from.parent.type.name)) return null;
	return { island: $from.parent, start: $from.start() };
}

export function islandCodeState(view: Pick<EditorView, 'state'>, found: FoundIsland, extensions: Extension): CodeState {
	const { anchor, head } = view.state.selection;
	return CodeState.create({
		doc: found.island.textContent,
		selection: EditorSelection.single(anchor - found.start, head - found.start),
		extensions
	});
}

export function writeBack(view: Pick<EditorView, 'state'>, start: number, changed: CodeTransaction): Transaction {
	const edits: { from: number; to: number; text: string }[] = [];
	changed.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => edits.push({ from: fromA, to: toA, text: inserted.toString() }));
	const tr = view.state.tr;
	for (const edit of edits.reverse()) {
		if (edit.text) tr.insertText(edit.text, start + edit.from, start + edit.to);
		else tr.delete(start + edit.from, start + edit.to);
	}
	const main = changed.state.selection.main;
	return tr.setSelection(TextSelection.create(tr.doc, start + main.anchor, start + main.head)).scrollIntoView();
}
