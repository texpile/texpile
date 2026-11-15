import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const NOTES = 'Alpha beta gamma.\n\nDelta epsilon zeta.\n';

// long enough that its parse runs over a few frames
const HELD = `\\documentclass{article}\n\\begin{document}\n${Array.from({ length: 600 }, (_, i) => `Held paragraph ${i + 1} with a formula $x_{${i}}^2 + y = z$ and words enough to fill a line of the page.`).join('\n\n')}\n\\end{document}\n`;

const texpile = useTexpile({
	files: {
		'notes.tex': NOTES,
		'rn.tex': 'Caret rename test text.\n',
		'vis.tex': '\\documentclass{article}\n\\begin{document}\nVisual caret rename text.\n\\end{document}\n',
		'held.tex': HELD,
		'before.tex': '\\documentclass{article}\n\\begin{document}\nThe file shown before.\n\\end{document}\n'
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

test('renaming the open file keeps the visual editor, its text and its caret', async () => {
	test.skip(process.platform === 'darwin', 'the tree context menu is native on macOS');
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

// the last file's text stays up while the next is parsed, and the bar of a build stood on it
test('a tab whose file is parsed again puts no rendering bar on the file shown before', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	await visual.open('held.tex');
	await page.getByRole('tab', { name: /held\.tex/ }).dblclick();
	await visual.open('before.tex');
	await expect(visual.editor).toContainText('The file shown before.');
	await page.evaluate(
		async (file) => {
			const now = await import(/* @vite-ignore */ '/src/lib/buffers/textNow.ts' as string);
			await now.changeTextNow(file, (text: string) => text.replace('Held paragraph 1 ', 'Held paragraph one '));
			const seen = { onText: 0 };
			Object.assign(window, { barSeen: seen });
			function frame(): void {
				for (const bar of document.querySelectorAll('.indeterminate')) {
					const text = bar.closest('[data-handle-lane]')?.querySelector('.ProseMirror');
					if (text?.textContent && getComputedStyle(text).visibility === 'visible') seen.onText++;
				}
				requestAnimationFrame(frame);
			}
			requestAnimationFrame(frame);
		},
		path.join(root, 'held.tex')
	);
	await page.getByRole('tab', { name: /held\.tex/ }).click();
	await expect(visual.editor).toContainText('Held paragraph one ');
	const onText = await page.evaluate(() => (window as unknown as { barSeen: { onText: number } }).barSeen.onText);
	expect(onText, 'frames with the rendering bar over drawn text').toBe(0);
});
