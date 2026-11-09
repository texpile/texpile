// VS Code's rules: defaults, then the user's entries; a "-command" entry removes defaults only, narrowed by its key
// (a prefix of the default's chords) and its when; the last entry whose when holds wins
import { chordId, sameChord, type KeyChord, type KeySequence } from '../keys/keyChord';
import { evaluateWhen, printWhen, type ContextReader, type WhenExpression } from '../when/whenExpression';

export type KeybindingSource = 'default' | 'user';

export type KeybindingItem = {
	command: string;
	/** null for a removal that names no key */
	keys: KeySequence | null;
	when: WhenExpression | null;
	args?: unknown;
	source: KeybindingSource;
	/** where it sits in its own list: the defaults, or the user's file */
	index: number;
	/** an app key an editor also uses: it runs only when no editor took the key */
	late?: boolean;
	/** a default the editor with the focus runs from its own keymap, never the window */
	editor?: boolean;
};

export type KeybindingTable = {
	/** after removals, in precedence order: the last wins */
	items: KeybindingItem[];
	byFirstChord: Map<string, KeybindingItem[]>;
	/** commands with a default key, removed or not */
	defaultBound: Set<string>;
};

export type ResolveResult = { kind: 'none' } | { kind: 'more' } | { kind: 'found'; item: KeybindingItem };

function whenText(when: WhenExpression | null): string {
	return when ? printWhen(when) : '';
}

function removes(removal: KeybindingItem, item: KeybindingItem): boolean {
	if (item.source !== 'default' || item.command !== removal.command.slice(1)) return false;
	if (removal.keys) {
		if (!item.keys || item.keys.length < removal.keys.length) return false;
		if (!removal.keys.every((chord, i) => sameChord(chord, item.keys![i]))) return false;
	}
	return !removal.when || whenText(removal.when) === whenText(item.when);
}

/** a user key runs where the command's default runs: late, or from the editor's keymap */
function withDefaultPhase(entry: KeybindingItem, defaults: KeybindingItem[]): KeybindingItem {
	if (entry.keys?.length !== 1) return entry;
	const own = defaults.filter((d) => d.command === entry.command);
	if (!own.some((d) => d.late || d.editor)) return entry;
	return { ...entry, late: own.some((d) => d.late), editor: own.some((d) => d.editor) };
}

export function buildKeybindingTable(defaults: KeybindingItem[], user: KeybindingItem[]): KeybindingTable {
	const removals = user.filter((u) => u.command.startsWith('-'));
	const kept = defaults.filter((d) => !removals.some((r) => removes(r, d)));
	const added = user.filter((u) => !u.command.startsWith('-') && u.command).map((u) => withDefaultPhase(u, defaults));
	const items = [...kept, ...added];
	const byFirstChord = new Map<string, KeybindingItem[]>();
	for (const item of items) {
		if (!item.keys?.length || item.when?.kind === 'false') continue;
		const id = chordId(item.keys[0]);
		const list = byFirstChord.get(id);
		if (list) list.push(item);
		else byFirstChord.set(id, [item]);
	}
	return { items, byFirstChord, defaultBound: new Set(defaults.filter((d) => d.keys).map((d) => d.command)) };
}

/** `canRun` is the command's own say: one that cannot run now leaves the key to the next entry */
export function resolveKeys(
	table: KeybindingTable,
	pressed: KeyChord[],
	read: ContextReader,
	canRun: (command: string) => boolean,
	late = false
): ResolveResult {
	const candidates = table.byFirstChord.get(chordId(pressed[0])) ?? [];
	for (let i = candidates.length - 1; i >= 0; i--) {
		const item = candidates[i];
		if (!!item.late !== late || item.editor) continue;
		const keys = item.keys!;
		if (keys.length < pressed.length || !pressed.every((chord, at) => sameChord(chord, keys[at]))) continue;
		if (item.when && !evaluateWhen(item.when, read)) continue;
		if (!canRun(item.command)) continue;
		return keys.length > pressed.length ? { kind: 'more' } : { kind: 'found', item };
	}
	return { kind: 'none' };
}

/** the key a label shows: the user's last entry for it, else the first default; with `read`, one that holds there */
export function keysOf(table: KeybindingTable, command: string, read?: ContextReader): KeySequence | null {
	function holds(item: KeybindingItem): boolean {
		return item.command === command && !!item.keys && (!read || !item.when || evaluateWhen(item.when, read));
	}
	for (let i = table.items.length - 1; i >= 0 && table.items[i].source === 'user'; i--)
		if (holds(table.items[i])) return table.items[i].keys;
	return table.items.find((item) => item.source === 'default' && holds(item))?.keys ?? null;
}

/** every entry on these exact keys, for the define dialog's count and Show Same Keybindings */
export function itemsOnKeys(table: KeybindingTable, keys: KeySequence): KeybindingItem[] {
	return table.items.filter((item) => item.keys?.length === keys.length && item.keys.every((c, i) => sameChord(c, keys[i])));
}
