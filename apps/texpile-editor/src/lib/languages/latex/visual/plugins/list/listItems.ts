// the items of a list kept where the editor has no list: the units between its \item commands
import { declaresSetting, isBlank, type SourceUnit, type TreeCall } from '$lib/languages/latex/visual/core';
import type { SyntaxNode } from '@lezer/common';
export type ListItemUnits = { call: TreeCall; body: SourceUnit[] };

function isGroup(u: SourceUnit): boolean {
	return u.piece.kind === 'node' && u.piece.node.name === 'Group';
}

function opensBracket(u: SourceUnit | undefined): boolean {
	return u?.piece.kind === 'node' && u.piece.node.name === 'OpenBracket';
}

/**
 * the items among `units`, each with the units up to the next \item; null when the units are no list. `inGroup` reads the
 * units of a group, for items wrapped in one
 */
export function listItemsIn(
	units: SourceUnit[],
	itemNames: readonly string[],
	inGroup: (group: SyntaxNode) => SourceUnit[]
): ListItemUnits[] | null {
	const content = units.filter((u) => !isBlank(u));
	let all = content.length === 1 && isGroup(content[0]) && content[0].piece.kind === 'node' ? inGroup(content[0].piece.node) : units;
	// the optional argument of the list itself
	if (opensBracket(all.find((u) => !isBlank(u)))) {
		const close = all.findIndex((u) => u.piece.kind === 'node' && u.piece.node.name === 'CloseBracket');
		if (close < 0) return null;
		all = all.slice(close + 1);
	}
	const starts = all.flatMap((u, i) => (u.call && itemNames.includes(u.call.name) ? [i] : []));
	// a size or font declaration ahead of the first item sets the list apart
	const before = all
		.slice(0, starts[0])
		.filter((u) => !isBlank(u) && !(u.call && declaresSetting(u.call.name) && !u.call.args.some((a) => a.present)));
	if (!starts.length || before.length) return null;
	return starts.map((start, k) => ({ call: all[start].call!, body: all.slice(start + 1, starts[k + 1] ?? all.length) }));
}
