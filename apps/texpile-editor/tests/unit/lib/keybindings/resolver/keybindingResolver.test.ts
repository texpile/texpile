import { describe, expect, it } from 'vitest';
import { parseKeys } from '$lib/keybindings/keys/keyChord';
import { buildKeybindingTable, keysOf, resolveKeys } from '$lib/keybindings/resolver/keybindingResolver';
import { defaultItems, userItems } from '$lib/keybindings/resolver/keybindingRules';

const defaults = defaultItems(
	[
		{ command: 'file.save', key: 'mod+s' },
		{ command: 'editor.indent', key: 'tab' },
		{ command: 'snippet.next', key: 'tab', when: 'inSnippetMode' },
		{ command: 'suggest.accept', key: 'tab', when: 'suggestWidgetVisible' },
		{ command: 'view.sidebar', key: 'mod+k mod+b' }
	],
	'linux'
);
const all = () => true;
const press = (text: string) => parseKeys(text, false)!;

describe('keybinding resolution', () => {
	it('lets the last entry whose when holds win', () => {
		const table = buildKeybindingTable(defaults, []);
		const run = (context: Record<string, boolean>) => {
			const result = resolveKeys(table, press('tab'), (k) => context[k], all);
			return result.kind === 'found' ? result.item.command : null;
		};
		expect(run({})).toBe('editor.indent');
		expect(run({ inSnippetMode: true })).toBe('snippet.next');
		expect(run({ inSnippetMode: true, suggestWidgetVisible: true })).toBe('suggest.accept');
	});

	it('passes a key over a command that cannot run to the entry before it', () => {
		const table = buildKeybindingTable(defaults, []);
		const result = resolveKeys(
			table,
			press('tab'),
			() => true,
			(c) => c !== 'suggest.accept'
		);
		expect(result.kind === 'found' && result.item.command).toBe('snippet.next');
	});

	it('waits for the second key of a chord', () => {
		const table = buildKeybindingTable(defaults, []);
		expect(resolveKeys(table, press('mod+k'), () => undefined, all).kind).toBe('more');
		const done = resolveKeys(table, press('mod+k mod+b'), () => undefined, all);
		expect(done.kind === 'found' && done.item.command).toBe('view.sidebar');
		expect(resolveKeys(table, press('mod+k mod+x'), () => undefined, all).kind).toBe('none');
	});

	it('moves a default key with a user entry and a removal', () => {
		const { items } = userItems(
			[
				{ key: 'mod+shift+s', command: 'file.save' },
				{ key: 'mod+s', command: '-file.save' }
			],
			false
		);
		const table = buildKeybindingTable(defaults, items);
		expect(resolveKeys(table, press('mod+s'), () => undefined, all).kind).toBe('none');
		expect(keysOf(table, 'file.save')).toEqual(press('mod+shift+s'));
	});

	it('removes defaults only, narrowed by key prefix and when', () => {
		const { items } = userItems(
			[
				{ key: 'tab', command: 'snippet.next', when: 'inSnippetMode' },
				{ key: 'tab', command: '-snippet.next', when: 'inSnippetMode' },
				{ key: 'mod+k', command: '-view.sidebar' },
				{ command: '-suggest.accept', when: 'otherContext' }
			],
			false
		);
		const table = buildKeybindingTable(defaults, items);
		const commands = table.items.map((i) => `${i.source}:${i.command}`);
		expect(commands).toContain('user:snippet.next');
		expect(commands).not.toContain('default:snippet.next');
		expect(commands).not.toContain('default:view.sidebar');
		expect(commands).toContain('default:suggest.accept');
	});

	it('reports a bad entry and still applies the rest', () => {
		const { items, problems } = userItems(
			[{ key: 'ctrl+nope', command: 'a' }, { key: 'mod+j', command: 'b', when: 'x &&' }, 'text', { key: 'mod+l', command: 'c' }],
			false
		);
		expect(items.map((i) => i.command)).toEqual(['c']);
		expect(problems.map((p) => p.kind)).toEqual(['badKey', 'badWhen', 'notObject']);
	});
});
