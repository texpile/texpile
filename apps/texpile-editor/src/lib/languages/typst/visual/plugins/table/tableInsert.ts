import { Table } from '@lucide/svelte';
import { typTableNode, type BlockInsertItem } from '$lib/languages/typst/visual/core';
import { m } from '$lib/paraglide/messages';

export function tableInserts(): BlockInsertItem[] {
	return [
		{
			id: 'table',
			label: m.blockmenu_table(),
			icon: Table,
			category: 'common',
			shape: 'block',
			style: false,
			select: 'cell',
			make: (s) => typTableNode(s)
		}
	];
}
