// the pure side of SuggestionsController: a file's text with the suggestions placed on it
import { buildAnchor, type CommentAnchor } from '$lib/comments/anchor';
import type { EditMode, PlacedSuggestion } from '$lib/comments/suggestCompare';
import type { TextSpan } from '$lib/comments/editGestures';
import type { SuggestionMark } from '$lib/comments/activeSuggestions.svelte';

export type FileState = { text: string; placed: PlacedSuggestion[] };

/** a collaborator's change as it applied: who made it, in which mode, and where it landed */
export type RemoteEdit = { by: string; mode: EditMode; gestures: TextSpan[] };

/** a Reject someone else made, whose words are still on their way here, and what stood behind it at its spot */
export type ExpectedReject = { file: string; s: PlacedSuggestion; text: string; behind: Set<string> };

/** the suggestions at the spot where `s` ends that stand after it */
export function placedBehind(state: FileState, s: PlacedSuggestion): Set<string> {
	const at = state.placed.findIndex((x) => x.id === s.id);
	return new Set(state.placed.filter((x, i) => x.from === s.to && i > at).map((x) => x.id));
}

/** the file once `s` is rejected: its words put back, and the suggestions after it moved with them */
export function withoutRejected(state: FileState, s: PlacedSuggestion, behind = placedBehind(state, s)): FileState {
	const delta = s.restore.length - (s.to - s.from);
	const placed = state.placed
		.filter((x) => x.id !== s.id)
		.map((x) => (x.from > s.to || (x.from === s.to && behind.has(x.id)) ? { ...x, from: x.from + delta, to: x.to + delta } : x));
	return { text: state.text.slice(0, s.from) + s.restore + state.text.slice(s.to), placed };
}

/** the file once the suggestion `id` placed in it is rejected, if that is `after` */
export function rejectedAgain(state: FileState, id: string, after: string): FileState | null {
	const s = state.placed.find((x) => x.id === id);
	const now = s ? withoutRejected(state, s) : null;
	return now?.text === after ? now : null;
}

export function sameMark(a: SuggestionMark, b: SuggestionMark): boolean {
	return a.id === b.id && a.from === b.from && a.to === b.to && a.restore === b.restore && a.mine === b.mine;
}

export function sameSuggestions(a: PlacedSuggestion[], b: PlacedSuggestion[]): boolean {
	return (
		a.length === b.length && a.every((s, i) => s.id === b[i].id && s.from === b[i].from && s.to === b[i].to && s.restore === b[i].restore)
	);
}

export function sameFileState(a: FileState, b: FileState): boolean {
	return a.text === b.text && sameSuggestions(a.placed, b.placed);
}

export function anchorOf(text: string, s: PlacedSuggestion, ranks: Map<string, number>): CommentAnchor {
	const anchor = buildAnchor(text, s.from, s.to);
	const rank = ranks.get(s.id);
	return rank === undefined ? anchor : { ...anchor, rank };
}
