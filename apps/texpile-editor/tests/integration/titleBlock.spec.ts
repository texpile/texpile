import { expect, test } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const AUTHOR = '%\n  Ada Lovelace \\\\\n  University of London\n  \\And\n  Alan Turing \\\\\n  University of Manchester\n';
const FILE = `\\documentclass{article}\n\\newcommand{\\And}{\\and}\n\\title{On Engines}\n\\author{${AUTHOR}}\n\\begin{document}\n\\maketitle\nWords.\n\\end{document}\n`;

const BARE = '\\documentclass{article}\n\\begin{document}\n\nA Paper\n\nFirst words.\n\\end{document}\n';

const texpile = useTexpile({ files: { 'authors.tex': FILE, 'bare.tex': BARE } });

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
	// Enter keeps the indent of the line above
	await page.keyboard.type('  \\And\nGrace Hopper\n');
	await expect(block).toContainText('Grace Hopper');
	await expect
		.poll(() => new Disk(root).read('authors.tex'), { timeout: 10_000 })
		.toMatch(/ {2}\\And\n {2}Grace Hopper\n\s*\}\n\\begin\{document\}/);
	await page.keyboard.press('Escape');
	await expect(page.locator('.drawn-chip-panel')).toHaveCount(0);
});

// the chip a title style made was left selected, so the name typed next replaced it with plain text
test('Author on an empty line opens its panel for the name, and Title on a line of words leaves the caret below', async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	await v.open('bare.tex');
	const style = page.getByRole('button', { name: /^Standard/ }).first();
	await v.caretAtEndOf('A Paper');
	await style.click();
	await page.getByRole('menuitemradio', { name: 'Title', exact: true }).click();
	await expect(page.locator('.ProseMirror')).toBeFocused();
	await v.type('Z');
	await v.caretAfter('ZFirst words.');
	await v.press('Enter');
	await style.click();
	await page.getByRole('menuitemradio', { name: 'Author', exact: true }).click();
	await expect(page.locator('.drawn-chip-panel .cm-content')).toBeFocused();
	await page.keyboard.type('Ada Lovelace');
	await page.keyboard.press('Escape');
	await expect
		.poll(() => new Disk(root).read('bare.tex'), { timeout: 10_000 })
		.toMatch(/\\title\{A Paper\}\n\nZFirst words\.[^]*\\author\{Ada Lovelace\}/);
});
