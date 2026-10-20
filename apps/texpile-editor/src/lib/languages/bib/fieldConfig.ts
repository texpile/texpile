// curated UI field lists per entry type; full BibLaTeX would mean ~41 optional fields for article
import { m } from '$lib/paraglide/messages';
import { classicEntryTypes } from './entryTypesClassic';
import { modernEntryTypes } from './entryTypesModern';
import { BIB_MANDATORY, OFFERED_ENTRY_TYPES } from '$lib/languages/latex/knowledge/registries/bibModel';

export type FieldConfig = {
	name: string;
	label: string;
	type: 'text' | 'number' | 'textarea' | 'select';
	required: boolean;
	placeholder?: string;
	helpText?: string;
};

/** a field as the curated lists write it: whether it is required comes from biblatex's data */
export type FieldSpec = Omit<FieldConfig, 'required'>;

export type EntryTypeConfig = {
	name: string;
	label: string;
	fields: FieldConfig[];
};

export type EntryTypeSpec = Omit<EntryTypeConfig, 'fields'> & { fields: FieldSpec[] };

// built per call, never cached in a module-level const: this module is imported before
// settings.ts applies the saved uiLocale, so a cached config would freeze on the base locale
export function commonFields(): FieldSpec[] {
	return [
		{ name: 'key', label: m.bibfield_label_citation_key(), type: 'text', helpText: m.bibfield_help_citation_key() },
		{ name: 'author', label: m.bibfield_label_author(), type: 'text', helpText: m.bibfield_help_author() },
		{ name: 'title', label: m.bibfield_label_title(), type: 'text' },
		{ name: 'year', label: m.bibfield_label_year(), type: 'text', helpText: m.bibfield_help_year() }
	];
}

// the citation key is BibTeX syntax; every other requirement is a biblatex rule that names the field
function withRequired(entrytype: string, fields: FieldSpec[]): FieldConfig[] {
	const shown = new Set(fields.map((f) => f.name));
	// a one-of rule stars the first of its fields the form has an input for
	const mandatory = new Set(
		(BIB_MANDATORY[entrytype] ?? []).flatMap((rule) => rule.all ?? [(rule.xor ?? rule.or ?? []).find((f) => shown.has(f)) ?? ''])
	);
	return fields.map((f) => ({ ...f, required: f.name === 'key' || mandatory.has(f.name) }));
}

export function getEntryTypeConfigs(): Record<string, EntryTypeConfig> {
	const specs: Record<string, EntryTypeSpec> = { ...classicEntryTypes(), ...modernEntryTypes() };
	return Object.fromEntries(Object.entries(specs).map(([name, t]) => [name, { ...t, fields: withRequired(name, t.fields) }]));
}

export function getFieldsForType(entrytype: string): FieldConfig[] {
	const config = getEntryTypeConfigs()[entrytype];
	return config ? config.fields : withRequired(entrytype, commonFields());
}

/**
 * Every entry type biblatex defines, the ones with a form first and named in the user's language.
 *
 * The rest are offered under their own names rather than left out: choosing one is how you write a
 * @patent or a @periodical, and the entry keeps working either way - an entry the form cannot
 * represent is shown as editable source instead (see fits.ts), never dropped.
 */
export function getEntryTypeOptions(): Array<{ value: string; label: string }> {
	const curated = Object.values(getEntryTypeConfigs()).map((config) => ({ value: config.name, label: config.label }));
	const named = new Set(curated.map((o) => o.value));
	const rest = OFFERED_ENTRY_TYPES.filter((t) => !named.has(t))
		.sort()
		.map((t) => ({ value: t, label: `@${t}` }));
	return [...curated, ...rest];
}
