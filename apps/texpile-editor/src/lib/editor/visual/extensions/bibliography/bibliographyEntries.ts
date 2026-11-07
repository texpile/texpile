export type ReferenceFields = Record<string, string | undefined>;

function sortKey(r: ReferenceFields): string {
	return (r.author || r.editor || r.title || r.key || '').toLowerCase();
}

export function sortedReferences(list: readonly unknown[]): ReferenceFields[] {
	return (list as ReferenceFields[]).slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

export function yearOf(r: ReferenceFields): string {
	return r.year || r.date?.slice(0, 4) || 'n.d.';
}

export function containerOf(r: ReferenceFields): string {
	return r.journaltitle || r.journal || r.booktitle || '';
}

export function publisherOf(r: ReferenceFields): string {
	return [r.publisher, r.location].filter(Boolean).join(', ');
}

export function authorsOf(r: ReferenceFields): string {
	const list = (r.author || r.editor || '')
		.split(/\s+and\s+/i)
		.map((s) => s.trim())
		.filter(Boolean);
	if (list.length <= 1) return list[0] ?? '';
	if (list.length === 2) return `${list[0]} and ${list[1]}`;
	return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

export type EntryPart = { text: string; look: 'plain' | 'muted' | 'title' };

export function entryParts(r: ReferenceFields): EntryPart[] {
	const parts: EntryPart[] = [];
	const authors = authorsOf(r);
	if (authors) parts.push({ text: `${authors} `, look: 'plain' });
	parts.push({ text: `(${yearOf(r)}). `, look: 'muted' });
	if (r.title) parts.push({ text: `${r.title}. `, look: 'title' });
	if (containerOf(r)) parts.push({ text: `${containerOf(r)}. `, look: 'plain' });
	if (publisherOf(r)) parts.push({ text: `${publisherOf(r)}.`, look: 'muted' });
	return parts;
}
