import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { Preferences } from './driver/preferences';
import { useTexpile } from './driver/useTexpile';

const texpile = useTexpile();

const KEYS = `(await import('/src/lib/keybindings/keybindings.svelte.ts'))`;

function keybindingsFile(): string {
	return path.join(texpile().userData, 'keybindings.json');
}

async function keyLabel(command: string): Promise<string> {
	return texpile().page.evaluate(async ({ KEYS, command }) => (await new Function(`return (async () => ${KEYS})()`)()).keyLabel(command), {
		KEYS,
		command
	});
}

test.afterEach(() => fs.rmSync(keybindingsFile(), { force: true }));

test('a key in keybindings.json runs its command in the editor, and the key it replaced is free', async () => {
	const { source } = texpile();
	await source.open('main.tex');
	fs.writeFileSync(
		keybindingsFile(),
		JSON.stringify([
			{ key: 'mod+j', command: 'editor.bold' },
			{ key: 'mod+b', command: '-editor.bold' }
		])
	);
	await expect.poll(() => keyLabel('editor.bold')).toBe(process.platform === 'darwin' ? '⌘J' : 'Ctrl+J');
	const before = await source.text();
	await source.caretAfter('Speed');
	await source.press('ControlOrMeta+b');
	expect(await source.text()).toBe(before);
	await source.press('ControlOrMeta+j');
	expect(await source.text()).toContain('Speed\\textbf{}');
	await source.restore(before);
});

test('Preferences › Keyboard Shortcuts records a key into keybindings.json', async () => {
	const { page } = texpile();
	const prefs = new Preferences(page);
	await prefs.open();
	await prefs.goTo('Keyboard Shortcuts');
	await prefs.dialog.getByLabel('Search commands and keys').fill('editor.italic');
	await prefs.dialog.getByRole('button', { name: 'Change Key…' }).first().click();
	const recorder = page.getByRole('textbox', { name: 'Press the keys, then Enter.' });
	await expect(recorder).toBeFocused();
	await page.keyboard.press('ControlOrMeta+Shift+Y');
	await page.keyboard.press('Enter');
	await expect.poll(() => (fs.existsSync(keybindingsFile()) ? fs.readFileSync(keybindingsFile(), 'utf8') : '')).toContain('"mod+shift+y"');
	const entries = JSON.parse(fs.readFileSync(keybindingsFile(), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
	expect(entries).toEqual([
		{ key: 'mod+shift+y', command: 'editor.italic' },
		{ key: 'mod+i', command: '-editor.italic' }
	]);
	await expect.poll(() => keyLabel('editor.italic')).toBe(process.platform === 'darwin' ? '⇧⌘Y' : 'Ctrl+Shift+Y');
	await prefs.close();
});
