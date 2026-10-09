import { snippet, startCompletion } from '@codemirror/autocomplete';
import { EditorSelection, type ChangeSpec } from '@codemirror/state';
import type { EditorView as CMView } from '@codemirror/view';
import { toCmTemplate, type BodyInputs } from './bodyTemplate';
import { addChoiceFields, choiceFieldAt, type ChoiceField } from './choiceFields';

/** replace from..to with the body, its first stop selected */
export function expandSnippet(view: CMView, body: string, from: number, to: number, inputs: BodyInputs): void {
	const { template, fills, choices } = toCmTemplate(body, inputs);
	snippet(template)(view, null, from, to);
	if (!fills.size) return;

	// the defaults CodeMirror could not hold went in as markers; the text goes in their place
	const state = view.state;
	const inserted = state.sliceDoc(from, Math.min(state.doc.length, from + template.length));
	const specs: ChangeSpec[] = [];
	const markerAt: { pos: number; marker: string }[] = [];
	for (let i = 0; i < inserted.length; i++) {
		const fill = fills.get(inserted[i]);
		if (fill === undefined) continue;
		specs.push({ from: from + i, to: from + i + 1, insert: fill });
		markerAt.push({ pos: from + i, marker: inserted[i] });
	}
	const changes = state.changes(specs);
	const main = state.selection.main;
	const onMarker = markerAt.some((m) => m.pos === main.from && main.to === m.pos + 1);
	const selection = onMarker
		? EditorSelection.single(changes.mapPos(main.from, -1), changes.mapPos(main.to, 1))
		: state.selection.map(changes);
	const fields: ChoiceField[] = markerAt
		.filter((m) => choices.has(m.marker))
		.map((m) => ({ from: changes.mapPos(m.pos, -1), to: changes.mapPos(m.pos + 1, 1), options: choices.get(m.marker)! }));
	view.dispatch({ changes, selection, effects: fields.length ? addChoiceFields.of(fields) : [] });
	const sel = view.state.selection.main;
	if (choiceFieldAt(view.state, sel.from, sel.to)) startCompletion(view);
}
