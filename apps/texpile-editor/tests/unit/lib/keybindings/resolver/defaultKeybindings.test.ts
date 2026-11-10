// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_KEYBINDINGS } from '$lib/keybindings/resolver/defaultKeybindings';
import { defaultItems } from '$lib/keybindings/resolver/keybindingRules';
import { buildKeybindingTable } from '$lib/keybindings/resolver/keybindingResolver';
import { createKeyDispatcher } from '$lib/keybindings/dispatch/keyDispatcher';
import { commandEnabled, registerCommands, runCommand, type CommandImpl } from '$lib/keybindings/commands/commandRegistry';

const table = buildKeybindingTable(defaultItems(DEFAULT_KEYBINDINGS, 'linux'), []);
const dispatch = createKeyDispatcher({
	table: () => table,
	canRun: commandEnabled,
	run: (item) => runCommand(item.command, item.args),
	onChord: () => {},
	mac: false
});

type Mods = Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>>;

/** the key through both phases, with an editor between them that may take it */
function press(key: string, code: string, mods: Mods, target: EventTarget = document.body, editorTakes = false) {
	const e = {
		key,
		code,
		ctrlKey: false,
		shiftKey: false,
		altKey: false,
		metaKey: false,
		isComposing: false,
		target,
		defaultPrevented: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
		stopImmediatePropagation() {},
		...mods
	};
	dispatch.capture(e as unknown as KeyboardEvent);
	if (editorTakes) e.preventDefault();
	dispatch.late(e as unknown as KeyboardEvent);
	return e;
}

let unregister: (() => void) | null = null;
function commands(impls: CommandImpl[]) {
	unregister = registerCommands(impls);
}
afterEach(() => unregister?.());

describe('the default keys', () => {
	it('open Preferences on Ctrl+, and leave Ctrl+Shift+, to the editors', () => {
		const run = vi.fn();
		commands([{ id: 'file.preferences', run }]);
		expect(press(',', 'Comma', { ctrlKey: true }).defaultPrevented).toBe(true);
		press('<', 'Comma', { ctrlKey: true, shiftKey: true });
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('step the document history from the body, and leave a text field its own undo', () => {
		const step = vi.fn();
		commands([
			{ id: 'edit.undo', run: () => step('undo') },
			{ id: 'edit.redo', run: () => step('redo') }
		]);
		press('z', 'KeyZ', { ctrlKey: true });
		press('y', 'KeyY', { ctrlKey: true });
		press('Z', 'KeyZ', { ctrlKey: true, shiftKey: true });
		press('z', 'KeyZ', { ctrlKey: true }, document.body.appendChild(document.createElement('textarea')));
		expect(step.mock.calls).toEqual([['undo'], ['redo'], ['redo']]);
	});

	it('open a folder on Ctrl+O, except in the terminal and for an editor that took the key', () => {
		const run = vi.fn();
		commands([{ id: 'file.openFolder', run }]);
		press('o', 'KeyO', { ctrlKey: true });
		const term = document.body.appendChild(document.createElement('div'));
		term.className = 'xterm';
		press('o', 'KeyO', { ctrlKey: true }, term.appendChild(document.createElement('textarea')));
		press('o', 'KeyO', { ctrlKey: true }, document.body, true);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('open the Zotero picker on Alt+Z, and leave the key to a field and to a window that cannot cite', () => {
		let canCite = true;
		const run = vi.fn();
		commands([{ id: 'editor.zoteroCitation', enabled: () => canCite, run }]);
		const editor = document.body.appendChild(document.createElement('div'));
		editor.contentEditable = 'true';
		press('z', 'KeyZ', { altKey: true }, editor);
		press('z', 'KeyZ', { altKey: true }, document.body.appendChild(document.createElement('input')));
		canCite = false;
		expect(press('z', 'KeyZ', { altKey: true }, editor).defaultPrevented).toBe(false);
		expect(run).toHaveBeenCalledTimes(1);
	});

	// Ctrl on every platform, as in VS Code: Cmd+Shift+G stays find previous on a Mac
	it('open Source Control on Ctrl+Shift+G before an editor takes it as find previous', () => {
		const run = vi.fn();
		commands([{ id: 'view.sourceControl', run }]);
		const editor = document.body.appendChild(document.createElement('div'));
		editor.contentEditable = 'true';
		expect(press('G', 'KeyG', { ctrlKey: true, shiftKey: true }, editor, true).defaultPrevented).toBe(true);
		press('g', 'KeyG', { ctrlKey: true });
		press('G', 'KeyG', { ctrlKey: true, altKey: true, shiftKey: true });
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('compile on Ctrl+Alt+Enter in the visual editor, which cancels every Enter', () => {
		const run = vi.fn();
		commands([{ id: 'compile.run', run }]);
		const editor = document.body.appendChild(document.createElement('div'));
		editor.contentEditable = 'true';
		press('Enter', 'Enter', { ctrlKey: true, altKey: true }, editor, true);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('leave every Option and letter press to typing on macOS', () => {
		const optionLetters = defaultItems(DEFAULT_KEYBINDINGS, 'mac').filter(({ keys }) =>
			keys?.some((c) => c.alt && !c.ctrl && !c.meta && /^[a-z0-9]$/.test(c.key))
		);
		expect(optionLetters.map((i) => i.command)).toEqual([]);
	});

	it('focus an editor by the digit key on AZERTY, where it types &', () => {
		const run = vi.fn();
		commands([{ id: 'view.focusEditor1', run }]);
		press('&', 'Digit1', { ctrlKey: true });
		expect(run).toHaveBeenCalledTimes(1);
	});
});
