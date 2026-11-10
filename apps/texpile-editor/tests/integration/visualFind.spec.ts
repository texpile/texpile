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
	await v.page.keyboard.press('ControlOrMeta+f');
	await expect(v.page.getByRole('textbox', { name: 'Find' })).toBeFocused();
	await v.page.keyboard.type(query);
}

// a span per match made ProseMirror rebuild the formula beside it, and the justified lines moved
test('stepping onto a formula leaves the keyboard in the find field', async () => {
	const v = visual();
	await v.open('find.tex');
	await openFind(v, 'sum');
	const status = v.page.locator('.find-status');
	await expect(status).toHaveText('0 of 2');
	// two steps visit the words and the formula, in either order
	await v.page.keyboard.press('Enter');
	await expect(status).toHaveText(/^[12] of 2$/);
	const first = await status.textContent();
	await v.page.keyboard.press('Enter');
	await expect(status).not.toHaveText(first ?? '');
	await expect(v.page.getByRole('textbox', { name: 'Find' })).toBeFocused();
	await v.page.keyboard.press('Enter');
	await expect(status).toHaveText(first ?? '');
});
