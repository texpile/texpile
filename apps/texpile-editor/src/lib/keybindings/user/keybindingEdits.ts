// what Preferences › Keyboard Shortcuts writes into keybindings.json, VS Code's way: changing a default adds an entry
// and a removal of the old key, reset takes both out again. Edits keep the file's comments and layout
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';
import { keysText, type KeySequence } from '../keys/keyChord';
import { printWhen, type WhenExpression } from '../when/whenExpression';
import type { KeybindingItem } from '../resolver/keybindingResolver';

export type KeybindingEntry = { key?: string; command: string; when?: string; args?: unknown };

export class UnreadableKeybindingsError extends Error {}

const FORMAT = { formattingOptions: { insertSpaces: false, tabSize: 1, eol: '\n' } };

/** the file's array; text with nothing in it but comments is an empty one */
export function readEntries(text: string): unknown[] {
	const errors: ParseError[] = [];
	const value: unknown = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
	if (value === undefined && !errors.length) return [];
	if (errors.length || !Array.isArray(value)) throw new UnreadableKeybindingsError();
	return value;
}

function entryOf(command: string, keys: KeySequence | null, when: WhenExpression | null, args?: unknown): KeybindingEntry {
	return {
		...(keys ? { key: keysText(keys) } : {}),
		command,
		...(when ? { when: printWhen(when) } : {}),
		...(args !== undefined ? { args } : {})
	};
}

function withArray(text: string): string {
	return parse(text) === undefined ? `${text.trimEnd()}${text.trim() ? '\n' : ''}[\n]\n` : text;
}

function append(text: string, entry: KeybindingEntry): string {
	const base = withArray(text);
	const count = readEntries(base).length;
	return applyEdits(base, modify(base, [count], entry, { ...FORMAT, isArrayInsertion: true }));
}

function removeAt(text: string, indexes: number[]): string {
	let out = text;
	for (const index of [...indexes].sort((a, b) => b - a)) out = applyEdits(out, modify(out, [index], undefined, FORMAT));
	return out;
}

function sameWhen(raw: unknown, when: WhenExpression | null): boolean {
	return (typeof raw === 'string' ? raw.trim() : '') === (when ? printWhen(when) : '');
}

/** a new key for the item: a user entry is rewritten in place, a default gets an entry and a removal */
export function changeKeys(text: string, item: KeybindingItem, keys: KeySequence, when: WhenExpression | null = item.when): string {
	const entries = readEntries(text);
	if (item.source === 'user') {
		const keyed = applyEdits(text, modify(text, [item.index, 'key'], keysText(keys), FORMAT));
		return applyEdits(keyed, modify(keyed, [item.index, 'when'], when ? printWhen(when) : undefined, FORMAT));
	}
	let out = append(text, entryOf(item.command, keys, when, item.args));
	const removal = entryOf(`-${item.command}`, item.keys, item.when);
	const exists = entries.some((e) => {
		const r = e as Record<string, unknown>;
		return r?.command === removal.command && r.key === removal.key && sameWhen(r.when, item.when);
	});
	if (!exists && item.keys) out = append(out, removal);
	return out;
}

/** another key for the command, keeping the ones it has */
export function addKeys(text: string, command: string, keys: KeySequence, when: WhenExpression | null = null): string {
	return append(text, entryOf(command, keys, when));
}

/** a user entry goes; a default gets a removal */
export function removeKeys(text: string, item: KeybindingItem): string {
	if (item.source === 'user') return removeAt(text, [item.index]);
	return append(text, entryOf(`-${item.command}`, item.keys, item.when));
}

/** every user entry for the command and every removal of its defaults */
export function resetCommand(text: string, command: string): string {
	const entries = readEntries(text);
	const at = entries.flatMap((e, i) => {
		const name = (e as Record<string, unknown> | null)?.command;
		return name === command || name === `-${command}` ? [i] : [];
	});
	return removeAt(text, at);
}
