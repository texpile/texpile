// W7's slice (design 20.2): an inline and a display formula drawn on the canvas in LaTeX, Typst and Markdown, read
// through the probe: KaTeX glyphs inside the formula's box, the inline one on its line's baseline, the display centered
import { expect, test } from '@playwright/test';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, probeErrors, settled } from '../canvasPage';

type Language = { file: string; text: string; inline: string; display: string; glyph: string };

const LANGUAGES: Language[] = [
	{
		file: 'slice.tex',
		text: [
			'\\documentclass{article}',
			'\\begin{document}',
			'An inline formula $E = mc^2$ in its line.',
			'',
			'\\[',
			'\\int_0^1 x \\, dx = \\frac{1}{2}',
			'\\]',
			'',
			'The last paragraph.',
			'\\end{document}',
			''
		].join('\n'),
		inline: 'E = mc^2',
		display: '\\int_0^1 x \\, dx = \\frac{1}{2}',
		glyph: '∫'
	},
	{
		file: 'slice.typ',
		text: ['An inline formula $E = m c^2$ in its line.', '', '$ integral_0^1 x dif x = 1/2 $', '', 'The last paragraph.', ''].join('\n'),
		inline: 'E = m c^2',
		display: 'integral_0^1 x dif x = 1/2',
		glyph: '∫'
	},
	{
		file: 'slice.md',
		text: [
			'An inline formula $E = mc^2$ in its line.',
			'',
			'$$',
			'\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}',
			'$$',
			'',
			'The last paragraph.',
			''
		].join('\n'),
		inline: 'E = mc^2',
		display: '\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}',
		glyph: '∑'
	}
];

const ROWS_TEX = [
	'\\documentclass{article}',
	'\\begin{document}',
	'Three rows, the first unnumbered.',
	'',
	'\\begin{align}',
	'a &= 1 \\nonumber \\\\',
	'b &= \\frac{1}{2} \\\\',
	'c &= 3',
	'\\end{align}',
	'\\end{document}',
	''
].join('\n');

const texpile = useTexpile({
	files: { ...Object.fromEntries(LANGUAGES.map((language) => [language.file, language.text])), 'rows.tex': ROWS_TEX }
});

type FormulaDrawing = {
	box: { left: number; top: number; width: number; height: number };
	glyphs: { text: string; font: string; left: number; right: number; color: string }[];
};

/** the formula nodes' positions in document order, each with its top-level block */
function formulas(visual: VisualEditor): Promise<{ type: string; pos: number; block: number; source: string }[]> {
	return inCanvas(visual.page, ({ view }) => {
		const found: { type: string; pos: number; block: number; source: string }[] = [];
		view.state.doc.forEach((block, offset) => {
			if (block.type.name === 'block_math') found.push({ type: 'block_math', pos: offset, block: offset, source: block.textContent });
			block.descendants((node, pos) => {
				if (node.type.name === 'inline_math')
					found.push({ type: 'inline_math', pos: offset + 1 + pos, block: offset, source: node.textContent });
			});
		});
		return found;
	});
}

/** what the block's paint drew inside the formula's box, in client px, left to right: glyph runs paint grouped by font */
function drawing(visual: VisualEditor, formula: { pos: number; block: number }): Promise<FormulaDrawing> {
	return inCanvas(
		visual.page,
		({ probe, view }, at) => {
			const node = probe.rectOfNode(at.pos)!;
			const box = probe
				.query('.math-formula')
				.map((each) => each.rect)
				.find(
					(rect) => rect.left >= node.left - 1 && rect.right <= node.right + 1 && rect.top >= node.top - 1 && rect.bottom <= node.bottom + 1
				)!;
			const glyphs = probe
				.drawList(at.block)
				.filter((op) => op.op === 'fillText' && /KaTeX_/.test(op.font ?? ''))
				.map((op) => ({ op, rect: view.canvas.clientRect(op.rect) }))
				.filter(({ rect }) => rect.left >= box.left - 1 && rect.left <= box.right + 1 && rect.top < box.bottom && rect.bottom > box.top)
				.map(({ op, rect }) => ({ text: op.text!, font: op.font!, left: rect.left, right: rect.right, color: op.color! }))
				.sort((a, b) => a.left - b.left);
			return { box: { left: box.left, top: box.top, width: box.width, height: box.height }, glyphs };
		},
		formula
	);
}

for (const language of LANGUAGES) {
	test(`${language.file}: an inline and a display formula are drawn`, async () => {
		const visual = new VisualEditor(texpile().page, texpile().root);
		await visual.open(language.file);
		await settled(visual.page);

		const found = await formulas(visual);
		expect(found.map((formula) => [formula.type, formula.source])).toEqual([
			['inline_math', language.inline],
			['block_math', language.display]
		]);
		const [inline, display] = found;

		const inlineDrawing = await drawing(visual, inline);
		expect(inlineDrawing.box.width, 'the inline formula has a size').toBeGreaterThan(20);
		expect(inlineDrawing.glyphs.map((glyph) => glyph.text).join('')).toMatch(/E.*=.*m.*c.*2/);
		expect(inlineDrawing.glyphs.some((glyph) => glyph.font.includes('KaTeX_Math'))).toBe(true);

		// the formula sits on its line's baseline: its E on the text's baseline
		const sameBaseline = await inCanvas(
			visual.page,
			({ probe }, at) => {
				const line = probe.lines(at.block)[0];
				const ops = probe.drawList(at.block).filter((op) => op.op === 'fillText');
				const word = ops.find((op) => op.text?.includes('inline'));
				const letter = ops.find((op) => op.text === 'E' && /KaTeX_Math/.test(op.font ?? ''));
				return { line: line.baseline, word: word && word.rect.y + word.rect.height, letter: letter && letter.rect.y + letter.rect.height };
			},
			inline
		);
		expect(sameBaseline.letter).toBeDefined();
		expect(Math.abs(sameBaseline.letter! - sameBaseline.word!)).toBeLessThan(1.5);

		const displayDrawing = await drawing(visual, display);
		expect(displayDrawing.glyphs.map((glyph) => glyph.text).join('')).toContain(language.glyph);
		const container = await inCanvas(visual.page, ({ probe }, at) => probe.rectOfNode(at)!.toJSON() as DOMRect, display.pos);
		const middle = displayDrawing.box.left + displayDrawing.box.width / 2;
		expect(Math.abs(middle - (container.left + container.width / 2)), 'the display is centered in its block').toBeLessThan(1);
		expect(displayDrawing.box.height).toBeGreaterThan(inlineDrawing.box.height);

		expect(await probeErrors(visual.page)).toEqual([]);
	});

	test(`${language.file}: a formula typed beside, selected, inserted and undone keeps being drawn`, async () => {
		const visual = new VisualEditor(texpile().page, texpile().root);
		await visual.open(language.file);
		await settled(visual.page);
		const [inline] = await formulas(visual);
		const before = (await drawing(visual, inline)).glyphs.length;

		// a click on the formula selects it and draws the field's frame around it
		const center = await inCanvas(
			visual.page,
			({ probe }, at) => {
				const rect = probe
					.query('.math-formula')
					.map((each) => each.rect)
					.find((rect) => rect.top < probe.rectOfNode(at)!.bottom)!;
				return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
			},
			inline.pos
		);
		await visual.page.mouse.click(center.x, center.y);
		await settled(visual.page);
		expect(await inCanvas(visual.page, ({ view }) => view.state.selection.toJSON())).toMatchObject({ type: 'node', anchor: inline.pos });
		expect(await inCanvas(visual.page, ({ probe }) => probe.query('.math-selected').length)).toBe(1);

		// Escape leaves it with the caret after it, where typing moves the words along and the formula stays drawn
		await visual.press('Escape');
		await visual.type(' zq');
		await settled(visual.page);
		expect(await inCanvas(visual.page, ({ probe }) => probe.query('.math-selected').length)).toBe(0);
		expect((await drawing(visual, inline)).glyphs.length).toBe(before);

		// a formula just inserted is drawn as one read from the file
		const inserted = await inCanvas(visual.page, ({ view }) => {
			const { state } = view;
			const node = state.schema.nodes.inline_math.create(null, state.schema.text('x^2'));
			view.dispatch(state.tr.insert(state.selection.head, node));
			return state.selection.head;
		});
		await settled(visual.page);
		const insertedGlyphs = (await drawing(visual, { pos: inserted, block: inline.block })).glyphs.map((glyph) => glyph.text);
		expect(insertedGlyphs).toEqual(['x', '2']);

		await visual.press('ControlOrMeta+z');
		await visual.press('ControlOrMeta+z');
		await settled(visual.page);
		expect((await formulas(visual)).map((formula) => formula.source)).toEqual([language.inline, language.display]);
		expect((await drawing(visual, inline)).glyphs.length).toBe(before);
		expect(await probeErrors(visual.page)).toEqual([]);
	});
}

// the draw list records a run's box from its baseline up 0.8 em (drawListRecorder.ts)
const baselineOf = (rect: { y: number; height: number }) => rect.y + 0.8 * rect.height;

test('A12: an align draws each number on the baseline of its row and none on a \\nonumber row', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('rows.tex');
	await settled(visual.page);
	const drawn = await inCanvas(visual.page, ({ probe, view }) => {
		let block = -1;
		view.state.doc.forEach((node, offset) => {
			if (node.type.name === 'block_math') block = offset;
		});
		const ops = probe.drawList(block).filter((op) => op.op === 'fillText');
		const rows = ['a', 'b', 'c'].map((name) => ops.find((op) => op.text === name && /KaTeX_/.test(op.font ?? ''))!.rect);
		const numbers = ops.filter((op) => /^\(\d+\)$/.test(op.text ?? '')).map((op) => ({ text: op.text!, rect: op.rect }));
		return { rows, numbers };
	});
	expect(drawn.numbers.map((number) => number.text)).toEqual(['(1)', '(2)']);
	expect(Math.abs(baselineOf(drawn.numbers[0].rect) - baselineOf(drawn.rows[1])), 'on the second row').toBeLessThanOrEqual(1);
	expect(Math.abs(baselineOf(drawn.numbers[1].rect) - baselineOf(drawn.rows[2])), 'on the third row').toBeLessThanOrEqual(1);
	expect(await probeErrors(visual.page)).toEqual([]);
});
