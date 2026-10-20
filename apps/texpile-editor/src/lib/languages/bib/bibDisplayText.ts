// A bib field as the reader sees it: TeX accents decoded, protective braces gone, ties as
// spaces. Display only; the field itself keeps its bytes.
import { decodeTexCharacters } from '$lib/languages/latex/knowledge/commands/texCharacters';

/** the author part of a citation chip, the way author-year styles print it: Knuth; Lamport and
 * Müller; Smith et al. */
export function bibAuthorShort(raw: string | undefined | null): string {
	const names = bibDisplayText(raw)
		.split(/\s+and\s+/)
		.map((n) => n.trim())
		.filter(Boolean);
	if (names.length === 0) return '';
	const etAl = names.length > 2 || names[names.length - 1].toLowerCase() === 'others';
	if (etAl) return `${surname(names[0])} et al.`;
	return names.map(surname).join(' and ');
}

function surname(name: string): string {
	const comma = name.indexOf(',');
	if (comma > 0) return name.slice(0, comma).trim();
	const parts = name.split(/\s+/);
	return parts[parts.length - 1] ?? '';
}

export function bibDisplayText(raw: string | undefined | null): string {
	if (!raw) return '';
	return decodeTexCharacters(raw).replace(/[{}]/g, '').replace(/~/g, ' ').normalize('NFC').replace(/\s+/g, ' ').trim();
}
