/**
 * Loose reference: any syntactically valid .bib entry lands here, no schema enforcement
 * on the read path. Only key and entrytype are guaranteed; legacy names like journal/address
 * come through unmodified. Zod validation is opt-in via the visual form (./schema.ts).
 */
export type BiblatexReference = {
	/** the only field consumers can rely on. */
	key: string;
	/** lowercased, no normalization or alias mapping. */
	entrytype: string;

	title?: string;
	author?: string;
	year?: string;
	date?: string;
	journaltitle?: string;
	journal?: string;
	booktitle?: string;
	editor?: string;
	publisher?: string;
	location?: string;
	address?: string;
	pages?: string;
	volume?: string;
	number?: string;
	doi?: string;
	url?: string;
	isbn?: string;

	/** verbatim source from the .bib, written back untouched unless edited via the visual form. */
	raw?: string;
	printed?: string;
	printedAuthor?: string;
	/** best-effort short label for citation autocomplete. */
	displayLabel?: string;
	/** a % comment inside the entry body; the visual form can't round-trip it, so the entry demotes to raw. */
	hasInlineComment?: boolean;

	// escape hatch for anything else the parser found; boolean only covers hasInlineComment
	[k: string]: string | boolean | undefined;
};
