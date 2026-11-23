// W6's slice (design 20.2): a 3 by 3 table typed into and walked with Tab and arrows in LaTeX, Typst and Markdown. The
// cells stand side by side as the DOM editor laid them out, and every key lands where the DOM editor's did: the walks
// were recorded live from canvas/p0-dom at 1280 by 860, the window P0 captured in
import { expect, test } from '@playwright/test';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, probeErrors, settled } from '../canvasPage';

type Slice = {
	file: string;
	text: string;
	/** the first table's column widths in the DOM editor */
	columns: number[];
	/** the position at the start of the cell holding `a` */
	start: number;
	/** key, then the selection's anchor and head and the text of the cell holding the head ('-' outside a table) */
	walk: string[];
};

const WINDOW: [number, number] = [1280, 860];

const SLICES: Slice[] = [
	{
		file: 'slice.tex',
		text: [
			'\\documentclass{article}',
			'\\begin{document}',
			'A paragraph before the table.',
			'',
			'\\begin{table}[h]',
			'\\centering',
			'\\caption{Three by three}',
			'\\begin{tabular}{|l|c|r|}',
			'\\hline',
			'a & b & c \\\\',
			'\\hline',
			'd & e & f \\\\',
			'g & h & i \\\\',
			'\\hline',
			'\\end{tabular}',
			'\\end{table}',
			'',
			'Between the tables.',
			'',
			'\\begin{tabular}{lcr}',
			'one & two & three \\\\',
			'four & five & six \\\\',
			'seven & eight & nine \\\\',
			'\\end{tabular}',
			'',
			'A paragraph after.',
			'\\end{document}',
			''
		].join('\n'),
		columns: [100, 100, 100],
		start: 52,
		walk: [
			'End 53 53 a',
			'T:X 54 54 aX',
			'Tab 58 59 b',
			'T:Y 59 59 Y',
			'Tab 63 64 c',
			'Tab 70 71 d',
			'ArrowLeft 70 70 d',
			'ArrowRight 71 71 d',
			'ArrowDown 87 87 g',
			'ArrowDown 104 104 -',
			'ArrowUp 97 97 i',
			'ArrowRight 98 98 i',
			'ArrowRight 104 104 -',
			'ArrowRight 105 105 -',
			'ArrowUp 97 97 i',
			'Shift+Tab 92 93 h',
			'Shift+Tab 87 88 g',
			'ArrowDown 92 92 h',
			'ArrowDown 104 104 -',
			'ArrowDown 128 128 one'
		]
	},
	{
		file: 'slice.typ',
		text: [
			'A paragraph before the table.',
			'',
			'#figure(',
			'  table(',
			'    columns: 3,',
			'    [a], [b], [c],',
			'    [d], [e], [f],',
			'    [g], [h], [i],',
			'  ),',
			'  caption: [Three by three],',
			')',
			'',
			'Between the tables.',
			'',
			'#table(',
			'  columns: 3,',
			'  [one], [two], [three],',
			'  [four], [five], [six],',
			'  [seven], [eight], [nine],',
			')',
			'',
			'A paragraph after.',
			''
		].join('\n'),
		columns: [100, 100, 100],
		start: 36,
		walk: [
			'End 37 37 a',
			'T:X 38 38 aX',
			'Tab 42 43 b',
			'T:Y 43 43 Y',
			'Tab 47 48 c',
			'Tab 54 55 d',
			'ArrowLeft 54 54 d',
			'ArrowRight 55 55 d',
			'ArrowDown 71 71 g',
			'ArrowDown 87 87 -',
			'ArrowUp 81 81 i',
			'ArrowRight 82 82 i',
			'ArrowRight 87 87 -',
			'ArrowRight 88 88 -',
			'ArrowUp 81 81 i',
			'Shift+Tab 76 77 h',
			'Shift+Tab 71 72 g',
			'ArrowDown 76 76 h',
			'ArrowDown 87 87 -',
			'ArrowDown 123 123 -'
		]
	},
	{
		file: 'slice.md',
		text: [
			'A paragraph before the table.',
			'',
			'| a | b | c |',
			'| --- | --- | --- |',
			'| d | e | f |',
			'| g | h | i |',
			'',
			'A paragraph after.',
			''
		].join('\n'),
		columns: [253, 253, 253],
		start: 35,
		walk: [
			'End 36 36 a',
			'T:X 37 37 aX',
			'Tab 41 42 b',
			'T:Y 42 42 Y',
			'Tab 46 47 c',
			'Tab 53 54 d',
			'ArrowLeft 53 53 d',
			'ArrowRight 54 54 d',
			'ArrowDown 70 70 g',
			'ArrowDown 86 86 -',
			'ArrowUp 80 80 i',
			'ArrowRight 81 81 i',
			'ArrowRight 86 86 -',
			'ArrowRight 87 87 -',
			'ArrowUp 80 80 i',
			'Shift+Tab 75 76 h',
			'Shift+Tab 70 71 g',
			'ArrowDown 75 75 h',
			'ArrowDown 86 86 -',
			'ArrowDown 104 104 -'
		]
	}
];

const texpile = useTexpile({ files: Object.fromEntries(SLICES.map((slice) => [slice.file, slice.text])) });

type CellRect = { text: string; left: number; top: number; width: number; height: number };

/** the first table's cells in the order they were written, in client px */
function firstTableCells(visual: VisualEditor): Promise<CellRect[]> {
	return inCanvas(visual.page, ({ probe }) =>
		probe
			.query('td, th')
			.slice(0, 9)
			.map((cell) => ({ text: cell.text, left: cell.rect.left, top: cell.rect.top, width: cell.rect.width, height: cell.rect.height }))
	);
}

/** the selection as the walks write it */
function selectionNow(visual: VisualEditor): Promise<string> {
	return inCanvas(visual.page, ({ view }) => {
		const { selection } = view.state;
		const { $head } = selection;
		let cell = '-';
		for (let depth = $head.depth; depth > 0; depth--)
			if (/^table_(cell|header)$/.test($head.node(depth).type.name)) cell = $head.node(depth).textContent;
		return `${selection.anchor} ${selection.head} ${cell}`;
	});
}

/** the collapsed rules the table block paints between columns: one vertical fill per inner column edge, in client px */
function innerColumnRules(visual: VisualEditor): Promise<number[]> {
	return inCanvas(visual.page, ({ probe, view }) => {
		let block = -1;
		view.state.doc.forEach((node, offset) => {
			if (block < 0 && (node.type.name === 'table' || node.firstChild?.type.name === 'table' || node.lastChild?.type.name === 'table'))
				block = offset;
		});
		const edges = probe
			.query('td, th')
			.slice(1, 3)
			.map((cell) => cell.rect.left);
		return edges.filter((edge) =>
			probe.drawList(block).some((op) => {
				if (op.op !== 'fillRect' || op.rect.width > 2) return false;
				const rect = view.canvas.clientRect(op.rect);
				return Math.abs(rect.left + rect.width / 2 - edge) < 1 && rect.height > 20;
			})
		);
	});
}

for (const slice of SLICES) {
	test(`${slice.file}: a 3 by 3 table is laid out, typed into and walked with Tab and arrows`, async () => {
		const { app, page, root } = texpile();
		await app.evaluate(({ BrowserWindow }, [width, height]) => BrowserWindow.getAllWindows()[0].setContentSize(width, height), WINDOW);
		const visual = new VisualEditor(page, root);
		await visual.open(slice.file);
		await settled(page);

		const cells = await firstTableCells(visual);
		expect(cells.map((cell) => cell.text)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
		for (let row = 0; row < 3; row++) {
			const three = cells.slice(row * 3, row * 3 + 3);
			expect(
				three.map((cell) => Math.round(cell.width)),
				`row ${row} column widths`
			).toEqual(slice.columns);
			expect(new Set(three.map((cell) => cell.top)).size, `row ${row} side by side`).toBe(1);
			expect(three[1].left - three[0].left).toBeCloseTo(three[0].width, 1);
		}
		expect(await innerColumnRules(visual), 'the rules between the columns are drawn').toHaveLength(2);

		const point = await inCanvas(page, ({ probe }, pos) => probe.clientPointOf(pos, 1), slice.start);
		await page.mouse.click(point.x + 1, point.y);
		await settled(page);
		expect(await selectionNow(visual)).toBe(`${slice.start} ${slice.start} a`);
		const landed: string[] = [];
		for (const row of slice.walk) {
			const key = row.split(' ')[0];
			if (key.startsWith('T:')) await page.keyboard.type(key.slice(2));
			else await page.keyboard.press(key);
			await settled(page);
			landed.push(`${key} ${await selectionNow(visual)}`);
		}
		expect(landed).toEqual(slice.walk);

		// the two typed words undo one at a time, the cells as the file had them
		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+z');
		await settled(page);
		expect((await firstTableCells(visual)).map((cell) => cell.text)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
		expect(await probeErrors(page)).toEqual([]);
	});

	test(`${slice.file}: a table just inserted is walked with Tab and arrows`, async () => {
		const { app, page, root } = texpile();
		await app.evaluate(({ BrowserWindow }, [width, height]) => BrowserWindow.getAllWindows()[0].setContentSize(width, height), WINDOW);
		const visual = new VisualEditor(page, root);
		await visual.open(slice.file);
		await settled(page);
		const end = await inCanvas(page, ({ probe }) =>
			probe.clientPointOf(probe.posOf('A paragraph after.') + 'A paragraph after.'.length, -1)
		);
		await page.mouse.click(end.x - 1, end.y);
		await page.locator('button[aria-label="Insert table"]').first().click();
		await page.locator('button[aria-label="Insert 3×3 table"]').first().click();
		await settled(page);

		const first = await inCanvas(page, ({ view, probe }) => {
			let table = -1;
			view.state.doc.descendants((node, pos) => {
				if (node.type.name === 'table') table = pos;
			});
			const start = table + 4;
			return { start, point: probe.clientPointOf(start, 1) };
		});
		await page.mouse.click(first.point.x + 2, first.point.y);
		await settled(page);
		for (const key of ['T:p', 'Tab', 'T:q', 'Tab', 'T:r', 'Tab', 'T:s', 'ArrowDown', 'T:t']) {
			if (key.startsWith('T:')) await page.keyboard.type(key.slice(2));
			else await page.keyboard.press(key);
		}
		await settled(page);
		const texts = await inCanvas(page, ({ probe }) => probe.query('td, th').map((cell) => cell.text));
		expect(texts.slice(-9)).toEqual(['p', 'q', 'r', 's', '', '', 't', '', '']);
		const grid = await inCanvas(page, ({ probe }) =>
			probe
				.query('td, th')
				.slice(-9)
				.map((cell) => [Math.round(cell.rect.left), Math.round(cell.rect.top)])
		);
		expect(new Set(grid.map(([left]) => left)).size, 'three columns').toBe(3);
		expect(new Set(grid.map(([, top]) => top)).size, 'three rows').toBe(3);
		expect(await probeErrors(page)).toEqual([]);
	});
}
