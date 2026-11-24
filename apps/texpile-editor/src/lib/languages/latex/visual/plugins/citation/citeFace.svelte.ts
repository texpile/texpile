import {
	citationGroupsText,
	citedWorks,
	onDrawnInputs,
	referenceStore,
	setRefLook,
	splitCitationKeys,
	templateFeaturesStore,
	type ChipFace,
	type CitedGroup
} from '$lib/languages/latex/visual/core';
import { faceElement } from '$lib/editor/canvas';
import type { CiteCallGroups } from './citeGroups';

export function citationOf(command: string, call: CiteCallGroups): { text: string; broken: boolean } | null {
	const references = referenceStore.current;
	if (!references) return null;
	const aliases = templateFeaturesStore.current.citeAliases;
	const groups: CitedGroup[] = call.groups.map(({ notes, keys }) => {
		const [prenote, postnote] = notes.length === 2 ? notes : ['', notes[0] ?? ''];
		return { works: citedWorks(splitCitationKeys(keys), references, aliases), prenote, postnote };
	});
	const works = groups.flatMap((g) => g.works);
	return {
		text: citationGroupsText(command, groups, call.multiprenote, call.multipostnote),
		broken: !works.length || works.some((work) => work.unresolved !== undefined && work.alias === undefined)
	};
}

export function citeFace(command: string, call: CiteCallGroups, source: string, raised = false): ChipFace {
	const dom = faceElement(raised ? 'sup' : 'span', 'drawn-crossref');
	dom.hint = source;
	function show(): void {
		const cited = citationOf(command, call);
		const text = cited ? cited.text : '(…)';
		// written again as it was, it reads as a change of size to the line breaker
		if (dom.textContent !== text) dom.textContent = text;
		setRefLook(dom, cited?.broken ?? true);
	}
	show();
	const stop = onDrawnInputs(show);
	return {
		dom,
		destroy: stop
	};
}
