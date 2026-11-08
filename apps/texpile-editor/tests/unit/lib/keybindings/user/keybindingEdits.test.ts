import { describe, expect, it } from 'vitest';
import { parseKeys } from '$lib/keybindings/keys/keyChord';
import { defaultItems, userItems } from '$lib/keybindings/resolver/keybindingRules';
import {
	addKeys,
	changeKeys,
	readEntries,
	removeKeys,
	resetCommand,
	UnreadableKeybindingsError
} from '$lib/keybindings/user/keybindingEdits';

const save = defaultItems([{ command: 'file.save', key: 'mod+s' }], 'linux')[0];
const keys = (text: string) => parseKeys(text, false)!;

describe('keybindings.json edits', () => {
	it('moves a default key with an entry and a removal, and resets both away', () => {
		const start = '// mine\n[\n\t{ "key": "mod+j", "command": "x" } // keep\n]\n';
		const changed = changeKeys(start, save, keys('mod+shift+s'));
		expect(readEntries(changed)).toEqual([
			{ key: 'mod+j', command: 'x' },
			{ key: 'mod+shift+s', command: 'file.save' },
			{ key: 'mod+s', command: '-file.save' }
		]);
		expect(changed).toContain('// mine');
		expect(changed).toContain('// keep');
		expect(readEntries(resetCommand(changed, 'file.save'))).toEqual([{ key: 'mod+j', command: 'x' }]);
	});

	it('rewrites a user entry in place and removes it outright', () => {
		const text = '[{ "key": "mod+j", "command": "x", "when": "a" }]';
		const [item] = userItems(readEntries(text), false).items;
		expect(readEntries(changeKeys(text, item, keys('mod+k'), null))).toEqual([{ key: 'mod+k', command: 'x' }]);
		expect(readEntries(removeKeys(text, item))).toEqual([]);
	});

	it('starts an empty or comment-only file, and refuses one that is no array', () => {
		expect(readEntries(addKeys('', 'x', keys('f5')))).toEqual([{ key: 'f5', command: 'x' }]);
		expect(readEntries(addKeys('// nothing yet\n', 'x', keys('f5')))).toEqual([{ key: 'f5', command: 'x' }]);
		expect(() => addKeys('{ "key": 1 }', 'x', keys('f5'))).toThrow(UnreadableKeybindingsError);
		expect(() => readEntries('[ { "key": ')).toThrow(UnreadableKeybindingsError);
	});
});
