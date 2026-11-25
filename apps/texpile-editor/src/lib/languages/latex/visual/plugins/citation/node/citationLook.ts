import type { Node as PMNode } from 'prosemirror-model';
import { aliasCiteForm } from '$lib/languages/latex/knowledge/calls/citeCommands';
import { citationText, citedWorks, referenceStore, splitCitationKeys, templateFeaturesStore } from '$lib/languages/latex/visual/core';

export type CitationLook = { text: string; found: boolean };

// \cite{a, b, c} is ONE command with a shared note, so it stays one chip; each key resolves
// on its own and an unresolved one shows as its raw key (the red state says it's broken)
export function citationLookOf(node: PMNode): CitationLook {
	const references = referenceStore.current;
	if (!references) return { text: '(loading...)', found: false };
	const keys = splitCitationKeys(node.textContent);
	if (!keys.length) return { text: `(${node.textContent} not found)`, found: false };
	const { prenote, postnote, variant } = node.attrs;
	const citeAliases = templateFeaturesStore.current.citeAliases;
	const aliases = aliasCiteForm(String(variant ?? 'cite')) ? citeAliases : undefined;
	return {
		text: citationText(String(variant ?? 'cite'), citedWorks(keys, references, citeAliases), String(prenote ?? ''), String(postnote ?? '')),
		found: keys.every((key) => references.some((ref) => ref.key === key) || (aliases && Object.hasOwn(aliases, key)))
	};
}
