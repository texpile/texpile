import { Code } from '@lucide/svelte';
import type { BlockInsertItem } from '$lib/languages/typst/visual/core';
import { m } from '$lib/paraglide/messages';

export function rawInserts(): BlockInsertItem[] {
	return [
		{
			id: 'code',
			label: m.blockmenu_code_block(),
			icon: Code,
			category: 'common',
			shape: 'block',
			style: false,
			select: 'node',
			make: (s) => s.nodes.code_block.createAndFill({ env: 'fence', args: '' })
		}
	];
}
