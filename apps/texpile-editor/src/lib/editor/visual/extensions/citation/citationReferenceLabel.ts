import { bibDisplayText, bibAuthorShort } from '$lib/languages/bib/biblatex';

const MAX_LABEL_LENGTH = 70;

/** one line per bibliography entry, authors the way a citation prints them and the title capped: a
 *  20-author entry spelled out in full stretched the card across the window */
export function citationReferenceLabel(ref: { author?: string | string[]; year?: string; title?: string; key?: string }): string {
	const author = bibAuthorShort(Array.isArray(ref.author) ? ref.author.join(' and ') : ref.author);
	let s = author || ref.key || '';
	if (ref.year) s += ` (${ref.year})`;
	if (ref.title) s += `: ${bibDisplayText(ref.title)}`;
	return s.length > MAX_LABEL_LENGTH ? s.slice(0, MAX_LABEL_LENGTH - 1).trimEnd() + '…' : s;
}
