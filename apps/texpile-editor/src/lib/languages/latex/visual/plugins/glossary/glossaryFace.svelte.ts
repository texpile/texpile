import {
	chipElement,
	onDrawnInputs,
	projectIntelStore,
	showGlossaryTerm,
	templateFeaturesStore,
	type ChipFace,
	type GlossEntry
} from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';
import { glossaryText, type GlossaryUse } from '$lib/languages/latex/knowledge/commands/glossaryUse';
export function glossaryEntryOf(key: string): GlossEntry | null {
	const own = templateFeaturesStore.current.glossary?.find((entry) => entry.key === key);
	return own ?? projectIntelStore.current.glossary.find((entry) => entry.key === key) ?? null;
}

export function glossaryFace(use: GlossaryUse, key: string, inserted: string, source: string): ChipFace {
	const dom = chipElement('span');
	function show(): void {
		const entry = glossaryEntryOf(key);
		showGlossaryTerm(dom, entry ? glossaryText(use, entry) + inserted : key, entry === null);
		const meaning = entry?.acronym && entry.long ? `${entry.long} (${entry.short})` : null;
		dom.hint = entry ? (meaning ?? source) : m.glossary_entry_not_found({ key });
	}
	show();
	const stop = onDrawnInputs(show);
	return { dom, destroy: stop };
}
