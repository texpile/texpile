// what an outline is called, on its line in the page and over its panel
import type { OutlineCall, OutlineShows } from './outlineCall';
import { m } from '$lib/paraglide/messages';

export const OUTLINE_NAMES: Record<OutlineShows, () => string> = {
	headings: m.drawn_chip_typst_outline_contents,
	figures: m.drawn_chip_typst_outline_figures,
	tables: m.drawn_chip_typst_outline_tables,
	other: m.drawn_chip_typst_outline_other
};

/** its name, then the title it was given and how many heading levels it lists */
export function outlineLabel(outline: OutlineCall): string {
	const title = outline.title.kind === 'written' ? outline.title.text.replace(/\s+/g, ' ').trim() : '';
	const depth = outline.depth !== null && outline.shows === 'headings' ? m.drawn_chip_typst_outline_levels({ count: outline.depth }) : '';
	return [OUTLINE_NAMES[outline.shows](), title, depth].filter(Boolean).join(' · ');
}
