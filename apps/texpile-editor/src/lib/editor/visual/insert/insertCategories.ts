import { m } from '$lib/paraglide/messages';
import { INSERT_CATEGORIES, type InsertCategory, type InsertItem } from './insertItem';

const LABELS: Record<Exclude<InsertCategory, 'common' | 'package'>, () => string> = {
	mainText: m.insert_category_main_text,
	sectioning: m.insert_category_sectioning,
	unnumbered: m.insert_category_unnumbered,
	lists: m.insert_category_lists,
	frontMatter: m.insert_category_front_matter,
	titling: m.insert_category_titling,
	frames: m.insert_category_frames,
	blocks: m.insert_category_blocks,
	columns: m.insert_category_columns,
	overlays: m.insert_category_overlays,
	theorems: m.insert_category_theorems,
	backMatter: m.insert_category_back_matter,
	floats: m.insert_category_floats,
	math: m.insert_category_math,
	environments: m.insert_category_environments,
	textStyles: m.insert_category_text_styles,
	text: m.insert_category_text,
	thisFile: m.insert_category_this_file,
	layout: m.insert_category_layout
};

/** the common part has no heading of its own, and a package's is its name */
export function categoryLabel(category: InsertCategory): string | null {
	return category === 'common' || category === 'package' ? null : LABELS[category]();
}

export type InsertGroup<T> = { key: string; category: InsertCategory; label: string | null; items: T[] };

/** the title of an item's part: its own, else its category's */
export function partLabel(item: { category: InsertCategory; part?: string }): string | null {
	return item.part ?? categoryLabel(item.category);
}

/** the items by part, in the list's order */
export function groupedByCategory<T extends { category: InsertCategory; part?: string }>(items: readonly T[]): InsertGroup<T>[] {
	const groups: InsertGroup<T>[] = [];
	for (const item of items) {
		const key = item.part ?? item.category;
		const last = groups.at(-1);
		if (last?.key === key) last.items.push(item);
		else groups.push({ key, category: item.category, label: partLabel(item), items: [item] });
	}
	return groups;
}

// in place: sections by level and the common part as their plugins give them, the rest by name
const KEPT_ORDER: ReadonlySet<InsertCategory> = new Set(['common', 'mainText', 'sectioning', 'unnumbered']);

export function inLyxOrder(items: InsertItem[]): InsertItem[] {
	function rank(c: InsertCategory): number {
		return INSERT_CATEGORIES.indexOf(c);
	}
	return items
		.map((item, i) => ({ item, i }))
		.sort((a, b) => {
			const byCategory = rank(a.item.category) - rank(b.item.category);
			if (byCategory || KEPT_ORDER.has(a.item.category)) return byCategory || a.i - b.i;
			return a.item.label.localeCompare(b.item.label);
		})
		.map(({ item }) => item);
}
