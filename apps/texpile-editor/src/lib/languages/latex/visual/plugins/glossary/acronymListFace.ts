// the list that defines acronyms, drawn as the acronyms it lists
import { faceElement, scanGlossary, tippedFace, type ChipFace } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

const MOST_LISTED = 12;

export function acronymListFace(source: string): ChipFace | null {
	const entries = scanGlossary(source, []);
	if (!entries.length) return null;
	const dom = faceElement('span', 'drawn-comment');
	const shown = entries.slice(0, MOST_LISTED).map((e) => e.short);
	dom.textContent = `${m.glossary_list_label({ count: entries.length })}: ${shown.join(', ')}${entries.length > MOST_LISTED ? ', …' : ''}`;
	return tippedFace(dom, entries.map((e) => (e.long ? `${e.short} - ${e.long}` : e.short)).join('\n'), { line: true });
}
