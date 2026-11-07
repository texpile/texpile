import type { TreeCall } from '$lib/languages/latex/visual/core';
export type CiteGroupCall = {
	notes: string[];
	keys: string;
};

export type CiteCallGroups = {
	groups: CiteGroupCall[];
	multiprenote: string;
	multipostnote: string;
};

export function citeGroupsOf(call: TreeCall, src: string): CiteCallGroups | null {
	const groups: CiteGroupCall[] = [];
	const round: string[] = [];
	let notes: string[] = [];
	for (const arg of call.args) {
		if (!arg.present || !arg.body) continue;
		const body = src.slice(arg.body.from, arg.body.to);
		if (arg.kind === 'm') {
			groups.push({ notes, keys: body });
			notes = [];
		} else if (arg.kind === 'o') notes.push(body.trim().replace(/~/g, '\u00a0'));
		else if (arg.kind === 'd()') round.push(body.trim().replace(/~/g, '\u00a0'));
	}
	return groups.length
		? { groups, multiprenote: round.length === 2 ? round[0] : '', multipostnote: round.length === 2 ? round[1] : (round[0] ?? '') }
		: null;
}
