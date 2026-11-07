// the forms a typst citation takes, as the citation editor offers them
import { m } from '$lib/paraglide/messages';

/** the select's value for no form: the style decides, and the citation is written `@key` */
export const AUTO_FORM = 'auto';

export type CiteFormOption = { value: string; label: string; desc: string };

export function citeFormOptions(current: string | null): CiteFormOption[] {
	const options: CiteFormOption[] = [
		{ value: AUTO_FORM, label: m.citation_variant_automatic_label(), desc: m.citation_variant_automatic_desc() },
		{ value: 'prose', label: m.citation_variant_intext_label(), desc: m.citation_variant_intext_desc() },
		{ value: 'author', label: m.citation_form_author_label(), desc: m.citation_form_author_desc() },
		{ value: 'year', label: m.citation_form_year_label(), desc: m.citation_form_year_desc() },
		{ value: 'full', label: m.citation_form_full_label(), desc: m.citation_form_full_desc() }
	];
	// `form: "normal"` spelled out is the style's own citation, as Automatic is; it stays on the list
	// while the citation has it, or the select would show blank and the first touch rewrite it
	if (current !== 'normal') return options;
	return [...options, { value: 'normal', label: m.citation_variant_basic_label(), desc: m.citation_variant_basic_desc() }];
}
