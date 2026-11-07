import { SquareRadical } from '@lucide/svelte';
import type { BlockInsertItem } from '$lib/languages/typst/visual/core';
import { m } from '$lib/paraglide/messages';

export function mathInserts(): BlockInsertItem[] {
	return [
		{
			id: 'displaymath',
			label: m.blockmenu_math_block(),
			icon: SquareRadical,
			category: 'common',
			shape: 'block',
			style: false,
			select: 'node',
			make: (s) => s.nodes.block_math.create({}, s.text(' '))
		}
	];
}
