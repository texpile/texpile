import { Table } from '@lucide/svelte';
import { createTableNode, type LatexInsertContext, type LatexInsertOffer } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

export function tableInserts(ctx: LatexInsertContext): LatexInsertOffer[] {
	const grids = ctx.environments().filter((e) => e.cells && !e.in && !e.body);
	return [
		{
			id: 'table',
			label: m.blockmenu_table(),
			icon: Table,
			category: 'common',
			shape: 'block',
			style: false,
			select: 'cell',
			make: (s) => createTableNode(s, 3, 3, true),
			covers: ['table', 'table*', ...grids.map((e) => e.name)]
		}
	];
}
