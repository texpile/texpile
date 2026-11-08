// the shortcuts table's rows: every entry in force, one per key, and every command without one, so it can get one
import { keysText, type KeySequence } from '$lib/keybindings/keys/keyChord';
import { keysLabel } from '$lib/keybindings/keys/keyLabels';
import { printWhen } from '$lib/keybindings/when/whenExpression';
import type { CommandInfo } from '$lib/keybindings/commands/commandRegistry';
import type { KeybindingItem, KeybindingTable } from '$lib/keybindings/resolver/keybindingResolver';
import { BUILTIN_KEYS, builtinCategory, builtinKeys } from '$lib/keybindings/catalog/builtinKeys';
import type { KeyPlatform } from '$lib/keybindings/resolver/keybindingRules';

export type KeybindingRow = {
	key: string;
	command: string;
	title: string;
	category: string;
	/** null for a command with no key */
	item: KeybindingItem | null;
	/** the keys of a library's own binding, which the table shows and leaves alone */
	builtin?: KeySequence;
};

export function buildKeybindingRows(
	table: KeybindingTable,
	catalog: CommandInfo[],
	titleOf: (command: string) => string,
	platform: KeyPlatform,
	byPrecedence = false
): KeybindingRow[] {
	const byId = new Map(catalog.map((c) => [c.id, c]));
	const rows: KeybindingRow[] = [];
	const bound = new Set<string>();
	for (const item of table.items) {
		if (!item.keys) continue;
		bound.add(item.command);
		rows.push({
			key: `${item.source}:${item.index}`,
			command: item.command,
			title: titleOf(item.command),
			category: byId.get(item.command)?.category() ?? '',
			item
		});
	}
	for (const c of catalog)
		if (!bound.has(c.id)) rows.push({ key: `none:${c.id}`, command: c.id, title: titleOf(c.id), category: c.category(), item: null });
	for (const entry of BUILTIN_KEYS)
		for (const [i, keys] of builtinKeys(entry, platform).entries())
			rows.push({
				key: `builtin:${entry.id}:${i}`,
				command: '',
				title: entry.title(),
				category: builtinCategory(),
				item: null,
				builtin: keys
			});
	const rank = new Map(table.items.map((item, i) => [item, i]));
	// keyed rows first, then by title, a user's entry before the default it overrides
	return rows.sort(
		(a, b) =>
			+!(a.item || a.builtin) - +!(b.item || b.builtin) ||
			(byPrecedence ? +!a.item - +!b.item || (rank.get(b.item!) ?? 0) - (rank.get(a.item!) ?? 0) : 0) ||
			a.title.localeCompare(b.title) ||
			+(a.item?.source !== 'user') - +(b.item?.source !== 'user') ||
			a.key.localeCompare(b.key)
	);
}

export function keysOfRow(row: KeybindingRow): KeySequence | null {
	return row.builtin ?? row.item?.keys ?? null;
}

/** as VS Code does, the id shows only when the search found it */
export function searchMatchesId(row: KeybindingRow, query: string): boolean {
	const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	return !!row.command && words.some((w) => row.command.toLowerCase().includes(w));
}

/** the entry as keybindings.json writes it, for Copy */
export function keybindingEntryText(row: KeybindingRow): string {
	const keys = keysOfRow(row);
	const entry: Record<string, string> = { key: keys ? keysText(keys) : '', command: row.command };
	if (row.item?.when) entry.when = printWhen(row.item.when);
	return JSON.stringify(entry, null, '\t');
}

/** "@command:file.save", "@source:user", a quoted key as the recorder writes it ("mod+s"), or words */
export function filterKeybindingRows(rows: KeybindingRow[], query: string): KeybindingRow[] {
	const q = query.trim();
	if (!q) return rows;
	const command = /^@command:(\S+)$/.exec(q);
	if (command) return rows.filter((r) => r.command === command[1]);
	const source = /^@source:(user|default|builtin)$/i.exec(q);
	if (source) return rows.filter((r) => (r.builtin ? 'builtin' : r.item?.source) === source[1].toLowerCase());
	const quoted = /^"(.+)"$/.exec(q);
	if (quoted) return rows.filter((r) => keysOfRow(r) && keysText(keysOfRow(r)!) === quoted[1]);
	const words = q.toLowerCase().split(/\s+/);
	return rows.filter((r) => {
		const keys = keysOfRow(r);
		const text = [
			r.title,
			r.command,
			r.category,
			r.item?.when ? printWhen(r.item.when) : '',
			keys ? keysLabel(keys) : '',
			keys ? keysText(keys) : ''
		]
			.join(' ')
			.toLowerCase();
		return words.every((w) => text.includes(w));
	});
}
