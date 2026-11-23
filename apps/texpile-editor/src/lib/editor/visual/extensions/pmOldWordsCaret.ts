// the caret beside a suggestion's old words in the visual editor
import { Plugin, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { typingSide } from '$lib/comments/activeSuggestions.svelte';
import { sideAtOldWords, type CaretSide } from '$lib/comments/oldWordsCaret';
import type { TypingSide } from '$lib/comments/suggestCompare';
import { pmSuggestionsKey, struckAt, type PmSuggestionsMeta } from './pmSuggestionsState';

function setCaret(view: EditorView, caret: CaretSide, tr: Transaction = view.state.tr): void {
	view.dispatch(tr.setMeta(pmSuggestionsKey, { type: 'caret', caret } satisfies PmSuggestionsMeta));
}

function stepAtOldWords(view: EditorView, forward: boolean): boolean {
	const { state } = view;
	const sel = state.selection;
	if (!(sel instanceof TextSelection) || !sel.empty) return false;
	const here = sel.head;
	const want: TypingSide = forward ? 'after' : 'before';
	const struck = struckAt(state, here);
	if (struck.length && sideAtOldWords(pmSuggestionsKey.getState(state)?.caret ?? null, here, struck.map(typingSide)) !== want) {
		setCaret(view, { at: here, side: want });
		return true;
	}
	const next = here + (forward ? 1 : -1);
	const $here = sel.$head;
	if (next < $here.start() || next > $here.end() || struckAt(state, next).length === 0) return false;
	const between = state.doc.textBetween(Math.min(here, next), Math.max(here, next), '', '￼');
	if (/[\uD800-\uDFFF]/.test(between)) return false;
	setCaret(
		view,
		{ at: next, side: forward ? 'before' : 'after' },
		state.tr.setSelection(TextSelection.create(state.doc, next)).scrollIntoView()
	);
	return true;
}

/** old words at the caret that an arrow the given way steps across before anything else moves */
export function oldWordsAhead(state: EditorState, forward: boolean): boolean {
	const sel = state.selection;
	if (!(sel instanceof TextSelection) || !sel.empty) return false;
	const struck = struckAt(state, sel.head);
	const side = sideAtOldWords(pmSuggestionsKey.getState(state)?.caret ?? null, sel.head, struck.map(typingSide));
	return struck.length > 0 && side !== (forward ? 'after' : 'before');
}

/** a caret stepped over something to `at`: old words there are met on the side it came from */
export function landBesideOldWords(state: EditorState, tr: Transaction, at: number, forward: boolean): Transaction {
	if (struckAt(state, at).length === 0) return tr;
	return tr.setMeta(pmSuggestionsKey, { type: 'caret', caret: { at, side: forward ? 'before' : 'after' } } satisfies PmSuggestionsMeta);
}

function oldWordsKeyDown(view: EditorView, event: KeyboardEvent): boolean {
	if (event.ctrlKey || event.altKey || event.metaKey) return false;
	if (event.shiftKey) return false;
	if (event.key === 'ArrowLeft') return stepAtOldWords(view, false);
	if (event.key === 'ArrowRight') return stepAtOldWords(view, true);
	return false;
}

// a click on blocks a suggestion took out whole: the caret goes to the join they were taken from
function clickOnGoneBlocks(view: EditorView, event: MouseEvent): boolean {
	const target = event.target as { closest?(selector: string): { dataset: Record<string, string | undefined> } | null } | null;
	const box = target?.closest?.('.pm-suggest-gone') ?? null;
	if (!box) return false;
	const range = pmSuggestionsKey.getState(view.state)?.ranges.find((r) => r.gone && r.id === box.dataset.comment);
	if (!range) return false;
	view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(range.from))));
	view.focus();
	return true;
}

/** a click on old words puts the caret on the side of them it fell on, as the hit test halves the struck words */
export function oldWordsClick(view: EditorView, _pos: number, event: MouseEvent): boolean {
	if (clickOnGoneBlocks(view, event)) return true;
	const target = view.canvas.geometry.hit(view.canvas.docPoint({ x: event.clientX, y: event.clientY }))?.target;
	if (target?.kind !== 'widget' || struckAt(view.state, target.pos).length === 0) return false;
	const side = target.side < 0 ? 'before' : 'after';
	setCaret(view, { at: target.pos, side }, view.state.tr.setSelection(TextSelection.create(view.state.doc, target.pos)));
	return true;
}

/** Left and Right beside a suggestion's old words; before the caret engine's arrows, which step over the words whole */
export function oldWordsArrowsPlugin(): Plugin {
	return new Plugin({ props: { handleKeyDown: oldWordsKeyDown } });
}
