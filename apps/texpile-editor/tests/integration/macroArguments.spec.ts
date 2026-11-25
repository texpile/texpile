import { expect, test } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';
import { inCanvas, settled } from './canvas/canvasPage';

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

function formula(v: VisualEditor): Promise<string> {
	return v.evalView<string>(
		`let found = ''; view.state.doc.descendants((n) => { if (n.type.name === 'block_math') found = n.textContent; }); return found;`
	);
}

/** what the formula session holds, '' with none */
function sessionValue(v: VisualEditor): Promise<string> {
	return v.evalView<string>(`return view.canvas.nested()?.field.getValue() ?? '';`);
}

/** the first display formula's drawn box */
async function displayBox(v: VisualEditor): Promise<{ left: number; top: number; width: number; height: number; pos: number }> {
	await settled(v.page);
	return inCanvas(v.page, ({ probe, view }) => {
		let pos = -1;
		view.state.doc.descendants((node, at) => {
			if (pos < 0 && node.type.name === 'block_math') pos = at;
		});
		const node = probe.rectOfNode(pos)!;
		const box = probe
			.query('.math-formula')
			.map((each) => each.rect)
			.find((rect) => rect.top >= node.top - 1 && rect.bottom <= node.bottom + 1)!;
		return { left: box.left, top: box.top, width: box.width, height: box.height, pos };
	});
}

/** a press on the formula's left end, on the \\rho, clear of the macro calls */
async function enterDisplay(v: VisualEditor): Promise<void> {
	const box = await displayBox(v);
	await v.page.mouse.click(box.left + 3, box.top + box.height / 2);
	await expect.poll(() => v.evalView<number | null>('return view.canvas.nested()?.pos ?? null;')).toBe(box.pos);
}

// the paper's macros set the formula again, and mathlive read it in the mode at its caret: text, after a unit
test("a formula that ends in text is still drawn once the paper's macros reach it", async () => {
	const v = visual();
	await v.open('units.tex');
	const box = await displayBox(v);
	await v.page.mouse.click(box.left + box.width - 2, box.top + box.height - 4);
	await expect.poll(() => sessionValue(v)).toContain('F_{x}');
	await v.evalView(`return (async () => {
		const { mathMacros } = await import('/src/lib/editor/visual/extensions/mathlivebridge/mathMacros.svelte.ts');
		mathMacros.current = { ...mathMacros.current, kN: { def: 'kN', args: 0, expand: false, captureSelection: true, part: 'macro' } };
	})();`);
	await v.page.waitForTimeout(500);
	expect(await sessionValue(v)).toContain('F_{x}');
	expect(await sessionValue(v)).not.toContain('textbackslash');
});

test('a macro in a formula opens as its LaTeX, and an edit rewrites that call only', async () => {
	const v = visual();
	await v.open('den.tex');
	const before = await formula(v);
	await enterDisplay(v);
	const call = await v.evalView<{ x: number; y: number }>(
		`const r = view.canvas.nested().macroCallClientRect(1); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`
	);
	await v.page.mouse.click(call.x, call.y);
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
	await expect.poll(() => v.evalView<number>('return view.canvas.nested()?.outlineRects().length ?? 0;')).toBe(1);
	// on a selected call, Tab and Ctrl+Space open it rather than math search
	for (const key of ['Tab', 'Control+Space']) {
		await v.page.keyboard.press(key);
		await expect(source).toBeFocused();
		await expect(v.page.locator('.math-search')).toHaveCount(0);
		await v.page.keyboard.press('Escape');
		await expect(panel).toHaveCount(0);
	}
});

// a formula with the keyboard trusted its own text, so the view ProseMirror kept went on showing the file before
test('another file opened from a formula shows its own formula', async () => {
	const v = visual();
	await v.open('den.tex');
	await enterDisplay(v);
	await v.open('units.tex');
	expect(await v.evalView<number | null>('return view.canvas.nested()?.pos ?? null;')).toBeNull();
	await expect.poll(() => formula(v)).toContain('F_x');
	const drawn = await inCanvas(v.page, ({ probe, view }) => {
		let pos = -1;
		view.state.doc.descendants((node, at) => {
			if (pos < 0 && node.type.name === 'block_math') pos = at;
		});
		return probe
			.drawList(pos)
			.filter((op) => op.op === 'fillText')
			.map((op) => op.text)
			.join('');
	});
	expect(drawn).toContain('kN');
});
