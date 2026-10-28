import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { Disk } from './driver/disk';
import { toasts } from './driver/preferences';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const NOTES = 'Alpha beta gamma.\n\nDelta epsilon zeta.\n';

const texpile = useTexpile({
	files: {
		'notes.tex': NOTES,
		'gone.tex': 'Soon removed.\n',
		'rn.tex': 'Caret rename test text.\n',
		'vis.tex': '\\documentclass{article}\n\\begin{document}\nVisual caret rename text.\n\\end{document}\n'
	}
});

function disk(): Disk {
	return new Disk(texpile().root);
}

async function editorShows(text: string): Promise<void> {
	await expect.poll(() => texpile().source.text(), { message: 'the editor text', timeout: 15_000 }).toBe(text);
}

test.afterEach(async () => {
	const { source } = texpile();
	await source.open('notes.tex');
	await source.restore(NOTES);
	await disk().expectFile('notes.tex', (t) => t === NOTES, 'notes.tex back as it was');
});

test('a disk change to a file with no unsaved edits shows at once', async () => {
	const { source } = texpile();
	await source.open('notes.tex');
	disk().write('notes.tex', 'Alpha beta gamma.\n\nDelta epsilon OMEGA.\n');
	await editorShows('Alpha beta gamma.\n\nDelta epsilon OMEGA.\n');
});

test('a disk change in other words merges with unsaved edits and the merge is saved', async () => {
	const { source } = texpile();
	await source.open('notes.tex');
	await source.caretAfter('Alpha ');
	await source.type('NEW ');
	disk().write('notes.tex', 'Alpha beta gamma.\n\nDelta epsilon OMEGA.\n');
	const merged = 'Alpha NEW beta gamma.\n\nDelta epsilon OMEGA.\n';
	await editorShows(merged);
	await disk().expectFile('notes.tex', (t) => t === merged, 'the merge on disk');
});

test('changes to the same words on both sides ask which to keep', async () => {
	const { source, page } = texpile();
	await source.open('notes.tex');
	await source.caretAfter('Alpha ', { replace: 4 });
	await source.type('MINE');
	disk().write('notes.tex', 'Alpha DISK gamma.\n\nDelta epsilon zeta.\n');
	const dialog = page.getByRole('dialog', { name: 'File Cache Conflict' });
	await expect(dialog).toContainText("Changes have been made to 'notes.tex' in memory and on disk.");
	for (const label of ['Load File System Changes', 'Keep Memory Changes', 'Show Difference'])
		await expect(dialog.getByRole('button', { name: label })).toBeVisible();
	await dialog.getByRole('button', { name: 'Load File System Changes' }).click();
	await editorShows('Alpha DISK gamma.\n\nDelta epsilon zeta.\n');
});

test('Keep Memory Changes writes the editor text over the disk', async () => {
	const { source, page } = texpile();
	await source.open('notes.tex');
	await source.caretAfter('Alpha ', { replace: 4 });
	await source.type('MINE');
	disk().write('notes.tex', 'Alpha DISK gamma.\n\nDelta epsilon zeta.\n');
	await page.getByRole('dialog', { name: 'File Cache Conflict' }).getByRole('button', { name: 'Keep Memory Changes' }).click();
	await disk().expectFile('notes.tex', (t) => t === 'Alpha MINE gamma.\n\nDelta epsilon zeta.\n', 'the editor text on disk');
});

test('Ctrl+S shows no toast and an unsaved tab carries no mark', async () => {
	const { source, page } = texpile();
	await source.open('notes.tex');
	await source.caretAfter('Alpha ');
	await source.type('x');
	await expect(page.locator('[role="tab"] .rounded-full.bg-warning-500')).toHaveCount(0);
	await source.press('Control+s');
	await disk().expectFile('notes.tex', (t) => t.startsWith('Alpha x'), 'the save');
	await expect(toasts(page)).toHaveCount(0);
});

test('a file deleted on disk closes its tab', async () => {
	const { source, page } = texpile();
	await source.open('gone.tex');
	await source.caretAfter('Soon ');
	await source.type('unsaved ');
	disk().remove('gone.tex');
	await expect(page.getByRole('tab', { name: /gone\.tex/ })).toHaveCount(0, { timeout: 15_000 });
});

test('Ctrl+Z over a disk change asks first, and Undo writes the text from before it', async () => {
	const { source, page } = texpile();
	await page.evaluate(() => localStorage.setItem('texpile:dialogs', 'inapp'));
	try {
		await source.open('notes.tex');
		const changed = 'Alpha beta gamma.\n\nDelta epsilon OMEGA.\n';
		disk().write('notes.tex', changed);
		await editorShows(changed);
		const ask = page.getByRole('alertdialog').filter({ hasText: 'Undo Reload from Disk?' });
		await source.press('Control+z');
		await ask.getByRole('button', { name: 'Cancel' }).click();
		await expect(ask).toHaveCount(0);
		await disk().expectFile('notes.tex', (t) => t === changed, 'the disk change kept');
		await source.press('Control+z');
		await ask.getByRole('button', { name: 'Undo', exact: true }).click();
		await editorShows(NOTES);
		await disk().expectFile('notes.tex', (t) => t === NOTES, 'the text from before the disk change, saved');
	} finally {
		await page.evaluate(() => localStorage.removeItem('texpile:dialogs'));
	}
});

async function renameInTree(from: string, to: string): Promise<void> {
	const { page, root } = texpile();
	await page.locator(`[data-path$="${from}"]`).first().click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
	const input = page.locator(`[data-path$="${from}"] input`);
	await expect(input).toBeFocused();
	await input.fill(to);
	await input.press('Enter');
	await expect.poll(() => fs.existsSync(path.join(root, to))).toBe(true);
}

test('renaming the open file keeps the caret in the source editor', async () => {
	const { source } = texpile();
	await source.open('rn.tex');
	await source.caretAfter('Caret rename ');
	await source.type('X');
	const caret = () => source.evalView<number>('return view.state.selection.main.head;');
	const before = await caret();
	await renameInTree('rn.tex', 'rn2.tex');
	await expect.poll(() => caret()).toBe(before);
});

test('renaming the open file keeps the visual editor, its text and its caret', async () => {
	const { source, page, root } = texpile();
	const visual = new VisualEditor(page, root);
	await source.open('vis.tex');
	await visual.modeButtons.visual.click();
	await visual.editor.locator('p', { hasText: 'Visual caret' }).click();
	await page.keyboard.press('End');
	await page.keyboard.type(' END');
	const caret = () => visual.evalView<number>('return view.state.selection.head;');
	const before = await caret();
	await visual.editor.evaluate((el) => el.setAttribute('data-before-rename', ''));
	await renameInTree('vis.tex', 'vis2.tex');
	await expect(page.getByRole('tab', { name: /vis2\.tex/ })).toBeVisible();
	await expect(page.locator('.ProseMirror[data-before-rename]')).toHaveText('Visual caret rename text. END');
	expect(await caret()).toBe(before);
	// focus stays in the tree after a rename, as in VS Code
	await visual.evalView('view.focus();');
	await page.keyboard.type('Z');
	await disk().expectFile('vis2.tex', (t) => t.includes('rename text. ENDZ'), 'the typing after the rename');
	await visual.modeButtons.source.click();
});
