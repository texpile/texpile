import { parseKeys } from '../keys/keyChord';
import { parseWhen, WhenSyntaxError, type WhenExpression } from '../when/whenExpression';
import type { KeybindingItem } from './keybindingResolver';

export type KeyPlatform = 'mac' | 'win' | 'linux';

export type DefaultKeybinding = {
	command: string;
	key: string;
	/** null leaves the key off that platform */
	mac?: string | null;
	win?: string | null;
	linux?: string | null;
	when?: string;
	args?: unknown;
	/** an app key an editor also uses: it runs only when no editor took the key */
	late?: true;
	/** run by the editor with the focus, from its own keymap */
	editor?: true;
};

export type KeybindingProblem =
	| { index: number; kind: 'notObject' }
	| { index: number; kind: 'noCommand' }
	| { index: number; kind: 'badKey'; key: string }
	| { index: number; kind: 'badWhen'; when: string; message: string };

export function defaultItems(list: DefaultKeybinding[], platform: KeyPlatform): KeybindingItem[] {
	const items: KeybindingItem[] = [];
	for (const [index, rule] of list.entries()) {
		const text = rule[platform] === undefined ? rule.key : rule[platform];
		if (text === null) continue;
		const keys = parseKeys(text, platform === 'mac');
		if (!keys) throw new Error(`default keybinding for ${rule.command} has a bad key: ${text}`);
		const when = rule.when ? parseWhen(rule.when) : null;
		if ((rule.late || rule.editor) && keys.length > 1) throw new Error(`default keybinding for ${rule.command} is a chord`);
		items.push({ command: rule.command, keys, when, args: rule.args, source: 'default', index, late: rule.late, editor: rule.editor });
	}
	return items;
}

function readWhen(raw: unknown, index: number, problems: KeybindingProblem[]): WhenExpression | null | false {
	if (raw === undefined || raw === '') return null;
	try {
		return parseWhen(String(raw));
	} catch (e) {
		if (!(e instanceof WhenSyntaxError)) throw e;
		problems.push({ index, kind: 'badWhen', when: String(raw), message: e.message });
		return false;
	}
}

/** an entry with a problem is left out, and the rest still apply */
export function userItems(entries: unknown[], mac: boolean): { items: KeybindingItem[]; problems: KeybindingProblem[] } {
	const items: KeybindingItem[] = [];
	const problems: KeybindingProblem[] = [];
	for (const [index, entry] of entries.entries()) {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
			problems.push({ index, kind: 'notObject' });
			continue;
		}
		const { key, command, when, args } = entry as Record<string, unknown>;
		if (typeof command !== 'string' || !command.replace(/^-/, '')) {
			problems.push({ index, kind: 'noCommand' });
			continue;
		}
		const removal = command.startsWith('-');
		const keys = typeof key === 'string' && key.trim() ? parseKeys(key, mac) : null;
		if ((key !== undefined && key !== '' && !keys) || (!keys && !removal)) {
			problems.push({ index, kind: 'badKey', key: typeof key === 'string' ? key : '' });
			continue;
		}
		const read = readWhen(when, index, problems);
		if (read !== false) items.push({ command, keys, when: read, args, source: 'user', index });
	}
	return { items, problems };
}
