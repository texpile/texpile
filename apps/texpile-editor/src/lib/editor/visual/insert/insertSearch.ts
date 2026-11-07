import { partLabel } from './insertCategories';
import type { InsertItem } from './insertItem';

/** 0 the label is the query, 1 starts with it, 2 holds it, 3 another match */
function rankOf(label: string, query: string): number {
	const text = label.toLowerCase();
	if (text === query) return 0;
	return text.startsWith(query) ? 1 : text.includes(query) ? 2 : 3;
}

/** the items whose label, name, package or category holds the words typed, best match first and in the list's order within a rank */
export function matchingItems<T extends InsertItem>(items: readonly T[], query: string): T[] {
	const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (!words.length) return [...items];
	const phrase = words.join(' ');
	return items
		.filter((item) => {
			const text = [item.label, item.id, item.hint ?? '', partLabel(item) ?? ''].join(' ').toLowerCase();
			return words.every((word) => text.includes(word));
		})
		.map((item, i) => ({ item, i, rank: rankOf(item.label, phrase) }))
		.sort((a, b) => a.rank - b.rank || a.i - b.i)
		.map(({ item }) => item);
}
