import { describe, it, expect, vi } from 'vitest';

const platform = vi.hoisted(() => ({ isMac: true }));
vi.mock('$lib/platform', () => platform);
vi.mock('mathlive', () => ({ MathfieldElement: class {} }));

import { dropIntlBackslashBinding, quoteSwitchesText } from '$lib/editor/visual/extensions/mathlivebridge/mathFieldFactory';
import type { MathfieldElement } from 'mathlive';

const bindings = [
	{ key: '\\', ifMode: 'math', command: ['switchMode', 'latex', '', '\\'] },
	{ key: '[IntlBackslash]', ifMode: 'math', command: ['switchMode', 'latex', '', '\\'] },
	{ key: '[Tab]', command: 'moveToNextGroup' }
];

function field(isConnected = true) {
	return { keybindings: bindings, isConnected } as unknown as MathfieldElement;
}

describe('dropIntlBackslashBinding', () => {
	it('drops only the IntlBackslash binding on macOS', () => {
		platform.isMac = true;
		const f = field();
		dropIntlBackslashBinding(f);
		expect(f.keybindings.map((b) => b.key)).toEqual(['\\', '[Tab]']);
	});

	it('leaves a field outside the document alone', () => {
		platform.isMac = true;
		const f = field(false);
		dropIntlBackslashBinding(f);
		expect(f.keybindings).toBe(bindings);
	});

	it('keeps it elsewhere, where the key types a backslash on UK keyboards', () => {
		platform.isMac = false;
		const f = field();
		dropIntlBackslashBinding(f);
		expect(f.keybindings).toBe(bindings);
	});
});

describe('quoteSwitchesText', () => {
	function press(mode: string, key = '"', syntax = 'latex') {
		const commands: unknown[] = [];
		const f = { mode, syntax, executeCommand: (c: unknown) => commands.push(c) };
		quoteSwitchesText({ key, currentTarget: f, preventDefault() {}, stopPropagation() {} } as unknown as KeyboardEvent);
		return commands;
	}

	it('toggles text mode in a LaTeX field on any layout', () => {
		expect(press('math')).toEqual([['switchMode', 'text']]);
		expect(press('text')).toEqual([['switchMode', 'math']]);
		expect(press('math', "'")).toEqual([]);
		expect(press('math', '"', 'typst')).toEqual([]);
	});
});
