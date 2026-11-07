import { expect, test } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const AUTHOR = '%\n  Ada Lovelace \\\\\n  University of London\n  \\And\n  Alan Turing \\\\\n  University of Manchester\n';
const FILE = `\\documentclass{article}\n\\newcommand{\\And}{\\and}\n\\title{On Engines}\n\\author{${AUTHOR}}\n\\begin{document}\n\\maketitle\nWords.\n\\end{document}\n`;

const texpile = useTexpile({ files: { 'authors.tex': FILE } });

// the title block's commands live in the preamble; a click opens the same panel as any drawn element
test('a drawn author block opens its LaTeX in the chip panel, and an edit there goes into the preamble', async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	await v.open('authors.tex');
	const block = page.locator('.title-field').filter({ hasText: 'Ada' }).first();
	await expect(block).toContainText('University of Manchester');
	await block.click();
	const source = page.locator('.drawn-chip-panel .cm-content');
	await expect(source).toBeFocused();
	await expect(source).toContainText('Ada Lovelace');
	await expect(block).toBeVisible();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('  \\And\n  Grace Hopper\n');
	await expect(block).toContainText('Grace Hopper');
	await expect.poll(() => new Disk(root).read('authors.tex'), { timeout: 10_000 }).toContain('Grace Hopper\n}\n\\begin{document}');
	await page.keyboard.press('Escape');
	await expect(page.locator('.drawn-chip-panel')).toHaveCount(0);
});
