// the markdown block handle's list: only constructs mdSchema can hold, only markdown vocabulary
import type { Schema, Node as PMNode } from 'prosemirror-model';
import {
	Type,
	Heading1,
	Heading2,
	Heading3,
	List,
	ListOrdered,
	ListChecks,
	Quote,
	Table as TableIcon,
	SquareRadical,
	Code,
	Minus
} from '@lucide/svelte';
import type { BlockInsertItem } from '$lib/editor/visual/insert/insertItem';
import { m } from '$lib/paraglide/messages';

/** GFM tables need a header row; the defaults give 1 header + 2 body rows, 2 columns. */
export function mdTableNode(schema: Schema, rows = 3, cols = 2): PMNode {
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
	// `rows` counts the header row: a GFM pipe table always has one, the rest are body rows
	return schema.nodes.table.create(null, [row('table_header'), ...Array.from({ length: Math.max(1, rows - 1) }, () => row('table_cell'))]);
}

function listItem(schema: Schema, kind: 'bullet' | 'ordered' | 'task') {
	return schema.nodes.list.create(
		{ kind, order: kind === 'ordered' ? 1 : null, checked: kind === 'task' ? false : null, collapsed: false },
		schema.nodes.paragraph.create()
	);
}

type Shown = Pick<BlockInsertItem, 'id' | 'label' | 'icon' | 'category' | 'make' | 'select'>;

function item(shown: Shown): BlockInsertItem {
	return { ...shown, shape: 'block', style: false };
}

/** markdown has no class or packages: its list is the same for every file */
export function markdownInsertItems(): BlockInsertItem[] {
	return [
		item({
			id: 'paragraph',
			label: m.blockmenu_text(),
			icon: Type,
			category: 'mainText',
			make: (s) => s.nodes.paragraph.create(),
			select: 'in'
		}),
		...[Heading1, Heading2, Heading3].map((icon, i) =>
			item({
				id: `h${i + 1}`,
				label: m.mdtoolbar_heading_n({ n: i + 1 }),
				icon,
				category: 'sectioning',
				make: (s) => s.nodes.heading.create({ level: i + 1 }),
				select: 'in'
			})
		),
		item({
			id: 'bullet',
			label: m.blockmenu_bullet_list(),
			icon: List,
			category: 'lists',
			make: (s) => listItem(s, 'bullet'),
			select: 'in'
		}),
		item({
			id: 'ordered',
			label: m.blockmenu_numbered_list(),
			icon: ListOrdered,
			category: 'lists',
			make: (s) => listItem(s, 'ordered'),
			select: 'in'
		}),
		item({
			id: 'task',
			label: m.mdtoolbar_task_list(),
			icon: ListChecks,
			category: 'lists',
			make: (s) => listItem(s, 'task'),
			select: 'in'
		}),
		item({
			id: 'quote',
			label: m.blockmenu_quote(),
			icon: Quote,
			category: 'mainText',
			make: (s) => s.nodes.blockquote.create(null, s.nodes.paragraph.create()),
			select: 'in'
		}),
		item({ id: 'table', label: m.blockmenu_table(), icon: TableIcon, category: 'common', make: (s) => mdTableNode(s), select: 'cell' }),
		item({
			id: 'math',
			label: m.blockmenu_math_block(),
			icon: SquareRadical,
			category: 'common',
			make: (s) => s.nodes.block_math.create({}, s.text(' ')),
			select: 'after'
		}),
		item({
			id: 'code',
			label: m.blockmenu_code_block(),
			icon: Code,
			category: 'common',
			make: (s) => s.nodes.code_block.createAndFill({ env: 'fence', args: '' }),
			select: 'after'
		}),
		item({
			id: 'hr',
			label: m.mdtoolbar_hr(),
			icon: Minus,
			category: 'common',
			make: (s) => s.nodes.horizontal_rule.create(),
			select: 'after'
		})
	];
}
