// the suggestions plugin's key and what its state holds
import { PluginKey, type EditorState } from 'prosemirror-state';
import type { DecorationSet } from 'prosemirror-view';
import type { PmSuggestionRange } from './pmSuggestionsPlace';
import type { CaretSide } from '$lib/comments/oldWordsCaret';
import type { EditMode } from '$lib/comments/suggestCompare';

export type PmSuggestionsState = {
	ranges: PmSuggestionRange[];
	focused: string | null;
	caret: CaretSide | null;
	deco: DecorationSet;
	mode: EditMode;
};
export type PmSuggestionsMeta =
	{ type: 'set'; ranges: PmSuggestionRange[] } | { type: 'focus'; id: string | null } | { type: 'caret'; caret: CaretSide | null };

export const pmSuggestionsKey = new PluginKey<PmSuggestionsState>('texpile-suggestions');

export function hasOldWords(r: PmSuggestionRange): boolean {
	// blocks that are gone alone hang between blocks, where no caret stands; the words cut from the
	// blocks on either side of the join are struck in their lines, and the caret goes before or after
	// them as it does beside any others
	const words = r.gone ? r.gone.head.length + r.gone.tail.length > 0 : r.old.length > 0;
	return !!r.restore && !r.partial && !r.format && !r.node && !r.brk && words;
}

export function struckAt(state: EditorState, at: number): PmSuggestionRange[] {
	return (pmSuggestionsKey.getState(state)?.ranges ?? []).filter((r) => hasOldWords(r) && r.from === at);
}
