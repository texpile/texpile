// the open file's suggestions and the edit mode, shared by both editors
import { box } from '$lib/runes/box.svelte';
import type { CommentAnchor } from './anchor';
import { defaultTypingSide, type EditMode, type TypingSide } from './suggestCompare';
import type { TextChange } from './editGestures';

export type SuggestionMark = {
	id: string;
	from: number;
	to: number;
	restore: string;
	mine: boolean;
	anchor: CommentAnchor;
};

export type DrawnSuggestion = { from: number; to: number; restore: string; mine: boolean };

export const activeSuggestions = box<SuggestionMark[]>([]);

export const suggestionVisibility = box<{ partial: Set<string>; hidden: Set<string> }>({ partial: new Set(), hidden: new Set() });

export const suggesting = box(false);

export const editMode = box<EditMode>('editing');

function joins(r: DrawnSuggestion): boolean {
	return editMode.current === 'suggesting' && r.mine;
}

export function typingSide(r: DrawnSuggestion): TypingSide {
	return defaultTypingSide(r.to === r.from, joins(r));
}

export function mapSuggestionEdges<T extends DrawnSuggestion>(
	r: T,
	map: (pos: number, assoc: -1 | 1) => number,
	side = typingSide(r)
): T[] {
	const from = map(r.from, side === 'after' ? -1 : 1);
	if (joins(r)) return [{ ...r, from, to: Math.max(from, map(r.to, 1)) }];
	if (r.to === r.from) return [{ ...r, from, to: from }];
	const start = map(r.from, 1);
	const to = Math.max(start, map(r.to, -1));
	if (from === start || !r.restore) return [{ ...r, from: start, to }];
	return [
		{ ...r, from, to: from },
		{ ...r, from: start, to, restore: '' }
	];
}

let typed: Record<string, TypingSide> = {};

export function noteTypedSide(id: string, side: TypingSide): void {
	typed[id] = side;
}

export function takeTypedSides(): Record<string, TypingSide> {
	const out = typed;
	typed = {};
	return out;
}

/** where the source editor's last edit landed, when the text alone would place it elsewhere: several places, or an insertion */
export type EditedPlaces = { before: string; after: string; changes: TextChange[] };

let edited: EditedPlaces | null = null;

export function noteEditedPlaces(edit: EditedPlaces): void {
	edited = edit;
}

export function takeEditedPlaces(): EditedPlaces | null {
	const out = edited;
	edited = null;
	return out;
}
