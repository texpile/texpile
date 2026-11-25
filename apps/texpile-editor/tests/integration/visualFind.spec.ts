import { expect, test } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';
import { inCanvas, settled } from './canvas/canvasPage';

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
	await v.caretAfter('The sum');
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

/** the find tints the canvas drew over the paragraph: [yellow match fills, orange current fills] */
function findFills(v: VisualEditor): Promise<[number, number]> {
	return inCanvas(v.page, ({ probe }) => {
		const ops = probe.drawList(0).filter((op) => op.op === 'fillRect');
		const match = ops.filter((op) => /^rgba\(255, 255, 0, 0\.4/.test(op.color ?? '')).length;
		const current = ops.filter((op) => /^rgba\(255, 128, 0, 0\.6/.test(op.color ?? '')).length;
		return [match, current] as [number, number];
	});
}

test('the matches are tinted on the canvas, the current one in its own color, and the tint goes when find closes', async () => {
	const v = visual();
	await v.open('find.tex');
	await openFind(v, 'the');
	const status = v.page.locator('.find-status');
	await expect(status).toHaveText(/^0 of \d+$/);
	const count = Number((await status.textContent())!.split(' of ')[1]);
	expect(count).toBeGreaterThan(2);
	await settled(v.page);
	expect(await findFills(v), 'a tint for each word found').toEqual([count, 0]);
	await v.page.keyboard.press('Enter');
	await settled(v.page);
	expect(await findFills(v)).toEqual([count - 1, 1]);
	await v.page.keyboard.press('Escape');
	await settled(v.page);
	expect(await findFills(v)).toEqual([0, 0]);
});
