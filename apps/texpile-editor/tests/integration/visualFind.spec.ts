import { expect, test } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const texpile = useTexpile({
	files: {
		'find.tex':
			'\\documentclass{article}\n\\newcommand{\\term}[1]{\\textbf{#1}}\n\\begin{document}\n\n' +
			'The sum $\\sum_{i=1}^{n} i$ is the first thing the reader sees, and the \\term{key word} is the second.\n\n\\end{document}\n'
	}
});

function visual(): VisualEditor {
	const { page, root } = texpile();
	return new VisualEditor(page, root);
}

async function openFind(v: VisualEditor, query: string): Promise<void> {
	await v.page.locator('.ProseMirror p').first().click();
	await v.page.keyboard.press('Control+f');
	await expect(v.page.getByRole('textbox', { name: 'Find' })).toBeFocused();
	await v.page.keyboard.type(query);
}

const highlighted = (v: VisualEditor) => v.page.evaluate(() => CSS.highlights.get('find-match')?.size ?? 0);

// a span per match made ProseMirror rebuild the formula beside it, and the justified lines moved
test('highlighting matches leaves the formulas and the lines as they were', async () => {
	const v = visual();
	await v.open('find.tex');
	const formula = v.page.locator('.ProseMirror p math-field').first();
	await expect(formula).toBeAttached();
	await formula.evaluate((el) => el.setAttribute('data-kept', ''));
	await openFind(v, 'the');
	await expect.poll(() => highlighted(v)).toBeGreaterThan(0);
	await expect(v.page.locator('.ProseMirror [data-kept]')).toHaveCount(1);
});

test('a chip is found by the words it shows and Replace leaves it alone', async () => {
	const v = visual();
	await v.open('find.tex');
	await openFind(v, 'key word');
	await expect(v.page.locator('.find-status')).toHaveText('0 of 1');
	// the command behind the chip is not on the page
	await v.page.keyboard.press('Control+a');
	await v.page.keyboard.type('textbf');
	await expect(v.page.locator('.find-status')).toHaveText('No results');
	await v.page.keyboard.press('Control+a');
	await v.page.keyboard.type('key word');
	await v.page.locator('.find-widget .find-expand').click();
	await expect(v.page.locator('.find-status')).toHaveText('0 of 1, 1 not replaceable');
});
