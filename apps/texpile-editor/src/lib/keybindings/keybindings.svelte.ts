// the keys in force: the defaults, the user's keybindings.json over them, the window's dispatch and every label
import { untrack } from 'svelte';
import { box } from '$lib/runes/box.svelte';
import { childWindows } from '$lib/childWindows/childWindowRegistry.svelte';
import { isMac, isWindows } from '$lib/platform';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import type { KeySequence } from './keys/keyChord';
import { electronAccelerator, keysLabel } from './keys/keyLabels';
import { commandEnabled, runCommand } from './commands/commandRegistry';
import { createKeyDispatcher } from './dispatch/keyDispatcher';
import { buildKeybindingTable, keysOf, menuKeysOf, type KeybindingItem, type KeybindingTable } from './resolver/keybindingResolver';
import { defaultItems, userItems, type KeyPlatform, type KeybindingProblem } from './resolver/keybindingRules';
import { DEFAULT_KEYBINDINGS } from './resolver/defaultKeybindings';
import { windowContext } from './context/contextKeys';
import { settings } from '$lib/settings';

export const keyPlatform: KeyPlatform = isMac ? 'mac' : isWindows ? 'win' : 'linux';

const defaults = defaultItems(DEFAULT_KEYBINDINGS, keyPlatform);

windowContext.setAll({
	isMac,
	isWindows,
	isLinux: !isMac && !isWindows,
	editorKeymap: () => settings.current.editorKeymap ?? 'default'
});

export type UserKeybindings = {
	items: KeybindingItem[];
	problems: KeybindingProblem[];
	/** the file is there but is no JSON array: none of it applies */
	unreadable: boolean;
};

const user = box<UserKeybindings>({ items: [], problems: [], unreadable: false });

let built: { for: KeybindingItem[]; table: KeybindingTable } | null = null;

/** reactive: reading it in a component or effect follows changes to keybindings.json */
export function keybindingTable(): KeybindingTable {
	const items = user.current.items;
	if (built?.for !== items) built = { for: items, table: buildKeybindingTable(defaults, items) };
	return built.table;
}

export function userKeybindings(): UserKeybindings {
	return user.current;
}

/** the parsed contents of keybindings.json; null for a file that is missing or empty */
export function applyUserKeybindings(entries: unknown[] | null, unreadable = false): void {
	const read = entries ? userItems(entries, isMac) : { items: [], problems: [] };
	user.current = { ...read, unreadable };
}

export function keysFor(command: string): KeySequence | null {
	return keysOf(keybindingTable(), command);
}

/** '' for a command with no key */
export function keyLabel(command: string): string {
	const keys = keysFor(command);
	return keys ? keysLabel(keys) : '';
}

/** a message with a {combo} slot for the key; with no key the brackets around it go too */
export function withKeyLabel(message: (combo: string) => string, command: string): string {
	const key = keyLabel(command);
	return key ? message(key) : message('').replace(/\s*[(（]\s*[)）]/u, '');
}

export function acceleratorFor(command: string): string | null {
	const keys = menuKeysOf(keybindingTable(), command);
	return keys ? electronAccelerator(keys) : null;
}

let chordToast: string | undefined;

const dispatch = createKeyDispatcher({
	table: keybindingTable,
	canRun: commandEnabled,
	run: (item) => runCommand(item.command, item.args),
	onChord(pressed, missed) {
		if (chordToast) toaster.dismiss(chordToast);
		chordToast = undefined;
		if (pressed)
			chordToast = toaster.create({ type: 'info', title: m.keybindings_chord_waiting({ keys: keysLabel(pressed) }), duration: 5000 });
		else if (missed) toaster.info({ title: m.keybindings_chord_missed(), duration: 3000 });
	},
	mac: isMac
});

/** the window's editors in windows of their own get the same keys */
export function followChildWindows(): () => void {
	return $effect.root(() => {
		$effect(() => {
			const wins = childWindows.list;
			const off = untrack(() => wins.map((w) => installKeyDispatch(w)));
			return () => off.forEach((stop) => stop());
		});
	});
}

/** first in line: installed before any other keydown listener of the window */
export function installKeyDispatch(win: Window): () => void {
	win.addEventListener('keydown', dispatch.capture, true);
	win.addEventListener('keydown', dispatch.late);
	return () => {
		win.removeEventListener('keydown', dispatch.capture, true);
		win.removeEventListener('keydown', dispatch.late);
	};
}
