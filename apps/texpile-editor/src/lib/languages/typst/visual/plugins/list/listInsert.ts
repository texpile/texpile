import { List, ListOrdered } from '@lucide/svelte';
import type { ListAttributes } from 'prosemirror-flat-list';
import { createWrapInListCommand } from 'prosemirror-flat-list';
import type { BlockInsertItem } from '$lib/languages/typst/visual/core';
import { m } from '$lib/paraglide/messages';

function listStyle(kind: 'bullet' | 'ordered', label: string, icon: BlockInsertItem['icon']): BlockInsertItem {
	const attrs = { kind, order: kind === 'ordered' ? 1 : null, checked: null, collapsed: false };
	return {
		id: kind,
		label,
		icon,
		category: 'text',
		shape: 'block',
		style: true,
		select: 'in',
		make: (s) => s.nodes.list.create(attrs, s.nodes.paragraph.create()),
		turn: createWrapInListCommand(attrs as unknown as ListAttributes),
		is: (node) => node.type.name === 'list' && node.attrs.kind === kind
	};
}

export function listInserts(): BlockInsertItem[] {
	return [listStyle('bullet', m.blockmenu_bullet_list(), List), listStyle('ordered', m.blockmenu_numbered_list(), ListOrdered)];
}
