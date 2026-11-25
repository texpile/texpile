import { describe, it, expect } from 'vitest';
import {
	completeWithPlaceholder,
	quoteSwitchesText,
	type HotfixField
} from '$lib/editor/visual/extensions/mathlivebridge/mathFieldFactory';

function key(init: KeyboardEventInit & { key: string }): KeyboardEvent {
	return { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...init } as KeyboardEvent;
}

describe('quoteSwitchesText', () => {
	function press(mode: string, pressed = '"', syntax = 'latex') {
		const commands: unknown[] = [];
		const field = { mode, syntax, executeCommand: (c: unknown) => commands.push(c) } as unknown as HotfixField;
		quoteSwitchesText(field, key({ key: pressed }));
		return commands;
	}

	it('toggles text mode in a LaTeX field on any layout', () => {
		expect(press('math')).toEqual([['switchMode', 'text']]);
		expect(press('text')).toEqual([['switchMode', 'math']]);
		expect(press('math', "'")).toEqual([]);
		expect(press('math', '"', 'typst')).toEqual([]);
	});
});

describe('completeWithPlaceholder', () => {
	it('completes a command and puts the caret in its first empty argument', () => {
		const commands: unknown[] = [];
		const inserted: string[] = [];
		const field = {
			mode: 'latex',
			syntax: 'latex',
			position: 3,
			selection: { ranges: [[3, 3]] },
			executeCommand: (c: unknown) => commands.push(c),
			getValue: () => '\\frac{}{}',
			insert: (latex: string) => inserted.push(latex)
		} as unknown as HotfixField;
		expect(completeWithPlaceholder(field, key({ key: ' ' }))).toBe(true);
		expect(commands).toEqual([['complete', 'accept-all']]);
		expect(field.selection).toEqual({ ranges: [[0, 3]] });
		expect(inserted).toEqual(['\\frac{#?}{#?}']);
		expect(completeWithPlaceholder({ ...field, mode: 'math' } as HotfixField, key({ key: ' ' }))).toBe(false);
	});
});
