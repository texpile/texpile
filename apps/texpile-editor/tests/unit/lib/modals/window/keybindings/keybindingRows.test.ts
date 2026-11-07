import { describe, expect, it } from 'vitest';
import type { CommandInfo } from '$lib/keybindings/commands/commandRegistry';
import { buildKeybindingTable } from '$lib/keybindings/resolver/keybindingResolver';
import { defaultItems, userItems } from '$lib/keybindings/resolver/keybindingRules';
import { buildKeybindingRows } from '$lib/modals/window/keybindings/keybindingRows';

const command = (id: string): CommandInfo => ({ id, title: () => id, category: () => '' });

describe('keyboard shortcuts rows', () => {
	it('sorts by precedence with the entry that wins first, then the commands with no key', () => {
		const defaults = defaultItems(
			[
				{ command: 'a.first', key: 'mod+1' },
				{ command: 'b.second', key: 'mod+2' }
			],
			'linux'
		);
		const user = userItems([{ key: 'mod+3', command: 'a.first' }], false).items;
		const table = buildKeybindingTable(defaults, user);
		const catalog = ['a.first', 'b.second', 'c.unbound'].map(command);
		const rows = buildKeybindingRows(table, catalog, (id) => id, 'linux', true).filter((r) => !r.builtin);
		expect(rows.map((r) => `${r.command} ${r.item?.source ?? 'none'}`)).toEqual([
			'a.first user',
			'b.second default',
			'a.first default',
			'c.unbound none'
		]);
	});
});
