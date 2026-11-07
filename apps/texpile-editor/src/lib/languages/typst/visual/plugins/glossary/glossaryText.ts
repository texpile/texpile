// what a glossary call prints, by the templates the package data records, over the entry's fields
import { type GlossaryFields } from './glossaryEntries';

function fieldOf(fields: GlossaryFields, name: string): string | null {
	if (name === 'short') return fields.short ?? fields.key;
	if (name === 'plural') return fields.plural ?? (fieldOf(fields, 'short') ?? '') + 's';
	if (name === 'longplural') return fields.longplural ?? (fields.long === undefined ? null : `${fields.long}s`);
	return (fields as Record<string, string | undefined>)[name] ?? null;
}

export function fillTemplate(template: string, fields: GlossaryFields): string | null {
	let missing = false;
	const text = template.replace(/\{(\w+)\}/g, (_whole, written: string) => {
		const value = fieldOf(fields, written.charAt(0).toLowerCase() + written.slice(1));
		if (value === null) missing = true;
		return written.charAt(0) === written.charAt(0).toLowerCase()
			? (value ?? '')
			: (value ?? '').charAt(0).toUpperCase() + (value ?? '').slice(1);
	});
	return missing ? null : text;
}
