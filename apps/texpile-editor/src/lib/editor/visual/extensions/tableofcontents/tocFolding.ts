// the Contents list folded: which rows hold rows under them, which show while some are folded, and a key for each
// row that stays put as headings are added above it
import type { TocItem } from './tocStore';

/** heading level and occurrence, so two sections of one name fold apart and an edit above keeps the fold */
export function tocKeys(items: TocItem[]): string[] {
	const seen = new Map<string, number>();
	return items.map((item) => {
		const base = `${item.kind ?? 'heading'}:${item.level}:${item.text}`;
		const n = seen.get(base) ?? 0;
		seen.set(base, n + 1);
		return `${base}:${n}`;
	});
}

/** the rows right after it are deeper: it has something to fold */
export function tocHasChildren(items: TocItem[]): boolean[] {
	return items.map((item, i) => i + 1 < items.length && items[i + 1].level > item.level);
}

/** a folded row hides everything deeper after it, up to the next row at its level or above */
export function tocVisible(items: TocItem[], keys: string[], folded: ReadonlySet<string>): boolean[] {
	const out: boolean[] = [];
	let under: number | null = null;
	items.forEach((item, i) => {
		if (under !== null && item.level > under) return void out.push(false);
		under = folded.has(keys[i]) ? item.level : null;
		out.push(true);
	});
	return out;
}

/** a row and the headings it sits under, nearest first */
export function tocLineage(items: TocItem[], index: number): number[] {
	if (index < 0 || index >= items.length) return [];
	const out = [index];
	let level = items[index].level;
	for (let i = index - 1; i >= 0 && level > 1; i--) {
		if (items[i].level < level) {
			out.push(i);
			level = items[i].level;
		}
	}
	return out;
}

/**
 * the rows drawn folded: the reader's own folds, less the sections the caret is in, which show open while it is there.
 * `shut` are those the reader folded again with the caret inside
 */
export function tocFoldedNow(folded: ReadonlySet<string>, caretIn: string[], shut: ReadonlySet<string>): Set<string> {
	return new Set([...folded].filter((k) => !caretIn.includes(k) || shut.has(k)));
}

/** the row to mark for the caret's section: itself, or the folded row it is hidden under */
export function tocShownActive(items: TocItem[], visible: boolean[], active: number): number {
	if (active < 0 || visible[active]) return active;
	for (let i = active - 1; i >= 0; i--) if (visible[i] && items[i].level < items[active].level) return i;
	return -1;
}
