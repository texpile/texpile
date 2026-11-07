// the groups of keys a citation call names, each with its notes: \cite[pre][post]{a} is one, \parencites(pre)(post)[1]{a}[2]{b} two
import type { TreeCall } from '$lib/languages/latex/visual/core';
export type CiteGroupCall = {
	/** the optional arguments before the keys: one is the postnote, two the prenote and the postnote */
	notes: string[];
	keys: string;
};

export type CiteCallGroups = {
	groups: CiteGroupCall[];
	/** the (...)(...) round all groups */
	multiprenote: string;
	multipostnote: string;
};

/** null when the call names no key */
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
