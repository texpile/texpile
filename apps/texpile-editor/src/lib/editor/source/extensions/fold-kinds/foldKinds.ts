// folds by what they hold, for the Fold All Equations commands and the fold-on-open setting
import { Facet, type EditorState } from '@codemirror/state';
import { foldable, foldedRanges, foldEffect, unfoldEffect } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import type { AppSettings } from '$lib/settings';

/** float: a figure, table or other float, and a tabular set apart from one */
export type FoldKind = 'float' | 'equation' | 'environment';
export type KindedFold = { from: number; to: number; kind: FoldKind };
export type FoldOnOpen = AppSettings['foldOnOpen'];
type FoldRange = { from: number; to: number };

export const FOLD_ON_OPEN_LEVELS: readonly FoldOnOpen[] = ['off', 'floats', 'equations', 'environments', 'everything'];

/** the language's blocks by kind; a range is the one its gutter arrow folds */
export const foldKinds = Facet.define<(state: EditorState) => KindedFold[], ((state: EditorState) => KindedFold[]) | null>({
	combine: (readers) => readers[0] ?? null
});

const LEVEL_KINDS: Record<'floats' | 'equations' | 'environments', FoldKind[]> = {
	floats: ['float'],
	equations: ['float', 'equation'],
	environments: ['float', 'equation', 'environment']
};

function kindedFolds(state: EditorState, kinds: readonly FoldKind[]): FoldRange[] {
	const read = state.facet(foldKinds);
	return read ? read(state).filter((f) => kinds.includes(f.kind)) : [];
}

export function spansLines(state: EditorState, range: FoldRange): boolean {
	return state.doc.lineAt(range.from).number < state.doc.lineAt(range.to).number;
}

/** a fold inside another one of the set is hidden with it already */
function outermost(ranges: FoldRange[]): FoldRange[] {
	const out: FoldRange[] = [];
	let end = -1;
	for (const r of [...ranges].sort((a, b) => a.from - b.from || b.to - a.to)) {
		if (r.from < end) continue;
		out.push(r);
		end = r.to;
	}
	return out;
}

function everyFold(state: EditorState): FoldRange[] {
	const out: FoldRange[] = [];
	for (let pos = 0; pos < state.doc.length;) {
		const line = state.doc.lineAt(pos);
		const range = foldable(state, line.from, line.to);
		if (range) out.push(range);
		pos = (range ? state.doc.lineAt(range.to) : line).to + 1;
	}
	return out;
}

export function foldsOnOpen(state: EditorState, level: FoldOnOpen): FoldRange[] {
	if (level === 'off') return [];
	return level === 'everything' ? everyFold(state) : outermost(kindedFolds(state, LEVEL_KINDS[level]));
}

/** a fold the caret sits inside stays open, as the caret would open it again */
export function clearOfCaret(state: EditorState, ranges: FoldRange[]): FoldRange[] {
	const head = state.selection.main.head;
	return ranges.filter((r) => !(head > r.from && head < r.to));
}

export function foldAllOfKind(view: EditorView, kind: FoldKind): boolean {
	const ranges = clearOfCaret(view.state, outermost(kindedFolds(view.state, [kind])));
	if (ranges.length) view.dispatch({ effects: ranges.map((r) => foldEffect.of(r)) });
	return true;
}

export function unfoldAllOfKind(view: EditorView, kind: FoldKind): boolean {
	const starts = new Set(kindedFolds(view.state, [kind]).map((r) => r.from));
	const effects: ReturnType<typeof unfoldEffect.of>[] = [];
	foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
		if (starts.has(from)) effects.push(unfoldEffect.of({ from, to }));
	});
	if (effects.length) view.dispatch({ effects });
	return true;
}

/** whether the editor's language sorts its folds */
export function hasFoldKinds(state: EditorState): boolean {
	return state.facet(foldKinds) !== null;
}
