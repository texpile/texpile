import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { inCanvas, settled } from './canvasPage';

const NOTES = [
	'# Notes',
	'',
	'Plain words with $e^{i\\pi} + 1 = 0$ inside.',
	'',
	'- [ ] buy milk',
	'- [x] write notes',
	'',
	'| Name | Value |',
	'| ---- | ----- |',
	'| a    | 1     |',
	'',
	'```js',
	'const x = 1;',
	'```',
	''
].join('\n');

const texpile = useTexpile({ files: { 'notes.md': NOTES } });

test('a Markdown file draws its heading, formula, task list, table and code, and a task box toggles in the file', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	const { page } = visual;
	await visual.open('notes.md');
	await settled(page);
	const drawn = await inCanvas(page, ({ probe }) => {
		const size = (selector: string) => probe.query(selector)[0]?.rect.height ?? 0;
		return {
			heading: size('h1'),
			paragraph: size('p'),
			formulas: probe.query('.math-formula').length,
			boxes: probe.query('input').map((box) => box.attrs.checked !== undefined),
			cells: probe.query('td, th').length,
			code: probe.query('.cm-wrapper').length
		};
	});
	expect(drawn.heading, 'the heading stands taller than a paragraph line').toBeGreaterThan(drawn.paragraph);
	expect(drawn.formulas).toBe(1);
	expect(drawn.boxes).toEqual([false, true]);
	expect(drawn.cells).toBe(4);
	expect(drawn.code).toBe(1);

	const box = await inCanvas(page, ({ probe }) => {
		const rect = probe.query('input')[0].rect;
		return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
	});
	await page.mouse.click(box.x, box.y);
	await expect.poll(() => fs.readFileSync(path.join(texpile().root, 'notes.md'), 'utf8')).toContain('- [x] buy milk');
});

// the DOM Markdown editor drew a fence as CodeMirror's card, and outlined raw source only, never a code block
test('a fenced block is a card, with no frame while the caret is in it', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	const { page } = visual;
	await visual.open('notes.md');
	await visual.caretAfter('const x');
	await settled(page);
	const ops = await inCanvas(page, ({ view, probe }) => {
		let pos = -1;
		view.state.doc.descendants((node, at) => {
			if (node.type.name === 'code_block') pos = at;
		});
		return probe.drawList(pos).map((op) => ({ op: op.op, color: (op as { color?: string }).color ?? '' }));
	});
	expect(ops.filter((op) => op.op === 'line').length, 'the card border').toBeGreaterThan(0);
	expect(
		ops.filter((op) => /0\.45\)$/.test(op.color)),
		'no island frame'
	).toEqual([]);
});
