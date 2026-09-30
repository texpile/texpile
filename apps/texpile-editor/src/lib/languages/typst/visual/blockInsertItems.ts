// Insert-menu entries for the typst block handle (the + / drag / delete gutter): only
// constructs typSchema can hold. Same BlockInsertItem contract as the LaTeX and markdown lists,
// so the shared BlockHandle renders any of them. No table/math/image entries until those have
// typst-aware nodes — the menu must not be able to create what the serializer can't emit.
import {
	Type,
	Heading1,
	Heading2,
	Heading3,
	List,
	ListOrdered,
	Code,
	Minus,
	Table as TableIcon,
	SeparatorHorizontal,
	MoveVertical,
	TableOfContents,
	FileCode2
} from '@lucide/svelte';
import type { Schema, Node as PMNode } from 'prosemirror-model';
import type { BlockInsertItem } from '$lib/editor/visual/extensions/blockInsertItems';
import { generateLabel } from '$lib/editor/visual/label';
import { m } from '$lib/paraglide/messages';

/** a call the visual editor draws, as a block of Typst of its own; its panel opens on Enter */
function typstBlock(schema: Schema, source: string): PMNode {
	return schema.nodes.raw_latex.create(null, schema.text(source));
}

function listItem(schema: Schema, kind: 'bullet' | 'ordered') {
	return schema.nodes.list.create(
		{ kind, order: kind === 'ordered' ? 1 : null, checked: null, collapsed: false },
		schema.nodes.paragraph.create()
	);
}

/** rows x cols table; with `header`, the first row serializes as table.header (needs a body row
 * under it). numbered wraps it in a table_wrapper (#figure), which is what typst numbers; the
 * caption starts EMPTY on purpose - typst captions are optional, so no placeholder text that
 * would publish as written (the caption slot shows a click-to-edit hint instead). */
export function typTableNode(schema: Schema, rows = 3, cols = 2, numbered = false, header = true): PMNode {
	function p() {
		return schema.nodes.paragraph.createAndFill()!;
	}
	function cell(type: 'table_header' | 'table_cell') {
		return schema.nodes[type].createAndFill(null, p())!;
	}
	function row(type: 'table_header' | 'table_cell') {
		return schema.nodes.table_row.create(
			null,
			Array.from({ length: Math.max(1, cols) }, () => cell(type))
		);
	}
	const withHeader = header && rows >= 2;
	const rowNodes = Array.from({ length: Math.max(1, rows) }, (_, r) => row(withHeader && r === 0 ? 'table_header' : 'table_cell'));
	const table = schema.nodes.table.create(null, rowNodes);
	if (!numbered) return table;
	const caption = schema.nodes.table_caption.create();
	return schema.nodes.table_wrapper.create({ label: generateLabel('table'), showNotes: false }, [caption, table]);
}

export const TYP_BLOCK_INSERT_ITEMS: BlockInsertItem[] = [
	{ label: () => m.blockmenu_text(), icon: Type, make: (s) => s.nodes.paragraph.create(), select: 'in' },
	{ label: () => m.mdtoolbar_heading_n({ n: 1 }), icon: Heading1, make: (s) => s.nodes.heading.create({ level: 1 }), select: 'in' },
	{ label: () => m.mdtoolbar_heading_n({ n: 2 }), icon: Heading2, make: (s) => s.nodes.heading.create({ level: 2 }), select: 'in' },
	{ label: () => m.mdtoolbar_heading_n({ n: 3 }), icon: Heading3, make: (s) => s.nodes.heading.create({ level: 3 }), select: 'in' },
	{ label: () => m.blockmenu_bullet_list(), icon: List, make: (s) => listItem(s, 'bullet'), select: 'in' },
	{ label: () => m.blockmenu_numbered_list(), icon: ListOrdered, make: (s) => listItem(s, 'ordered'), select: 'in' },
	{ label: () => m.blockmenu_table(), icon: TableIcon, make: (s) => typTableNode(s), select: 'node' },
	{ label: () => m.mdtoolbar_hr(), icon: Minus, make: (s) => s.nodes.horizontal_rule.create(), select: 'node' },
	{
		label: () => m.blockmenu_code_block(),
		icon: Code,
		make: (s) => s.nodes.code_block.createAndFill({ env: 'fence', args: '' }),
		select: 'node'
	},
	{ label: () => m.drawn_chip_page_label(), icon: SeparatorHorizontal, make: (s) => typstBlock(s, '#pagebreak()'), select: 'node' },
	{ label: () => m.drawn_chip_space_vertical(), icon: MoveVertical, make: (s) => typstBlock(s, '#v(1em)'), select: 'node' },
	{ label: () => m.drawn_chip_typst_outline_contents(), icon: TableOfContents, make: (s) => typstBlock(s, '#outline()'), select: 'node' },
	{ label: () => m.blockmenu_raw_typst(), icon: FileCode2, make: (s) => s.nodes.raw_latex.createAndFill(), select: 'node' }
];
