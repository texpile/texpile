// Find and replace over the text the editor actually shows.
import { getSearchState, SearchQuery } from 'prosemirror-search';
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';

type Match = NonNullable<ReturnType<SearchQuery['findNext']>>;

// a regex match of nothing (`a|`, `.*` at a line end) has no text to show or replace, and the search
// plugin's own scan stands still on one
export class VisibleTextQuery extends SearchQuery {
	override findNext(state: EditorState, from = 0, to = state.doc.content.size): Match | null {
		for (let pos = from; ;) {
			const next = super.findNext(state, pos, to);
			if (!next || next.to > next.from) return next;
			pos = next.from + 1;
		}
	}
}

// A chip keeps its key as node CONTENT, so a plain text search reaches it: \ref{tab:corpus} draws
// as "1", and replacing "corpus" there rewrote the key and broke the cross-reference with nothing
// on screen to show for it. Renaming a target is the reference manager's job.
// `label` is safe (its name is an attr) and so is typst's typ_ref, so neither is listed.
const CHIP_NODES = new Set(['ref', 'citation']);

function inChip(state: EditorState, pos: number): boolean {
	const $pos = state.doc.resolve(pos);
	for (let d = $pos.depth; d > 0; d--) if (CHIP_NODES.has($pos.node(d).type.name)) return true;
	return false;
}

/** every match the user can see, in document order */
export function visibleMatches(state: EditorState, query: SearchQuery, from = 0, to = state.doc.content.size): Match[] {
	const out: Match[] = [];
	if (!query.valid) return out;
	// a half-typed regex throws out of findNext
	try {
		for (let pos = from, next: Match | null; (next = query.findNext(state, pos, to)); pos = next.to) {
			if (!inChip(state, next.from)) out.push(next);
		}
	} catch {
		return [];
	}
	return out;
}

function applyReplacements(state: EditorState, query: SearchQuery, matches: Match[], tr = state.tr) {
	// back to front so earlier positions stay valid
	for (let i = matches.length - 1; i >= 0; i--) {
		const reps = query.getReplacements(state, matches[i]);
		for (let j = reps.length - 1; j >= 0; j--) tr.replace(reps[j].from, reps[j].to, reps[j].insert);
	}
	return tr;
}

export function replaceAllVisible(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const search = getSearchState(state);
	if (!search) return false;
	const range = search.range ?? { from: 0, to: state.doc.content.size };
	const matches = visibleMatches(state, search.query, range.from, range.to);
	if (!matches.length) return false;
	dispatch?.(applyReplacements(state, search.query, matches));
	return true;
}

/** replace the match under the selection, then move to the next one; select it first if not on one */
export function replaceNextVisible(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const search = getSearchState(state);
	if (!search) return false;
	const all = visibleMatches(state, search.query);
	if (!all.length) return false;
	const { from, to } = state.selection;
	const here = all.find((m) => m.from === from && m.to === to);
	if (!here) {
		const next = all.find((m) => m.from >= from) ?? all[0];
		dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, next.from, next.to)).scrollIntoView());
		return true;
	}
	if (dispatch) {
		const tr = applyReplacements(state, search.query, [here]);
		const after = all.find((m) => m.from >= here.to);
		if (after) tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(after.from, 1), tr.mapping.map(after.to, -1)));
		dispatch(tr.scrollIntoView());
	}
	return true;
}

/** step to the next (dir 1) or previous (dir -1) visible match, wrapping at the ends */
export function stepToMatch(state: EditorState, dir: 1 | -1): TextSelection | null {
	const search = getSearchState(state);
	if (!search) return null;
	const all = visibleMatches(state, search.query);
	if (!all.length) return null;
	const { from } = state.selection;
	const next =
		dir === 1 ? (all.find((m) => m.from > from) ?? all[0]) : ([...all].reverse().find((m) => m.from < from) ?? all[all.length - 1]);
	return TextSelection.create(state.doc, next.from, next.to);
}
