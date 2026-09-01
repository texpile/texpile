// curated UI field lists per entry type; full BibLaTeX would mean ~41 optional fields for article
import { m } from '$lib/paraglide/messages';
import { classicEntryTypes } from './entryTypesClassic';
import { modernEntryTypes } from './entryTypesModern';
import { OFFERED_ENTRY_TYPES } from './bibCompletion';

export type FieldConfig = {
	name: string;
	label: string;
	type: 'text' | 'number' | 'textarea' | 'select';
	required: boolean;
	placeholder?: string;
	helpText?: string;
};

export type EntryTypeConfig = {
	name: string;
	label: string;
	fields: FieldConfig[];
};

// built per call, never cached in a module-level const: this module is imported before
// settings.ts applies the saved uiLocale, so a cached config would freeze on the base locale
export function commonFields(): FieldConfig[] {
	return [
		{
			name: 'key',
			label: m.bibfield_label_citation_key(),
			type: 'text',
			required: true,
			helpText: m.bibfield_help_citation_key()
		},
		{
			name: 'author',
			label: m.bibfield_label_author(),
			type: 'text',
			required: true,
			helpText: m.bibfield_help_author()
		},
		{
			name: 'title',
			label: m.bibfield_label_title(),
			type: 'text',
			required: true
		},
		{
			name: 'year',
			label: m.bibfield_label_year(),
			type: 'text',
			required: true,
			helpText: m.bibfield_help_year()
		}
	];
}

export function getEntryTypeConfigs(): Record<string, EntryTypeConfig> {
	return { ...classicEntryTypes(), ...modernEntryTypes() };
}
export function getFieldsForType(entrytype: string): FieldConfig[] {
	const config = getEntryTypeConfigs()[entrytype];
	return config ? config.fields : commonFields();
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

export function getRequiredFields(entrytype: string): string[] {
	const fields = getFieldsForType(entrytype);
	return fields.filter((f) => f.required).map((f) => f.name);
}
