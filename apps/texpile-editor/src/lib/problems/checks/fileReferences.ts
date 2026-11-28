// what one LaTeX file defines and uses: labels, references, citations, bibliography entries, floats
import { codeOnly } from '$lib/languages/latex/texCode';
import { keysIn } from '$lib/languages/latex/knowledge/calls/roleKeys';
import { callsIn, rolesOf, type CommandReadings } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { environmentName } from '$lib/languages/latex/syntax/treeMode';
import { floatTypes } from '$lib/languages/latex/knowledge/registries/floatTypes';
import { commonEnvFacts } from '$lib/languages/latex/knowledge/environments/envFacts';
import { bibliographiesIn } from '$lib/languages/latex/refCheck';

export type KeyAt = { key: string; at: number };

export type FileReferences = {
	labels: KeyAt[];
	refs: KeyAt[];
	cites: KeyAt[];
	/** \bibitem keys */
	items: KeyAt[];
	/** labels inside a figure, table or another float */
	floatLabels: KeyAt[];
	bibliographies: { name: string; remote: boolean }[];
	/** acronyms and glossary entries */
	terms: KeyAt[];
	termUses: (KeyAt & { acronym: boolean })[];
	/** a name only a macro knows, or \nocite{*}: what is never used cannot be told */
	unsure: { labels: boolean; refs: boolean; cites: boolean; terms: boolean };
	external: boolean;
};

/** a name only known once a macro expands */
function unresolved(name: string): boolean {
	return !name.trim() || name.includes('\\') || name.includes('#');
}

function isFloat(name: string): boolean {
	const bare = name.endsWith('*') ? name.slice(0, -1) : name;
	return floatTypes().has(bare) || !!commonEnvFacts(name).float;
}

function floatRanges(code: string): [number, number][] {
	const out: [number, number][] = [];
	latexTreeOf(code).iterate({
		enter(n) {
			if (n.name === 'Environment' && n.node.firstChild && isFloat(environmentName(code, n.node.firstChild))) out.push([n.from, n.to]);
		}
	});
	return out;
}

function sure(keys: { key: string; at: number }[]): KeyAt[] {
	return keys.filter((k) => !unresolved(k.key)).map((k) => ({ key: k.key, at: k.at }));
}

function termsIn(code: string, own: CommandReadings | null): { terms: KeyAt[]; uses: FileReferences['termUses']; unsure: boolean } {
	const terms: KeyAt[] = [];
	const uses: FileReferences['termUses'] = [];
	let unsure = own === null;
	for (const call of callsIn(code, ['acronym', 'glossary'], own ?? undefined)) {
		for (const a of call.args) {
			const roles = rolesOf(a.arg);
			if (!roles.includes('acronym') && !roles.includes('glossary')) continue;
			for (const v of a.values) {
				if (unresolved(v.value)) unsure = true;
				else if (a.arg.defines !== undefined) terms.push({ key: v.value, at: v.at });
				else uses.push({ key: v.value, at: v.at, acronym: !roles.includes('glossary') });
			}
		}
	}
	return { terms, uses, unsure };
}

/** own: how the document's packages read acronym and glossary commands, null when not known */
export function fileReferences(text: string, own: CommandReadings | null): FileReferences {
	const code = codeOnly(text);
	const labelKeys = keysIn(code, 'label', true);
	const refKeys = keysIn(code, 'label', false);
	const citeKeys = keysIn(code, 'citekey', false);
	const labels = sure(labelKeys);
	const floats = floatRanges(code);
	const terms = termsIn(code, own);
	return {
		labels,
		refs: sure(refKeys),
		cites: sure(citeKeys.filter((k) => !k.wildcard)),
		items: sure(keysIn(code, 'citekey', true)),
		floatLabels: labels.filter((l) => floats.some(([from, to]) => l.at > from && l.at < to)),
		bibliographies: bibliographiesIn(text),
		terms: terms.terms,
		termUses: terms.uses,
		unsure: {
			labels: labelKeys.some((k) => unresolved(k.key)),
			refs: refKeys.some((k) => unresolved(k.key)),
			cites: citeKeys.some((k) => k.wildcard || unresolved(k.key)),
			// \glsaddall puts every entry in the glossary
			terms: terms.unsure || code.includes('\\glsaddall')
		},
		external: code.includes('\\externaldocument')
	};
}
