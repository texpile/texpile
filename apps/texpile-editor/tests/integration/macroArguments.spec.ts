import { expect, test } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const doc = (body: string) =>
	`\\documentclass{article}\n\\newcommand{\\den}[1]{|#1\\rangle\\langle#1|}\n\\begin{document}\n\n${body}\n\n\\end{document}\n`;

const texpile = useTexpile({
	files: {
		'den.tex': doc('Intro.\n\n\\[\n\\rho = \\den{\\psi} + \\den\\phi\n\\]\n\nOutro.'),
		'units.tex': doc('Intro.\n\n\\begin{gather*}\nF_x = 11.12\\ \\text{kN} \\\\\nF_y = 4.448\\ \\text{kN}\n\\end{gather*}\n\nOutro.')
	}
});

function visual(): VisualEditor {
	const { page, root } = texpile();
	return new VisualEditor(page, root);
}

/** the display formula as a live field, built as a pointer reaching it builds it */
async function liveField(v: VisualEditor) {
	const block = v.page.locator('.block-math-container').first();
	await block.scrollIntoViewIfNeeded();
	await block.hover();
	return block.locator('math-field');
}

function formula(v: VisualEditor): Promise<string> {
	return v.evalView<string>(
		`let found = ''; view.state.doc.descendants((n) => { if (n.type.name === 'block_math') found = n.textContent; }); return found;`
	);
}

/** what the live field of the editor's first display formula holds */
function unitsFormula(v: VisualEditor): Promise<string> {
	return v.evalView<string>(`return view.dom.querySelector('.block-math-container math-field')?.value ?? '';`);
}

// the paper's macros set the formula again, and mathlive read it in the mode at its caret: text, after a unit
test("a formula that ends in text is still drawn once the paper's macros reach it", async () => {
	const v = visual();
	await v.open('units.tex');
	const at = await v.evalView<{ x: number; y: number }>(
		`const r = view.dom.querySelector('.block-math-container').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`
	);
	await v.page.mouse.move(at.x, at.y, { steps: 4 });
	await expect.poll(() => unitsFormula(v)).toContain('F_{x}');
	await v.page.waitForTimeout(1500);
	expect(await unitsFormula(v)).not.toContain('textbackslash');
});

test('a macro in a formula opens as its LaTeX, and an edit rewrites that call only', async () => {
	const v = visual();
	await v.open('den.tex');
	const before = await formula(v);
	const field = await liveField(v);
	await field.locator('[part~="macro"]').nth(1).click();
	const panel = v.page.locator('.drawn-chip-panel');
	const source = panel.locator('.cm-content');
	await expect(source).toHaveText('\\den\\phi');
	await expect(source).toBeFocused();
	await expect(panel).toContainText('|#1\\rangle\\langle#1|');
	await v.page.keyboard.press('ControlOrMeta+a');
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

// a formula with the keyboard trusted its own text, so the view ProseMirror kept went on showing the file before
test('another file opened from a formula shows its own formula', async () => {
	const v = visual();
	await v.open('den.tex');
	const field = await liveField(v);
	// on the \\rho, clear of the macros that open a panel
	await field.click({ position: { x: 6, y: 12 } });
	await expect.poll(() => v.page.evaluate(() => document.activeElement?.tagName)).toBe('MATH-FIELD');
	await v.open('units.tex');
	await expect.poll(() => unitsFormula(v)).toContain('F_{x}');
});
