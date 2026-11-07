import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import type { TreeArg, TreeCall } from '$lib/languages/latex/parser/tree/walk/treeArgs';
import type { SourceUnit } from '$lib/languages/latex/parser/tree/walk/sourceUnits';
import type { EncodingTable } from '$lib/languages/latex/knowledge/types';
import type { TitleMarks, TitleScope } from '../title/titleLines';

export type Drawing = {
	src: string;
	block: boolean;
	top: boolean;
	depth: number;
	nextFootnote(): number;
	title?: TitleScope;
	titleMarks: TitleMarks;
	encoding?: EncodingTable;
};

export function optionalText(d: Drawing, call: TreeCall): string | null {
	const arg = call.args.find((a) => a.present && a.open === '[');
	return arg ? argText(d, arg).trim() : null;
}
export function argText(d: Drawing, arg: TreeArg | undefined): string {
	return arg?.body ? d.src.slice(arg.body.from, arg.body.to) : '';
}
export function hasArgs(call: TreeCall): boolean {
	return call.args.some((a) => a.present);
}

export function isBlank(u: SourceUnit): boolean {
	return u.piece.kind === 'space' || (u.piece.kind === 'node' && (u.piece.node.name === 'Comment' || u.piece.node.name === 'ParBreak'));
}

export function partsOf(drawn: ChipFace | ChipFace[] | null): ChipFace[] | null {
	return drawn && (Array.isArray(drawn) ? drawn : [drawn]);
}

export function destroyParts(...lists: (ChipFace[] | null | undefined)[]): void {
	lists.forEach((parts) => parts?.forEach((part) => part.destroy?.()));
}

export function endsNothing(u: SourceUnit, d: Drawing): boolean {
	if (isBlank(u)) return true;
	if (u.call) return u.call.name === 'par' && !hasArgs(u.call);
	return u.piece.kind === 'node' && u.piece.node.name === 'Group' && d.src.slice(u.piece.from, u.piece.to) === '{}';
}

const TEXT_NODES = new Set(['OpenBracket', 'CloseBracket']);

export function isTextPiece({ piece }: SourceUnit): boolean {
	return piece.kind === 'word' || (piece.kind === 'node' && TEXT_NODES.has(piece.node.name));
}
