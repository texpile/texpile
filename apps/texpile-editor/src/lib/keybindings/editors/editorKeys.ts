// an editor's own commands on the keys the manager has for them: each editor keeps its command functions and its place
// in its keymap order, and asks here which of them a pressed key is
import { isMac } from '$lib/platform';
import { sameChord } from '../keys/keyChord';
import { chordOfEvent } from '../keys/keyEvent';
import { contextAt } from '../context/contextKeys';
import { evaluateWhen } from '../when/whenExpression';
import { keybindingTable } from '../keybindings.svelte';

/** the commands of `own` a key press names, best first: the last entry in force wins, as in the dispatcher */
export function commandsForKey(e: KeyboardEvent, own: ReadonlySet<string>): string[] {
	const chord = chordOfEvent(e, isMac);
	if (!chord) return [];
	const read = contextAt(e.target);
	const found: string[] = [];
	const items = keybindingTable().items;
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		if (!own.has(item.command) || item.keys?.length !== 1 || !sameChord(item.keys[0], chord)) continue;
		if (item.when && !evaluateWhen(item.when, read)) continue;
		if (!found.includes(item.command)) found.push(item.command);
	}
	return found;
}

/** for a widget with its own key listener: whether this press is the command's key there */
export function isCommandKey(e: KeyboardEvent, command: string): boolean {
	return commandsForKey(e, new Set([command])).length > 0;
}
