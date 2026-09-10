//for `' pair
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, RangeSet, RangeValue, StateEffect, StateField, type Extension, type TransactionSpec } from '@codemirror/state';

class Mark extends RangeValue {
	override startSide = 1;
	override endSide = 1;
}
const mark = new Mark();
const markQuote = StateEffect.define<number>({ map: (pos, changes) => changes.mapPos(pos, 1) });

const insertedQuotes = StateField.define<RangeSet<Mark>>({
	create: () => RangeSet.empty,
	update(value, tr) {
		let set = value.map(tr.changes);
		if (tr.selection && !tr.isUserEvent('input')) set = RangeSet.empty;
		for (const e of tr.effects) if (e.is(markQuote)) set = set.update({ add: [mark.range(e.value)] });
		return set;
	}
});

const BEFORE = ';:.,={}])>\\` \t\n$';

function markedAt(state: EditorState, pos: number): boolean {
	let hit = false;
	state.field(insertedQuotes).between(pos, pos, () => {
		hit = true;
		return false;
	});
	return hit;
}

export function openQuote(state: EditorState): TransactionSpec | null {
	const sel = state.selection.main;
	if (!sel.empty || state.selection.ranges.length !== 1) return null;
	const next = state.sliceDoc(sel.from, sel.from + 1);
	if (next !== '' && next !== "'" && !BEFORE.includes(next)) return null;
	return {
		changes: { from: sel.from, insert: "`'" },
		selection: { anchor: sel.from + 1 },
		effects: markQuote.of(sel.from + 1),
		userEvent: 'input.type',
		scrollIntoView: true
	};
}

export function overtypeQuote(state: EditorState): TransactionSpec | null {
	const sel = state.selection.main;
	if (!sel.empty || state.sliceDoc(sel.from, sel.from + 1) !== "'" || !markedAt(state, sel.from)) return null;
	return { selection: { anchor: sel.from + 1 }, userEvent: 'input.type', scrollIntoView: true };
}

export function deleteQuotePair(state: EditorState): TransactionSpec | null {
	const sel = state.selection.main;
	if (!sel.empty || state.sliceDoc(sel.from - 1, sel.from + 1) !== "`'" || !markedAt(state, sel.from)) return null;
	return { changes: { from: sel.from - 1, to: sel.from + 1 }, userEvent: 'delete.backward', scrollIntoView: true };
}

export function latexQuotePair(): Extension {
	return [
		insertedQuotes,
		EditorView.inputHandler.of((view, from, to, text) => {
			if (from !== to || (text !== '`' && text !== "'")) return false;
			const spec = text === '`' ? openQuote(view.state) : overtypeQuote(view.state);
			if (!spec) return false;
			view.dispatch(view.state.update(spec));
			return true;
		}),
		keymap.of([
			{
				key: 'Backspace',
				run: (view) => {
					const spec = deleteQuotePair(view.state);
					if (!spec) return false;
					view.dispatch(view.state.update(spec));
					return true;
				}
			}
		])
	];
}
