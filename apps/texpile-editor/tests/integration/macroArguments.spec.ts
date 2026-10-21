import { expect, test } from '@playwright/test';
import type { MathfieldElement } from 'mathlive';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const doc = (body: string) =>
	`\\documentclass{article}\n\\newcommand{\\den}[1]{|#1\\rangle\\langle#1|}\n\\begin{document}\n\n${body}\n\n\\end{document}\n`;

const texpile = useTexpile({
	files: {
		'den.tex': doc('Intro.\n\n\\[\n\\rho = \\den{\\psi} + \\den\\phi\n\\]\n\nOutro.'),
		'typed.tex': doc('Intro.\n\n\\[\n\\rho = 1\n\\]\n\nOutro.'),
		'undo.tex': doc('Intro.\n\n\\[\n\\rho = \\den{\\psi} + \\den\\phi\n\\]\n\nOutro.')
	}
});

function visual(): VisualEditor {
	const { page, root } = texpile();
	return new VisualEditor(page, root);
}

function formula(v: VisualEditor): Promise<string> {
	return v.evalView<string>(
		`let found = ''; view.state.doc.descendants((n) => { if (n.type.name === 'block_math') found = n.textContent; }); return found;`
	);
}

test('a macro in a formula opens as its LaTeX, and an edit rewrites that call only', async () => {
	const v = visual();
	await v.open('den.tex');
	const before = await formula(v);
	const field = v.page.locator('.block-math-container math-field').first();
	await field.scrollIntoViewIfNeeded();
	await field.locator('[part~="macro"]').nth(1).click();
	const panel = v.page.locator('.drawn-chip-panel');
	const source = panel.locator('.cm-content');
	await expect(source).toHaveText('\\den\\phi');
	await expect(source).toBeFocused();
	await expect(panel).toContainText('|#1\\rangle\\langle#1|');
	await v.page.keyboard.press('Control+a');
	await v.page.keyboard.insertText('\\den{x}');
	await expect.poll(() => formula(v)).toBe(before.replace('\\den\\phi', '\\den{x}'));
	// back in the formula on the call it edited, as Escape leaves a text chip
	await v.page.keyboard.press('Escape');
	await expect(panel).toHaveCount(0);
	await expect(field.locator('[part~="macro-selected"]')).toHaveCount(1);
	// on a selected call, Tab and Ctrl+Space open it rather than math search
	for (const key of ['Tab', 'Control+Space']) {
		// mathlive takes the keyboard a moment after the formula gets the focus back, and a key before that goes nowhere
		await expect(async () => {
			await v.page.keyboard.press(key);
			await expect(source).toBeFocused({ timeout: 1000 });
		}).toPass({ timeout: 10_000 });
		await expect(v.page.locator('.math-search')).toHaveCount(0);
		await v.page.keyboard.press('Escape');
		await expect(panel).toHaveCount(0);
	}
});

test('an undo in the panel puts the call back, and the next edit replaces exactly that call', async () => {
	const v = visual();
	await v.open('undo.tex');
	const before = await formula(v);
	const field = v.page.locator('.block-math-container math-field').first();
	await field.scrollIntoViewIfNeeded();
	await field.locator('[part~="macro"]').nth(1).click();
	const source = v.page.locator('.drawn-chip-panel .cm-content');
	await expect(source).toBeFocused();
	await v.page.keyboard.press('Control+a');
	await v.page.keyboard.insertText('\\den{x}');
	await expect.poll(() => formula(v)).toBe(before.replace('\\den\\phi', '\\den{x}'));
	await v.page.keyboard.press('Control+z');
	await expect.poll(() => formula(v)).toBe(before);
	await expect(source).toHaveText('\\den\\phi');
	await v.page.keyboard.press('Control+a');
	await v.page.keyboard.insertText('\\den{y}');
	await expect.poll(() => formula(v)).toBe(before.replace('\\den\\phi', '\\den{y}'));
});

// the panel's props are gone once it closes, and the jump used to read them after
test("Go to Definition opens the macro's line in the source editor", async () => {
	const v = visual();
	await v.open('den.tex');
	const field = v.page.locator('.block-math-container math-field').first();
	await field.scrollIntoViewIfNeeded();
	await field.locator('[part~="macro"]').first().click();
	await v.page.locator('.drawn-chip-panel').getByRole('button', { name: 'Go to Definition' }).click();
	await expect(v.page.locator('.cm-activeLine').first()).toContainText('\\newcommand{\\den}');
});

test('a macro typed in a formula takes an empty argument and opens with the caret in it', async () => {
	const v = visual();
	await v.open('typed.tex');
	const field = v.page.locator('.block-math-container math-field').first();
	await field.scrollIntoViewIfNeeded();
	await field.click();
	await expect(field).toBeFocused();
	await field.evaluate((el: MathfieldElement) => el.executeCommand('moveToMathfieldEnd'));
	await v.page.keyboard.type('+\\den', { delay: 30 });
	await v.page.keyboard.press('Space');
	const source = v.page.locator('.drawn-chip-panel .cm-content');
	await expect(source).toHaveText('\\den{}');
	await expect(source).toBeFocused();
	await v.page.keyboard.insertText('a');
	await expect.poll(() => formula(v)).toMatch(/\+\\den\{a\}$/);
});
