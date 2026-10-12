import { startCompletion } from '@codemirror/autocomplete';
import { indentUnit } from '@codemirror/language';
import { EditorSelection, type EditorState, type SelectionRange } from '@codemirror/state';
import type { EditorView as CMView } from '@codemirror/view';
import { toCmInsertion, type InsertedPlace } from './body/cmInsertion';
import type { CursorValues } from './body/bodyVariables';
import { addChoiceFields, choiceFieldAt } from './choiceFields';
import { SnippetFieldRange, startSnippetSession } from './snippetSession';

/** one place a body goes in, replacing from..to; selection is what TM_SELECTED_TEXT stands for there */
export type SnippetSpot = { body: string; from: number; to: number; selection: string };

function cursorValuesAt(state: EditorState, pos: number, index: number): CursorValues {
	const line = state.doc.lineAt(pos);
	const word = state.wordAt(pos);
	return {
		TM_CURRENT_LINE: line.text,
		...(word ? { TM_CURRENT_WORD: state.sliceDoc(word.from, word.to) } : {}),
		TM_LINE_INDEX: String(line.number - 1),
		TM_LINE_NUMBER: String(line.number),
		CURSOR_INDEX: String(index),
		CURSOR_NUMBER: String(index + 1)
	};
}

function placeOrder(a: number, b: number): number {
	return a === 0 ? 1 : b === 0 ? -1 : a - b;
}

/** every spot in one step, its places linked across spots as in VS Code */
export function expandSnippet(view: CMView, spots: readonly SnippetSpot[], captures: readonly string[] = []): void {
	const { state } = view;
	const unit = state.facet(indentUnit);
	const placed: InsertedPlace[] = [];
	const ends: number[] = [];
	let shift = 0;
	const changes = [...spots]
		.sort((a, b) => a.from - b.from)
		.map((spot, index) => {
			const line = state.doc.lineAt(spot.from);
			const base = /^[ \t]*/.exec(line.text.slice(0, spot.from - line.from))![0];
			const inputs = { selection: spot.selection, captures, cursor: cursorValuesAt(state, spot.from, index) };
			const { text, places } = toCmInsertion(spot.body, inputs, { base, unit });
			const at = spot.from + shift;
			for (const p of places) placed.push({ ...p, from: at + p.from, to: at + p.to });
			ends.push(at + text.length);
			shift += text.length - (spot.to - spot.from);
			return { from: spot.from, to: spot.to, insert: text };
		});
	const order = [...new Set(placed.map((p) => p.n))].sort(placeOrder);
	const ranges = placed.map((p) => new SnippetFieldRange(order.indexOf(p.n), p.from, p.to, p.authored, p.transform));
	const cursors: SelectionRange[] = ranges.length
		? ranges.filter((r) => r.field === 0).map((r) => EditorSelection.range(r.from, r.to))
		: ends.map((end) => EditorSelection.cursor(end));
	const choices = placed.filter((p) => p.options).map((p) => ({ from: p.from, to: p.to, options: p.options! }));
	view.dispatch({
		changes,
		selection: EditorSelection.create(cursors),
		effects: [
			...(order.length > 1 ? startSnippetSession(state, ranges, spots.length) : []),
			...(choices.length ? [addChoiceFields.of(choices)] : [])
		],
		scrollIntoView: true
	});
	const sel = view.state.selection.main;
	if (choiceFieldAt(view.state, sel.from, sel.to)) startCompletion(view);
}
