/**
 * How a citation reads on the page, which depends on the COMMAND, not on the work being cited.
 *
 * \citet and \textcite put the author into the running sentence and bracket only the year, so
 * drawing them parenthesised misreads the sentence they belong to: "As (Devlin et al. 2019)
 * showed", for source that will print "As Devlin et al. (2019) showed".
 *
 * Whether the brackets hold an author-year or a number is NOT knowable here - that is the
 * bibliography style's call, and \bibliographystyle is not something this reads. Author-year is
 * the useful guess either way: while you are writing, who beats [3].
 */
const TEXTUAL = new Set(['citet', 'textcite']);

export type CitedWork = { author?: string; year?: string; unresolved?: string };

export function citationText(variant: string, works: CitedWork[], prenote: string, postnote: string): string {
	// an unresolved key falls back to the parenthetical form, which is the one that can show it
	if (TEXTUAL.has(variant) && works.length > 0 && works.every((w) => w.unresolved == null)) {
		const body = works.map((w) => `${w.author} (${[w.year, postnote].filter(Boolean).join(', ')})`).join('; ');
		return prenote ? `${prenote} ${body}` : body;
	}
	const body = works.map((w) => w.unresolved ?? `${w.author} ${w.year}`).join('; ');
	return `(${[prenote, body, postnote].filter(Boolean).join(', ')})`;
}
