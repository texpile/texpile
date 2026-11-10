import { expect, test, type Page } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const ARTICLE =
	'\\documentclass{article}\n\\usepackage{amsthm}\n\\newtheorem{theorem}{Theorem}\n\\newtheorem{lemma}{Lemma}\n\\begin{document}\n\n' +
	'First paragraph alpha beta gamma.\n\n\\begin{theorem}\nA claim.\n\\end{theorem}\n\n\\end{document}\n';

const texpile = useTexpile({
	files: {
		'menu-table.tex': ARTICLE,
		'vspace.tex': ARTICLE
	}
});

async function setup(rel: string, after?: string) {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	await v.open(rel);
	if (after) await v.caretAfter(after);
	return { v, page, disk: new Disk(root) };
}

const inCell = (v: VisualEditor) =>
	v.evalView<boolean>(
		`const { $head } = view.state.selection; for (let d = $head.depth; d > 0; d--) if ($head.node(d).type.name === 'table_cell') return true; return false;`
	);

test.skip(process.platform === 'darwin', 'macOS menus are native');
test('Insert > Table leaves the caret in the first cell', async () => {
	const { v, page, disk } = await setup('menu-table.tex', 'First paragraph alpha beta gamma.');
	await page
		.getByRole('menuitem', { name: 'Insert' })
		.or(page.getByRole('button', { name: 'Insert', exact: true }))
		.first()
		.click();
	await page.getByRole('menuitem', { name: 'Table', exact: true }).click();
	await expect.poll(() => inCell(v)).toBe(true);
	await v.type('cellword');
	await disk.expectFile('menu-table.tex', (t) => /\\begin\{tabular\}[^]*cellword[^]*\\end\{tabular\}/.test(t), 'the word is in the table');
});

async function insertFrom(page: Page, path: string[]) {
	await page
		.getByRole('menuitem', { name: 'Insert' })
		.or(page.getByRole('button', { name: 'Insert', exact: true }))
		.first()
		.click();
	for (const name of path.slice(0, -1)) {
		await page
			.getByRole('menuitem', { name: new RegExp(`^${name}`) })
			.first()
			.hover();
		await page.keyboard.press('ArrowRight');
	}
	const item = page.getByRole('menuitem', { name: new RegExp(`^${path[path.length - 1]}`) }).last();
	await expect(item).toBeVisible();
	await item.click();
}

test('Ctrl+Z typed in a chip panel steps the file history', async () => {
	const { page, disk } = await setup('vspace.tex', 'First paragraph alpha');
	await insertFrom(page, ['Breaks and Spaces', 'Vertical Space']);
	await expect(page.locator('.drawn-chip-panel')).toHaveCount(1);
	await disk.expectFile('vspace.tex', (t) => t.includes('\\medskip'), 'the space is saved');
	await page.locator('.drawn-chip-panel').click();
	await page.keyboard.press('ControlOrMeta+z');
	await disk.expectFile('vspace.tex', (t) => t === ARTICLE, 'undo restores the file');
});
